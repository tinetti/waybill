# Docket-scoped stamps

Date: 2026-09-07
Status: approved, not yet implemented

## Problem

Waybill reports the wrong leg in any repository that has shipped ideation papers on disk.

The `refine` and `contract` legs are stamped by globs — `docs/ideation/*/contract-data.json`
(`bookings/ideation-refine.md:7`) and `docs/ideation/*/contract.md`
(`bookings/ideation-contract.md:7`) — resolved against the working tree by `stampedByPath`
(`src/bookings.js:148-152`). A glob over `docs/` cannot distinguish a paper that belongs to the
change in flight from one that shipped six commits ago, so history stamps the walk.

In this repository the effect is immediate. On a clean `main`:

    main · leg 2 of 7 (bay)
      ✓ ideate  ✓ refine  ✓ contract
      ▶ bay

Every one of those ✓ marks is false. The only contract on disk,
`docs/ideation/pitwall/contract.md`, is the contract for building Waybill itself, already merged.
`ideate` is not stamped at all — it is inferred true because a later leg looks done
(`src/legs.js:99-101`).

Cutting a bay does not help, because a bay is a worktree of the same repository and the shipped
papers are present there too. A brand-new bay with zero changes reports:

    feat/docket-scoped-stamps · leg 5 of 7 (specs)
      ✓ ideate  ✓ bay  ✓ refine  ✓ contract
      ▶ specs

The waybill that a false position produces is not merely cosmetic. On `main` it names
`/waybill:start` with no argument, and `src/bay.js:224-226` rejects an empty branch name outright —
the tool hands the operator a command that cannot succeed.

## Decisions

1. **A docket is the branch.** A docket is open when the current branch is not the base branch.
   No state file. Git already tracks what is in flight; Waybill keeps re-deriving from repository
   reality, just more sharply.
2. **The base branch is always resolvable.** `defaultBranch` never returns null and never falls
   back to the current branch.
3. **Ideate is pre-docket.** The base branch always reports "no docket open" and points at ideate.
   Ideating produces papers; cutting the bay opens the docket and the papers travel as the
   branch's first diff.
4. **Stamps resolve against the branch's diff.** A `stampPath` glob matches only paths that differ
   from the merge-base with the base branch.

Rejected: scoping globs to a change slug (requires reconciling branch names with ideation
directory names — a new invariant with nothing to enforce it), and gating the walk on
docket-open while leaving globs alone (fixes the `main` symptom, leaves the bay case untouched).

## Design

### 1. Docket identity and the empty state

`RepoState` gains one derived boolean, `docketOpen`:

    docketOpen = Boolean(branch) && branch !== base

This is the predicate `ideateIsDone` (`src/legs.js:99-101`) and `cleanupIsDone`
(`src/legs.js:84`) already compute inline; it is lifted out and named once. The `Boolean(branch)`
guard matters — `currentBranch` is null on a detached HEAD (`src/repo.js:86-88`), and `null !==
"main"` would otherwise report a docket open with no branch to hang it on.

An earlier draft added `|| inBay(cwd)` to rescue the remoteless case, where the old
self-referential `defaultBranch` made `branch === base` unconditionally true. Making
`defaultBranch` robust (section 2) removes that need: a remoteless repo on `feat/x` resolves a base
of `main` and opens the docket without help. The `inBay` clause would then only add a wrong
answer — a worktree with the base branch checked out is not a docket — so it is dropped.

No second code path is required for the empty state. Once diff-scoping removes the false
positives, a clean base branch already walks to leg 1: every `stampPath` leg reports not-done
because nothing differs from the base, and `ideateIsDone` is false, so `done.indexOf(false)`
lands on `ideate` (`src/inference.js:92-106`). "No docket open" is a relabel of a state the walk
already reaches.

`header` (`src/waybill.js:44-52`) reads `docketOpen`:

- false — print `<branch> · no docket open` and suppress the leg strip.
- true — print today's `<branch> · leg N of 7 (<leg>)` with the strip.

`state.leg` must remain `ideate` in the no-docket case. It cannot be emptied to signal the state,
because `header` already reads `leg === null` as "all 7 legs complete" and `nextBlock` early-returns
on it (`src/waybill.js:98`). `nextBlock` reads only `leg`, `booking`, `changeId` and `branch` —
never the index — so suppressing the position and the strip touches nothing else.

Rendered output on a clean base branch, from `bookings/ideation-ideate.md`:

    main · no docket open

    NEXT:
      /clear, then run:
      /ideation:brainstorm
      └ opus · high effort

      <booking body>

### 2. Base branch resolution

`defaultBranch` (`src/repo.js:108-112`) currently falls back to the *current* branch when
`origin/HEAD` does not resolve, which makes `branch === base` unconditionally true in a remoteless
repository — a docket could never open there. Today that quietly breaks `ideateIsDone` and
`cleanupIsDone`; under this design it would become load-bearing.

New behaviour, in order:

1. `origin/HEAD`, stripped of the `origin/` prefix, when it resolves.
2. Otherwise the first of `main`, `master`, `trunk` that exists as a local branch.
3. Otherwise the literal `"main"`.

Never null, never the current branch. The probe matters: a bare `"main"` default would report a
docket open while standing on the trunk of a `master` repository — a new wrong answer where the
existing self-referential fallback happens to be right.

### 3. Diff-scoped stamps

One helper in `src/repo.js`, in the existing `tryGit` idiom (`src/repo.js:13-17` — cwd-first,
args as an array, trimmed stdout or null, never throws):

    changedPaths(cwd, base) → string[] | null

Three spawns:

1. `git merge-base <base> HEAD` — null means the refs share no history or the base ref does not
   exist. Return null: an explicit *unknown*, distinct from an empty array.
2. `git diff --name-only <mergeBase>` — every tracked path differing between the merge-base and
   the working tree: committed, staged and unstaged in one call.
3. `git ls-files --others --exclude-standard` — untracked files.

Both outputs need `.split('\n').filter(Boolean)`. An empty diff is the common case here and
`''.split('\n')` yields `['']`, unlike the existing multi-line callers at `src/repo.js:31,152,183`.

`stampedByPath` keeps its hand-rolled walker unchanged — `*`, `?` and `**` semantics are not
touched, and `deglob`/`paperPaths` (`src/inspection.js:31-49`) keeps consuming `stampPath` as it
does today. The single difference is that a walked match must also appear in the changed set.
Glob semantics stay in one place; docket scoping is a filter on top.

Path comparison: git prints worktree-root-relative paths, and stamps resolve against `state.root`
= `checkoutRoot` (`src/inference.js:89`), not `mainCheckout`. Git must run under the same anchor,
including the submodule anchoring at `src/inference.js:67-71`, so the two sets compare directly.
Normalise walker output to forward slashes before comparing.

**When the diff is unknown, stamp nothing.** If `changedPaths` returns null, every `stampPath` leg
reports not-done and Waybill pushes a warning through the existing `state.warnings` channel that
`withFindings` already renders (`src/waybill.js:146`). Falling back to matching anything on disk
would silently reinstate this bug. Visibly unable to tell beats invisibly wrong.

There is no caching in `src/` and `defaultBranch` and `inBay` already cost two spawns each, so
`changedPaths` is called once per run and its result threaded through `RepoState` rather than
recomputed per booking.

### 4. Known limitation: `stampCmd` is unscoped

`stampCmd` bookings receive no docket scoping. The `execute` leg greps
`openspec/changes/*/tasks.md` for unchecked boxes (`bookings/openspec-execute.md`) and can still
match a change directory left over from history. Scoping it would mean either exposing the changed
set to the command's environment or interpreting shell output — more machinery than this bug
justifies. `stampCmd` is opt-in and an author writing one is already taking responsibility for what
it matches; the three shipped `stampCmd: false` bookings are unaffected. Document it; leave it.

## Testing

TDD: each case below fails before the change and passes after.

`tests/repo.test.js`
- `defaultBranch` prefers `origin/HEAD`; falls back to an existing local `main`/`master`/`trunk`;
  returns `"main"` when none exist; never returns the current branch.
- `changedPaths` returns paths committed on the branch, staged, unstaged and untracked; returns
  `[]` on a branch identical to base; returns `null` when the base ref does not exist.

`tests/bookings.test.js` — primary target
- `stampedByPath` matches a glob only when the matched path is in the changed set (`:125-156`).
- A path present on disk but absent from the changed set does not stamp.
- Unknown changed set (null) stamps nothing.

`tests/inference.test.js`
- A repository whose history contains `docs/ideation/<slug>/contract.md`, on a clean base branch,
  reports `docketOpen: false` and leg 1 `ideate` — the regression this change exists to prevent.
- The same repository, in a fresh bay with no changes, reports leg 3 `refine`, not leg 5 `specs`.
- The shipped-booking invariants at `:73-107` still hold.

`tests/waybill.test.js` and `tests/golden/`
- No-docket header renders `<branch> · no docket open` with no strip and an intact NEXT block.
- Existing golden files re-generated where the header changes; `tests/fixtures/*.js` gain a
  no-docket fixture.

`tests/helpers/repo-fixture.js`
- New helper to build a repo whose *history* contains papers — commit them to the base branch
  before branching. No current fixture does this, which is why nothing caught the bug.

`tests/inspection-gitignore.test.js`
- `paperPaths` behaviour is unchanged; assert it still derives from `stampPath` via `deglob`
  (`:126-165`).

## Out of scope

- Scoping `stampCmd` (see Known limitation).
- The stale plugin install pinned at `da1097d` and the unset `CLAUDE_PLUGIN_ROOT`; separate work.
- `bookings/waybill-bay.md` declaring no `argument`, so `/waybill:start` renders bare. This design
  removes the case where a bare `/waybill:start` is *reached* on a clean base branch, but the
  booking's missing argument declaration is its own fix.
