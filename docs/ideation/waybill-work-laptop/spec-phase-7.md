# Implementation Spec: Waybill on the Work Laptop - Phase 7

**Contract**: ./contract.md
**Phase**: 7 — Work overlay and the live run
**Risk**: medium · **Blocking**: false
**Prereq**: Phase 6 — *Release and install the eight-leg route*
**Estimated Effort**: M

## Technical Approach

This phase writes almost nothing into the repository. Its deliverables are five markdown
bookings in a new machine-local directory, `~/.waybill/bookings`, plus one line of global git
config that points Waybill at them. Everything it changes lives on this laptop. The repo-side
change is a single new test case that proves the overlay mechanism carries the five carriers the
work route needs.

Two of those five exist because **work does not use OpenSpec — it uses ideation end to end.** The
stock legs 5 and 6 emit `/spec:propose` and `/spec:apply`; the work route rebooks them to
`/ideation:ideation` and `/ideation:execute-spec`. This is a rebooking, not a fork: Waybill still
*ships* the OpenSpec legs, and this machine still has `openspec` installed and `/spec:*` symlinked
(phase 1) because Waybill's own development follows the stock route. The overlay is the one place
the two opinions are allowed to differ.

The overlay is Waybill's designed extension point, not a workaround. `resolveBookings`
(src/bookings.js:137-148) loads the shipped `bookings/` and lays the configured directory over it
keyed by leg. **A leg the overlay binds is replaced *whole*, never merged key by key** — see the
contract comment at src/bookings.js:120-125 and the assertion at tests/bookings-overlay.test.js:105.
Every key the overlay omits is *gone*, not inherited: an overlay review booking with no `effort:`
line produces a booking with no effort, not the stock booking's effort. Each of the five files
below is therefore written as a complete booking, and each is copied from its shipped counterpart
and then edited, rather than written from the frontmatter keys alone. The two ideation bookings have
no shipped counterpart to copy for their *stamps* — those are new — but they still start as copies
of `bookings/openspec-specs.md` and `bookings/openspec-execute.md` so that no key is dropped by
omission.

The ordering hazard this phase sits behind is absolute. Slash commands run
`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"` (commands/status.md:33), so the *installed plugin cache*
is the runtime, not this working tree. `loadBookings` throws on a booking whose `leg` is not in the
installed `LEGS` (src/bookings.js:72-73), and that throw is in the loader tier — it is not caught
and reported as a warning, it propagates. Writing `leg: review` against a seven-leg installed
plugin therefore breaks *every* `/waybill:*` command on the machine until the file is deleted.
Phase 6 must be finished and the installed plugin must be confirmed reporting eight legs before the
first byte of the review overlay is written.

A second prerequisite is glab. The work GitLab is self-hosted and `glab auth status` currently
returns 401 against gitlab.com. Phase 1 fixes this. Until it does, the review overlay's stamp
cannot answer and the live run cannot open an MR. **Working `glab` auth against the self-hosted
work host is a prerequisite of this phase, not a step within it.**

## Feedback Strategy

**Inner-loop command**: `node --test tests/bookings-overlay.test.js`

**Playground**: The existing overlay test harness. tests/bookings-overlay.test.js already builds
throwaway overlay directories from inline booking strings (`overlayDir`, line 71) and isolates the
config tiers from the operator's real machine (`isolated`, line 37) — which matters enormously
here, because by the end of this phase the operator's machine *does* have a global
`waybill.bookingsdir`, and any test that failed to neutralise it would silently start asserting
against the work overlay.

**Why this approach**: The mechanically checkable half of this phase is "does the overlay bind the
carriers we intended", which is a pure `resolveBookings` question answerable in milliseconds from
inline fixtures. The other half — the live run — has no command and no loop.

## File Changes

### New Files — machine-local, outside any repository

| File Path                          | Purpose                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `~/.waybill/bookings/waybill-review.md`  | Rebinds `review` to `/mr-review`, stamp pinned to `glab`                |
| `~/.waybill/bookings/waybill-bay.md`     | Rebinds `bay` to name branches `JIRA-123/short-name`                    |
| `~/.waybill/bookings/waybill-cleanup.md` | Rebinds `cleanup` to `/mar`; a copy of `examples/mar-cleanup.md`        |
| `~/.waybill/bookings/ideation-specs.md`  | Rebinds `specs` to `/ideation:ideation`, stamped on the phase specs     |
| `~/.waybill/bookings/ideation-execute.md`| Rebinds `execute` to `/ideation:execute-spec`, stamped on ticked boxes  |

Filenames are arbitrary — `loadBookings` reads every `*.md` in the directory and keys on the
frontmatter `leg`, not on the basename (src/bookings.js:59-92). They are named after their shipped
counterparts so that a future `diff` against `bookings/` is one command.

### Modified Files — in the repository

| File Path                        | Changes                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/bookings-overlay.test.js` | One new `describe` block, *the work overlay*, asserting the five-carrier swap and the unset fallback |

### Machine state changed (not files in this repo)

| What                                   | Change                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| global git config                      | `waybill.bookingsdir` set to `~/.waybill/bookings`                   |
| the work repository                    | nothing is initialised. `docs/ideation/` appears when leg 3 first runs, and is left untracked and *not* excluded (see §7) |

### Deleted Files

None.

## Implementation Details

### 1. `~/.waybill/bookings/waybill-cleanup.md` — `/mar`

**Pattern to follow**: `examples/mar-cleanup.md` — this is already a worked version of exactly this
booking, written and kept honest by tests/bookings-overlay.test.js:229-250.

**Overview**: Routes cleanup to `/mar`, which merges the request as well as retiring the branch and
bay — the half `/waybill:cleanup` deliberately leaves to the forge.

**Implementation steps**:

1. `mkdir -p ~/.waybill/bookings`
2. `cp examples/mar-cleanup.md ~/.waybill/bookings/waybill-cleanup.md`
3. Change nothing else. `/mar` is confirmed present at `~/.claude/commands/mar.md`.

**Key decisions**:

- Copy rather than symlink into the worktree. A symlink into a bay dies when the bay is retired,
  and a symlink into the main checkout binds the machine's route to whichever branch is checked
  out there.
- The `stampCmd: false` is kept verbatim and is *deliberately* inert. `legIsDone` gives `cleanup`
  bespoke logic (src/inference.js:23) and never consults the booking's stamp at all — cleanup is
  stamped from repository state, the branch merged and the bay gone. This booking exists to supply
  the waybill: the command, the model, and the body.

### 2. `~/.waybill/bookings/waybill-bay.md` — `JIRA-123/short-name`

**Pattern to follow**: `bookings/waybill-bay.md`.

**Overview**: Same carrier (`/waybill:bay`), same inert `stampCmd: false` — `bay` is the other leg
with bespoke logic in `legIsDone` (src/inference.js:22) and is stamped from `git worktree list`.
The *only* thing this booking changes is the branch-naming instruction in its body.

```markdown
---
leg: bay
command: /waybill:bay
model: haiku
effort: low
handover: through
stampCmd: false
---
Cut the feature branch and its isolated bay, then move into it — every leg after this one happens
in the new bay. Pass the branch name as the argument, named for the ticket: `JIRA-123/short-name`,
the Jira key exactly as Jira spells it, uppercase, then a slash, then a few words of slug. The
prefix is load-bearing rather than decorative — `/commit` reads the ticket back out of the branch
name to prefix every commit message, and a branch named `feat/...` gives it nothing to read.

In a session, the handover it prints ends in `/waybill:next <branch>/<leg>`, which moves the next
session into the bay after `/clear`; in a terminal, read the `cd` line it prints instead.

This leg's `stampCmd` never succeeds on purpose ... [remainder verbatim from bookings/waybill-bay.md]
```

**Key decisions**:

- **This booking changes the instruction, not the suggestion.** `src/picker.js:158` hardcodes
  `` const branch = slug.includes('/') ? slug : `feat/${slug}` ``, and `normalize`
  (src/picker.js:88) lowercases, so the picker's tmux-window suggestion can never propose
  `JIRA-123/…` — a window named `EMRE-155/fix-clock` arrives as `emre-155/fix-clock`, lowercased.
  Nothing in this phase's scope changes `picker.js`, and nothing should: the overlay's job is to
  put the right instruction on the waybill, and the operator types the branch name. State this in
  the body rather than leaving the operator to discover the picker disagreeing with the waybill.
- The trailing three keys (`model`, `effort`, `handover`) are restated even though they are
  unchanged from stock. They have to be: whole-file replacement means an omitted `effort:` is an
  absent effort, not an inherited one.

### 3. `~/.waybill/bookings/waybill-review.md` — `/mr-review`, pinned to glab

**Pattern to follow**: `bookings/waybill-review.md` as shipped by phase 5.

**Overview**: Replaces the stock forge-detecting review booking with one that assumes GitLab,
because on this laptop every repository is GitLab and forge detection buys nothing but a branch to
get wrong. The carrier becomes the operator's own `/mr-review` skill (confirmed present at
`~/.claude/skills/mr-review`).

```markdown
---
leg: review
command: /mr-review
model: opus
effort: high
handover: transfer
stampCmd: command -v glab >/dev/null 2>&1 || exit 127; iid=$(glab mr view -F json --jq .iid 2>/dev/null) || exit 1; [ -n "$iid" ] && glab api "projects/:id/merge_requests/$iid/approvals" --jq '.approved_by|length' 2>/dev/null | grep -qE '^[1-9]'
---
Push the branch, open the merge request, and get it reviewed before anything is merged. `/mr-review`
fans an adversarial review across correctness, simplification, test coverage and security, converges
the fixes against a throwaway worktree, and only then posts DiffNotes — after you confirm. Nothing
is posted, and nothing is merged, without you saying so.

The leg is stamped by approval, not by the MR merely existing: an open unreviewed MR is exactly the
state this leg is here to move out of. If `glab` is missing the stamp exits 127 and Waybill warns by
name rather than reading the leg as honest work remaining.
```

**Key decisions**:

- **`command -v glab || exit 127` leads the stamp deliberately.** Phase 2 turns exit 127 into a
  visible warning naming the missing binary, but that only fires if 127 reaches
  `runStamp` (src/bookings.js:255). In a pipeline, a missing `glab` inside `$(…)` produces 127 *in
  the subshell* and then an empty `$iid`, so the outer command exits 1 and the warning never fires.
  The explicit guard re-raises it as the script's own exit status.
- **Approval, not existence, is the done-signal.** `glab mr view` alone would stamp the leg the
  instant the MR is opened, which is the moment before the work this leg names has happened.
- **Simpler alternative, rejected:** `stampCmd: glab mr view -F json --jq .state 2>/dev/null | grep -qx opened`.
  One line, no API call, no approval-rule assumptions. Rejected because it conflates "MR open" with
  "MR reviewed" — the exact conflation the contract's three-state goal exists to prevent. If the
  work instance's approval rules turn out not to be configured (so `approved_by` is always empty
  and the leg never stamps), fall back to counting non-system notes rather than to this.
- **Verify the stamp is consulted at all before trusting it.** `legIsDone` short-circuits `bay` and
  `cleanup` to bespoke logic and never reads their bookings' stamps. If phase 5 implemented
  `review` the same way, this `stampCmd` is inert and the overlay only rebinds the carrier. Check
  once: `grep -n "leg.id === 'review'" src/inference.js` — a hit means the stamp is inert, and the
  body above should say so rather than claiming a stamp that is not consulted.

**Feedback loop**:

- **Playground**: the work repo itself, with a real branch pushed and an MR open.
- **Experiment**: run the stamp by hand at three points — no MR yet, MR open and unapproved, MR
  approved — and confirm it exits non-zero, non-zero, zero in that order. Then rename `glab` off
  `PATH` for one invocation and confirm it exits 127.
- **Check command**: `sh -c "$(sed -n 's/^stampCmd: //p' ~/.waybill/bookings/waybill-review.md)"; echo "exit=$?"`

### 4. `~/.waybill/bookings/ideation-specs.md` — `/ideation:ideation`

**Pattern to follow**: `bookings/openspec-specs.md` for the frontmatter shape;
`bookings/ideation-contract.md` for how an ideation leg stamps on a paper under `docs/ideation/*/`.

**Overview**: Work's specs leg is ideation's, not OpenSpec's. `/ideation:ideation` carries the
interview through to implementation-ready phase specs, so the same carrier that serves legs 3 and 4
serves leg 5 — exactly as legs 3 and 4 already share one carrier and are separated only by stamp
(`tests/inference.test.js:98`).

```markdown
---
leg: specs
command: /ideation:ideation
model: opus
effort: high
handover: transfer
stampPath: docs/ideation/*/spec-phase-*.md
---
Turn the contract into implementation-ready phase specs, one per phase. Write every acceptance
item and manual check as a `- [ ]` checkbox: the execute leg is stamped by those boxes being
ticked, so a spec written in prose instead of checkboxes leaves the next leg with nothing to
finish against.
```

**Key decisions**:

- **`docs/ideation/*/spec-phase-*.md`, not `docs/ideation/*/`.** The stamp has to name an artifact
  leg 5 produces and leg 4 does not. `contract.md` and `contract-data.json` already exist by the
  time this leg starts, so a directory-level glob would stamp `specs` the moment `refine` finished.
- **The checkbox instruction is load-bearing, not style.** It is the sole input to leg 6's stamp
  (§5). `bookings/openspec-specs.md` carries the same instruction for the same reason; this is that
  sentence transposed, not a new idea.
- Three keys (`model`, `effort`, `handover`) are restated though unchanged from the shipped specs
  booking — whole-file replacement means an omitted key is an absent key.

**Feedback loop**

- **Playground**: `resolveBookings` through the overlay test harness.
- **Experiment**: with the overlay in force and a repo whose branch diff contains
  `docs/ideation/x/spec-phase-1.md`, `specs` reads done; with only `contract.md` in the diff, it
  reads not-done.
- **Check command**: `node --test tests/bookings-overlay.test.js`

### 5. `~/.waybill/bookings/ideation-execute.md` — `/ideation:execute-spec`

**Pattern to follow**: `bookings/openspec-execute.md`.

**Overview**: Rebinds `execute` to the ideation executor. This booking needs more care than the
other four, because the stock separation between legs 5 and 6 does not survive the swap.

**The problem this booking solves.** Legs 5 and 6 ship sharing one `stampPath`
(`openspec/changes/**/tasks.md`); they are told apart only by the `progress` gate on leg 6
(`src/legs.js:33`, `src/inference.js:30-37`), which holds the leg open until the docket's own task
count reads `total > 0 && done === total`. That gate reads a change id, and `discoverChangeId`
matches only the `openspec/changes/<id>/` prefix (`src/progress.js:98-133`). Under an ideation
booking there is no such path, so `changeId` is `null`, and `src/inference.js:37` short-circuits to
*the stamp decides*. **A path-only ideation leg 6 would therefore stamp in the same instant as leg
5, and the route would step over `execute` without it ever having run.** The fix is to give leg 6 a
stamp that measures completion rather than existence.

```markdown
---
leg: execute
command: /ideation:execute-spec
model: opus
effort: high
handover: transfer
argument: none
stampPath: docs/ideation/*/spec-phase-*.md
stampCmd: ls docs/ideation/*/spec-phase-*.md >/dev/null 2>&1 || exit 1; ! grep -qE '^[[:space:]]*- \[ \]' docs/ideation/*/spec-phase-*.md
---
Work the phase specs in order, test first, ticking each `- [ ]` box as it lands. This leg is
stamped by those boxes: while any box anywhere under `docs/ideation/*/spec-phase-*.md` is unticked,
the leg reads as work remaining. A phase is roughly one session's context — stop and hand the
docket on when what is left no longer fits, rather than running the session dry.

Progress reads `0 of 0` on this route rather than `n of m`. That is a display limit, not a broken
stamp: the count comes from `openspec/changes/`, which this route does not use.
```

**Key decisions**:

- **Both `stampPath` and `stampCmd`, deliberately.** `evaluateBooking` requires *both* to pass when
  both are present (`src/bookings.js:299-329`). The path half scopes the leg to specs that are in
  *this docket's* `changed` set, so a shipped spec from an earlier ticket cannot stamp a fresh
  docket; the command half asserts they are finished. Neither alone is sufficient — path alone
  stamps with leg 5, command alone would be satisfied by an unrelated repo with no specs at all.
- **The `ls` guard leads the stamp for the same reason the review booking's `command -v` guard
  does.** With no spec files the glob does not expand, `grep` exits 2, and the leading `!` would
  invert that failure into a pass. The guard turns "no specs" into an explicit exit 1.
- **`[[:space:]]` rather than `\s`.** The stamp runs through `/bin/sh`, and BSD `grep -E` on macOS
  does not honour `\s`. A stamp that silently never matches would read as permanently done.
- **`argument: none`, stated rather than inherited.** `DEFAULT_ARGUMENT` is `change-id`
  (`src/waybill.js:26`), which resolves to null here and is dropped — the right outcome by accident.
  Saying `none` makes it the right outcome on purpose, and survives anyone later teaching
  `discoverChangeId` about ideation paths.
- **Accepted cost: progress reads `0 of 0`.** Restoring a real `n of m` means making the count
  booking-driven instead of reading the `CHANGES = 'openspec/changes'` constant
  (`src/progress.js:6`) — a code change, out of scope here, and recorded in Open Items.

**Feedback loop**

- **Playground**: a scratch repo with a `docs/ideation/x/spec-phase-1.md` in its branch diff.
- **Experiment**: run the stamp by hand at three points — no spec files, specs with one unticked
  box, specs fully ticked — and confirm it exits 1, 1, 0 in that order. The middle case is the one
  that matters; it is the case a path-only stamp gets wrong.
- **Check command**: `sh -c "$(sed -n 's/^stampCmd: //p' ~/.waybill/bookings/ideation-execute.md)"; echo "exit=$?"`

### 6. Wiring the overlay up

```bash
git config --global waybill.bookingsdir '~/.waybill/bookings'
```

**Key decisions**:

- **Quote the tilde.** Unquoted, zsh expands `~` before git ever sees it and the config stores an
  absolute path — which works, but bakes this machine's home directory into a global setting.
  Quoted, git stores the literal `~/.waybill/bookings`, and Waybill expands it at read time:
  `configuredBookingsDir` reads this tier through `configPath` (src/bookings.js:114), which is
  `git config --type=path --get` (src/repo.js:30-32), and `--type=path` is precisely what expands a
  leading `~`. This tier is the one place a tilde already expands today, and
  tests/bookings-overlay.test.js:155 already pins that behaviour.
- `--global`, not per-repo. This is a standing statement about how *this machine* finishes work, and
  repeating it per repo is the duplication the contract rules out of scope.
- The path is `~/.waybill/bookings`, not the README's `~/.config/waybill/bookings` example. Both are
  arbitrary; nothing in Waybill defaults to either. Noted only so the divergence from README.md:303
  is deliberate rather than a typo.

### 7. Where the ideation papers live in a work repo

There is **no init step**. Ideation has no equivalent of `openspec init`: `docs/ideation/<slug>/`
simply appears the first time leg 3 runs. What still needs deciding is the same question the
OpenSpec route faced — whether those papers are committed, merely untracked, or excluded — and the
answer turns on the same mechanism.

**Decision: `docs/ideation/` stays untracked and *not* excluded. Nothing is committed to the
corporate repository.**

The contract rules committing a `.waybill/bookings` overlay into work repos out of scope because
"personal tool configuration does not belong in a corporate repository". The phase specs are a
closer call than OpenSpec's scaffolding was — they are genuine design documents about the work
itself, not merely per-ticket paperwork — but the default holds: a colleague reviewing the ticket's
MR should not have to review, or learn, one engineer's planning apparatus. So the question is
*exclude or merely leave untracked*, and those two are not interchangeable:

- `changedPaths` collects the docket's own diff from `git diff --name-only <merge-base>` plus
  **`git ls-files --others --exclude-standard`** (src/repo.js:311-312). `--exclude-standard` honours
  `.git/info/exclude`. An excluded, untracked file therefore appears in *neither* list, so it is
  never in `changed`, so `stampedByPath` can never match it (src/bookings.js:221-222 returns false
  for anything not in `changed`). Both the `specs` and `execute` bookings stamp on
  `stampPath: docs/ideation/*/spec-phase-*.md`. **Excluding `docs/ideation/` would silently
  guarantee that legs 5 and 6 never stamp and the route dead-ends at `contract`.** Left merely
  untracked, the same files *do* appear in `ls-files --others --exclude-standard`, and the stamps
  work.
- This applies to leg 3 and leg 4 as well, which stamp on `contract-data.json` and `contract.md`
  under the same directory. Excluding `docs/ideation/` breaks four legs, not two — the route would
  dead-end at `bay`.

**Accepted cost, named rather than fixed:** untracked `docs/ideation/` lives inside the bay, and the
bay is deleted at cleanup — so the contract and the phase specs do not survive the ticket. This cost
is higher than it was for OpenSpec, whose value was per-ticket scaffolding; an ideation contract is
a reasoned record of *why* the work is shaped as it is, and that is worth more a month later. Two
escape hatches, both deliberate: copy the papers out of the bay before cleanup, or propose
`docs/ideation/` to the team as its own MR with their agreement. Neither is smuggling it in under a
feature ticket.

**Also worth knowing:** `.git/info/exclude` is per-clone and does not travel between machines or
clones — already recorded in the contract's Future list for bays (src/bay.js:88). If a work repo
already excludes `docs/` or `docs/ideation/` for its own reasons, that exclusion is inherited and
must be found before the route is trusted.

**Implementation steps**:

1. Nothing to install or initialise. Confirm the repo does not already exclude the path:
   `git check-ignore -v docs/ideation/ ; echo "exit=$?"` — a non-zero exit means nothing excludes it,
   which is what this phase needs.
2. Confirm the consequence that matters: from a bay that has been through leg 5,
   `git ls-files --others --exclude-standard | grep -c 'docs/ideation/.*/spec-phase-.*\.md'` returns
   at least 1. If it returns 0, the specs and execute legs will never stamp.
3. Before cleanup retires the bay, decide whether these papers are being kept. That is a deliberate
   act; nothing in the route does it for you.

### 8. Repo-side test: the work overlay

**Pattern to follow**: the existing *worked cleanup example* block, tests/bookings-overlay.test.js:229-250.

Add one `describe('the work overlay', …)` using the file's existing `overlayDir` and `isolated`
helpers, with inline booking constants alongside `OVERLAID_CLEANUP`. Two cases:

1. With the overlay in force, `bookings.get('review').command === '/mr-review'`,
   `bookings.get('cleanup').command === '/mar'`, `bookings.get('specs').command ===
   '/ideation:ideation'`, `bookings.get('execute').command === '/ideation:execute-spec'`, the bay
   booking's body matches `/JIRA-123\//`, and `bookings.size` still equals
   `readdirSync('../bookings/').length` — the overlay rebound five legs and left none unbound.
2. With `WAYBILL_BOOKINGS_DIR` unset and `GIT_CONFIG_GLOBAL=/dev/null`, the stock bookings resolve
   unchanged: `review` is `/waybill:review`, `cleanup` is `/waybill:cleanup`, `specs` is
   `/spec:propose` and `execute` is `/spec:apply`.
3. `specs` and `execute` are bound to *different* stamps, not merely different commands: the
   execute booking carries a `stampCmd` and the specs booking does not. This is the assertion that
   would have caught the simultaneous-stamp bug described in §5, so write it deliberately rather
   than asserting on `command` alone.

**Key decisions**:

- **The test builds its own inline copy; it does not read `~/.waybill/bookings`.** A test that read
  the real directory would pass only on this laptop and fail in CI and on the personal machine —
  and would make the suite's verdict depend on machine state, which is the opposite of what a
  suite is for.
- The honest cost of that: the inline copy can drift from the real overlay, and nothing catches it.
  That is precisely the gap the Stretch `examples/` entry would close, since anything under
  `examples/` *is* in the repo and can be loaded by a test the way `mar-cleanup.md` already is.

**Feedback loop**:

- **Playground**: `tests/bookings-overlay.test.js` itself, driven through the file's existing
  `overlayDir` and `isolated` helpers — no real repo, no `~/.waybill/bookings`, no machine state.
- **Experiment**: one parameterized pair over the same assertions, differing only in whether the
  overlay is in force. Overlay set → `review` is `/mr-review`, `cleanup` is `/mar`, `specs` is
  `/ideation:ideation`, `execute` is `/ideation:execute-spec`, the bay body matches `/JIRA-123\//`,
  and `bookings.size` is unchanged. Overlay unset — no
  `WAYBILL_BOOKINGS_DIR`, and `GIT_CONFIG_GLOBAL=/dev/null` so the operator's now-real global
  `waybill.bookingsdir` cannot reach in → the stock
  `/waybill:review`, `/waybill:cleanup`, `/spec:propose` and `/spec:apply` resolve. Write the unset case **first** and watch it pass
  against today's tree; it is the regression guard, and a case that was never red proves nothing.
- **Check command**: `node --test tests/bookings-overlay.test.js` — seconds, against the ~173s full
  suite. Scope by file; never by `--test-name-pattern`, which exits 0 when it filters out every test.

### 9. Stretch, mentioned not specified

An `examples/` entry documenting the work overlay as a worked carrier swap, alongside
`mar-cleanup.md` and `superpowers-execute.md`, plus its row in the README.md:325 table. Out of this
phase's required scope; it is the natural follow-up and it would close the drift gap above.

## The live run

Drive **one real work ticket** through all eight legs. This is the project's acceptance and the one
criterion no command can prove.

| Leg | What the waybill should name | What "right" looks like |
| --- | --- | --- |
| 1 ideate | `/ideation:brainstorm` | The ticket is talked through before any branch exists; nothing is written to disk |
| 2 bay | `/waybill:bay` | You type `JIRA-123/short-name`; the bay appears and the session moves into it |
| 3 refine | `/ideation:ideation` | The interview pushes on scope and sequencing until the shape settles |
| 4 contract | `/ideation:ideation` | Criteria land as runnable commands, not adjectives |
| 5 specs | `/ideation:ideation` | `docs/ideation/<slug>/spec-phase-*.md` exist with tickable boxes; the leg stamps |
| 6 execute | `/ideation:execute-spec` | Boxes tick top to bottom, test first; the leg stays open until the last one is ticked. Progress reads `0 of 0`, not `n of m` — expected, see §5 |
| 7 review | `/mr-review` | Branch pushed, MR opened, review posted after you confirm |
| 8 cleanup | `/mar` | The MR is merged and the branch and bay are retired together |

**The pass condition is a judgment call.** It is: *at each leg, the waybill named the command you
would have reached for anyway.* There is no command that decides this, and this spec does not
invent one. The failure it is looking for is the one that does not raise an error — a waybill that
runs clean while naming a carrier you would have overridden, which is how a route quietly stops
being followed. Record the verdict per leg, in prose, when the ticket ships.

The mechanically checkable half is separate and is listed under Validation Commands: with the
overlay in force the route names `/mr-review` at review and `/mar` at cleanup, and with
`waybill.bookingsdir` unset the stock bookings resolve unchanged.

## Safety

- **The human drives the merge.** `/mr-review` posts nothing without confirmation and `/mar` merges
  nothing you have not approved. No agent merges a work MR.
- **No token or credential is printed, echoed, logged, or written to a file** at any point in this
  phase. `glab` is authenticated interactively by the human in phase 1; the stamps here call `glab`
  and read its *output*, never its stored token.
- **A stamp's stdout is user-visible — do not rely on it being discarded.** `stampCmd` used to run
  with `stdio: 'ignore'` (src/bookings.js:250), but phase 5 — this phase's prerequisite — changes
  `runStamp` to `stdio: ['ignore', 'pipe', 'ignore']` and quotes the stamp's **first stdout line**
  verbatim into a warning the operator reads on screen. So the containment is no longer structural;
  it is a rule these bookings must keep. Every `stampCmd` in this overlay must print nothing
  sensitive, and specifically must never echo a token, a full MR URL with a token embedded in it, or
  the output of `glab auth status`. The stamps specified above satisfy this: `cleanup` and `bay` are
  the silent `stampCmd: false`, `review` captures `glab mr view` into a shell variable and pipes the
  approvals count into `grep -q`, and `execute` redirects `ls` to `/dev/null` and uses `grep -q`, so
  nothing reaches stdout. Note that `execute`'s stamp reads the *contents* of the phase specs — keep
  credentials out of spec files, which is true anyway but is now load-bearing. Review any later edit
  against this rule before it lands.
- **`~/.waybill/bookings` is a new user-level config directory: machine-local and untracked by
  design.** That is the point of it — the work route must not leak onto the personal machine, and
  Waybill's own repo must not carry one operator's carriers. The consequence is that it is lost
  with the machine. That is recorded in the contract's Future list ("backing up or versioning the
  machine-local overlay") and is **not** a gap to fix in this phase.
- The live run touches a real work repository and opens a real merge request. Do it on a ticket
  small enough that an eight-leg first run is not also a risky change.

## Testing Requirements

### Unit Tests

| Test File                        | Coverage                                                             |
| -------------------------------- | -------------------------------------------------------------------- |
| `tests/bookings-overlay.test.js` | The five-carrier work overlay in force; stock resolution when unset   |

**Key test cases**:

- Overlay in force: `review` → `/mr-review`, `cleanup` → `/mar`, `specs` → `/ideation:ideation`,
  `execute` → `/ideation:execute-spec`, bay body names `JIRA-123/`.
- Overlay in force: `bookings.size` unchanged — five legs rebound, none unbound, none added.
- Overlay in force: `execute` carries a `stampCmd` and `specs` does not, so the two legs cannot
  stamp together.
- Overlay unset: `review` → `/waybill:review`, `cleanup` → `/waybill:cleanup`,
  `specs` → `/spec:propose`, `execute` → `/spec:apply`.
- Each case declares its own tiers through `isolated` and inherits none, so the operator's now-real
  global `waybill.bookingsdir` cannot reach into the assertions.

### Manual Testing

- [ ] Phase 6 confirmed first: `waybill help` names 8 legs, and `command -v waybill` resolves inside
      the newly installed plugin cache version — **before** writing the review overlay.
- [ ] `glab auth status` reports authenticated against the self-hosted work host (phase 1).
- [ ] `mkdir -p ~/.waybill/bookings`, write the five bookings.
- [ ] `git config --global waybill.bookingsdir '~/.waybill/bookings'`, then
      `git config --global --get waybill.bookingsdir` prints a literal `~/...`.
- [ ] In a work repo: `waybill next` runs without error and reports `leg N of 8`.
- [ ] In a work repo on the review leg: `waybill next` names `/mr-review`, not `/waybill:review`.
- [ ] In a work repo on the cleanup leg: `waybill next` names `/mar`, not `/waybill:cleanup`.
- [ ] On the waybill repo itself, with the global config now set: `waybill next` still works and
      the route is intact (the overlay is global, so it applies here too — confirm `/mar` and
      `/mr-review` are what you want on this repo as well, and if not, unset per-repo).
- [ ] In the work repo: `git check-ignore -v docs/ideation/` exits non-zero — nothing excludes the
      path, so legs 3–6 can stamp.
- [ ] From a bay that has been through leg 5:
      `git ls-files --others --exclude-standard | grep -c 'docs/ideation/.*/spec-phase-.*\.md'`
      returns at least 1.
- [ ] In a work repo on the specs leg: `waybill next` names `/ideation:ideation`, not `/spec:propose`.
- [ ] In a work repo on the execute leg: `waybill next` names `/ideation:execute-spec`, not `/spec:apply`.
- [ ] With one `- [ ]` left unticked in any phase spec, the execute leg still reads **not done**;
      tick the last box and it stamps. This is the check that proves legs 5 and 6 did not collapse
      into one.
- [ ] Execute-leg progress reads `0 of 0` and this is understood as a display limit, not a fault.
- [ ] Temporarily rename `glab` off `PATH` and run `waybill next` on the review leg: the warning
      names the missing binary rather than reading the leg as not-done.
- [ ] Drive one real ticket through all eight legs; record the per-leg judgment.

## Error Handling

| Error Scenario | Handling Strategy |
| -------------- | ------------------- |
| Overlay directory does not exist yet | Not an error. `loadBookings` reads an unreadable directory as empty (src/bookings.js:51-55); the stock route resolves. |
| `waybill.bookingsdir` set to a blank string | Not an answer; falls through to the stock bookings (src/bookings.js:115). |
| `glab` missing when the review stamp runs | Explicit `exit 127` guard → phase 2's warning names the binary. |
| `glab` present but unauthenticated (401) | Stamp exits non-zero, leg reads not-done. Distinguishable only by running `glab auth status` by hand — the overlay pins glab and deliberately does not re-implement the stock leg's three-state verdict. |
| Two overlay files claiming one leg | Throws `duplicate leg` at load (src/bookings.js:84). Five files, five distinct legs. |
| `openspec` absent when the work route runs | Irrelevant here by design — no leg in this overlay invokes it. It stays installed for Waybill's own stock route (phase 1), not for work. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| review overlay | **Machine-wide command outage** | The overlay declares `leg: review` while the *installed plugin* is still seven-leg | `loadBookings` throws `unknown leg` (src/bookings.js:72-73) from the loader tier — uncaught — and **every** `/waybill:*` command on the laptop fails | Phase 6 is a hard prereq. Recovery is `rm ~/.waybill/bookings/waybill-review.md` or `git config --global --unset waybill.bookingsdir` |
| review overlay | Inert stamp | Phase 5 gave `review` bespoke logic in `legIsDone` like `bay` and `cleanup` | The `stampCmd` is never consulted; the leg stamps on something else entirely and the booking's promise is fiction | `grep -n "leg.id === 'review'" src/inference.js` before trusting the stamp; if it hits, say so in the body |
| review overlay | Silent 127 | A missing `glab` inside `$(…)` yields an empty capture, and the outer command exits 1 | The "missing binary" warning never fires; the leg reads as honest work remaining forever | Lead the stamp with `command -v glab >/dev/null 2>&1 \|\| exit 127` |
| review overlay | Leg never stamps | The project has no approval rules, so `approved_by` is always empty | Review leg stays open after a genuine review; the route stalls at leg 7 | Fall back to counting non-system notes rather than to bare MR existence |
| review overlay | Mid-run auth expiry | The glab token expires between leg 2 and leg 7 | Stamp exits non-zero and is indistinguishable from "not reviewed yet" | Re-run `glab auth status` when review will not stamp; noted as the known ambiguity of a pinned single-forge stamp |
| bay overlay | **Picker contradicts the waybill** | `src/picker.js:158` hardcodes `feat/${slug}` and `normalize` lowercases | The picker offers `feat/x` or `emre-155/x` while the waybill says `JIRA-123/x`; `/commit` then finds no ticket to prefix with | Say it in the booking body; the operator types the branch rather than accepting the suggestion. Out of scope to change `picker.js` |
| bay overlay | Bay-path case collision | `resolveBayPath` maps `/` → `-` (src/repo.js:155), so `JIRA-123/fix` → `<repo>-JIRA-123-fix`; macOS APFS is case-insensitive by default | `JIRA-123/fix` and `jira-123/fix` resolve to the *same* bay directory — a second bay silently lands on the first | One canonical casing: the Jira key exactly as Jira spells it. Named, not guarded |
| bay overlay | Long paths | `JIRA-1234/some-quite-long-descriptive-slug` plus repo name plus `.claude/worktrees` | Unwieldy but valid bay directory names | Accept; keep slugs to a few words |
| ideation overlay | **Legs 5 and 6 stamp together** | An ideation `execute` booking given only a `stampPath`, sharing it with `specs` | `changeId` is null under ideation, so the `progress` gate short-circuits to "the stamp decides" (src/inference.js:37) and both legs complete at once — the route steps over `execute` without it running | The `execute` booking carries a completion `stampCmd` as well as the path; the overlay test asserts `specs` has no `stampCmd` and `execute` does |
| ideation overlay | Execute leg stamps while work remains | The spec's acceptance items were written as prose rather than `- [ ]` boxes | `grep` finds no unticked box, the stamp passes immediately, and execute is as vacuous as the path-only version | The `specs` booking body makes the checkbox instruction explicit; the manual check ticks the last box and watches the leg flip |
| ideation overlay | Execute leg never stamps | BSD `grep -E` on macOS does not honour `\s`, or the glob matched nothing and `!` inverted grep's exit 2 | Leg reads permanently done (glob case) or permanently not-done (`\s` case) — both silent | `[[:space:]]` not `\s`; the leading `ls` guard converts "no specs" into an explicit exit 1 |
| `docs/ideation/` decision | **Legs 3–6 never stamp** | `docs/ideation/` added to `.git/info/exclude`, or already excluded by the work repo | `--exclude-standard` drops it from `changed` (src/repo.js:312), so no `docs/ideation/*` stamp can ever match and the route dead-ends at `bay` | Leave it untracked and *not* excluded; `git check-ignore -v docs/ideation/` must exit non-zero before the route is trusted |
| `docs/ideation/` decision | Accidental commit into the work MR | A `git add -A` sweeps untracked `docs/ideation/` into the ticket's commit | Personal planning apparatus lands in a corporate MR and a colleague reviews paperwork | `/commit` stages named files rather than `-A`; review `git status --short` before pushing at leg 7 |
| `docs/ideation/` decision | Contract and specs lost at cleanup | `docs/ideation/` is untracked and lives inside the bay, which cleanup deletes | The reasoned record of why the work is shaped as it is does not survive the ticket — a worse loss than OpenSpec's per-ticket scaffolding was | Accepted and stated; copy the papers out before cleanup, or propose the directory to the team as its own MR |
| global config | Overlay leaks onto the waybill repo | `--global` applies to every repository on this machine, including this one | `/mar` and `/mr-review` become the carriers here too | Intended for this machine; if not wanted on a given repo, set `waybill.bookingsdir` to an empty-but-existing directory for that repo |
| `~/.waybill/bookings` | Lost with the machine | Untracked, unbacked-up, by design | The work route must be rebuilt from scratch on a new laptop | Named, not fixed — contract Future item |
| the live run | Passes vacuously | Every leg runs clean while naming a carrier you would have overridden | The route looks validated and is not | The judgment call is the check. Record a per-leg verdict in prose |

## Validation Commands

```bash
# Prereq — phase 6 landed and installed (run before writing the review overlay)
waybill help                     # names 8 legs
command -v waybill               # resolves inside the newly installed plugin cache version

# Prereq — phase 1 landed
glab auth status                 # authenticated against the self-hosted work host

# Overlay behaviour (never use --test-name-pattern: it exits 0 when it filters out every test)
node --test tests/bookings-overlay.test.js
node --test tests/

# On this machine, in a work repo
waybill next                     # reports "leg N of 8" and names the overlay's carrier

# The execute stamp, by hand — must exit 1 with any box unticked, 0 only when all are ticked
sh -c "$(sed -n 's/^stampCmd: //p' ~/.waybill/bookings/ideation-execute.md)"; echo "exit=$?"

# Nothing excludes the papers the stamps depend on (non-zero exit is the passing case)
git check-ignore -v docs/ideation/ ; echo "exit=$?"

# The live run
# No command. One real work ticket through all eight legs, and at each leg the waybill named the
# command you would have reached for anyway. This is a judgment call and there is no check for it.
```

## Rollout Considerations

- **Feature flag**: `git config --global --unset waybill.bookingsdir` is the off switch. The stock
  route resolves unchanged the moment it is unset, with no other cleanup.
- **Rollback plan**: unset the config, or `rm -rf ~/.waybill/bookings`. Either restores the stock
  eight-leg route, OpenSpec legs included. Nothing was installed into the work repo, so there is
  nothing to uninstall there — at most, delete an unwanted `docs/ideation/<slug>/`.
- **Monitoring**: none. This is one laptop.
- **Ordering**: phase 6 installed → phase 1's glab auth → overlay files → global config → the live
  run.

## Open Items

- [ ] Confirm the work GitLab project has approval rules configured; if not, switch the review
      stamp to counting non-system notes.
- [ ] Confirm phase 5 stamps `review` through the booking rather than through bespoke `legIsDone`
      logic, and correct the review booking's body if not.
- [ ] Decide whether execute-leg progress is worth restoring. `0 of 0` is accepted here; a real
      `n of m` means deriving the count from the booking's `stampPath` instead of the
      `CHANGES = 'openspec/changes'` constant (`src/progress.js:6`) and generalising
      `discoverChangeId` (`src/progress.js:98-133`). That is a code phase, and it pairs naturally
      with phase 4, which already de-hardcodes the leg count.
- [ ] The global overlay applies to Waybill's own repo too, so legs 5 and 6 become ideation legs
      here as well. That matches how this project is actually developed — phase 1 was executed with
      `/ideation:execute-spec`, not `/spec:apply` — but it means Waybill's stock OpenSpec route is
      no longer exercised by daily use on this machine. Decide whether that route needs a deliberate
      test run, or an `examples/` overlay that restores it per-repo.
- [ ] `docs/ideation/` is untracked in work repos and dies with the bay. Decide, before the first
      real ticket ships, whether the contract and specs are copied out at cleanup or accepted as
      disposable.

---

_This spec is ready for implementation. Phase 6 must be installed and confirmed first; writing the
review overlay before then breaks every `/waybill:*` command on the machine._
