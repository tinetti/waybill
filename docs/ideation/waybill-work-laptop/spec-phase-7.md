# Implementation Spec: Waybill on the Work Laptop - Phase 7

**Contract**: ./contract.md
**Phase**: 7 — Work overlay and the live run
**Risk**: medium · **Blocking**: false
**Prereq**: Phase 6 — *Release and install the eight-leg route*
**Estimated Effort**: M

## Technical Approach

This phase writes almost nothing into the repository. Its deliverables are three markdown
bookings in a new machine-local directory, `~/.waybill/bookings`, plus one line of global git
config that points Waybill at them, plus `openspec init` in the work repo. Everything it changes
lives on this laptop. The repo-side change is a single new test case that proves the overlay
mechanism carries the three carriers the work route needs.

The overlay is Waybill's designed extension point, not a workaround. `resolveBookings`
(src/bookings.js:137-148) loads the shipped `bookings/` and lays the configured directory over it
keyed by leg. **A leg the overlay binds is replaced *whole*, never merged key by key** — see the
contract comment at src/bookings.js:120-125 and the assertion at tests/bookings-overlay.test.js:105.
Every key the overlay omits is *gone*, not inherited: an overlay review booking with no `effort:`
line produces a booking with no effort, not the stock booking's effort. Each of the three files
below is therefore written as a complete booking, and each is copied from its shipped counterpart
and then edited, rather than written from the frontmatter keys alone.

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

Filenames are arbitrary — `loadBookings` reads every `*.md` in the directory and keys on the
frontmatter `leg`, not on the basename (src/bookings.js:59-92). They are named after their shipped
counterparts so that a future `diff` against `bookings/` is one command.

### Modified Files — in the repository

| File Path                        | Changes                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/bookings-overlay.test.js` | One new `describe` block, *the work overlay*, asserting the three-carrier swap and the unset fallback |

### Machine state changed (not files in this repo)

| What                                   | Change                                                              |
| -------------------------------------- | ------------------------------------------------------------------- |
| global git config                      | `waybill.bookingsdir` set to `~/.waybill/bookings`                   |
| the work repository                    | `openspec init`, writing `openspec/` and `.claude/commands/opsx/`    |
| the work repository's `.git/info/exclude` | one line for `.claude/commands/opsx/` (see the decision below)    |

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

### 4. Wiring the overlay up

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

### 5. `openspec init` in the work repo — and where its artifacts go

Legs 5 and 6 need `openspec`; without it they fall back to parsing `tasks.md` silently
(src/openspec.js:12,31-33). `openspec init` writes two things: `openspec/` and
`<project>/.claude/commands/opsx/`.

**Decision: `openspec/` stays untracked and *not* excluded. `.claude/commands/opsx/` goes into
`.git/info/exclude`. Neither is committed to the corporate repository.**

The contract rules committing a `.waybill/bookings` overlay into work repos out of scope because
"personal tool configuration does not belong in a corporate repository". Applied consistently, that
disqualifies both artifacts from the MR: neither is a deliverable of the work ticket, and a
colleague reviewing the MR should not have to review, or learn, one engineer's private paperwork.
So the question is not *commit or not* — it is settled, neither is committed — but *exclude or
merely leave untracked*, and those two are not interchangeable here:

- `changedPaths` collects the docket's own diff from `git diff --name-only <merge-base>` plus
  **`git ls-files --others --exclude-standard`** (src/repo.js:311-312). `--exclude-standard` honours
  `.git/info/exclude`. An excluded, untracked file therefore appears in *neither* list, so it is
  never in `changed`, so `stampedByPath` can never match it (src/bookings.js:221-222 returns false
  for anything not in `changed`). Both the `specs` and `execute` bookings stamp on
  `stampPath: openspec/changes/**/tasks.md`. **Excluding `openspec/` would silently guarantee that
  legs 5 and 6 never stamp and the route dead-ends at `specs`.** Left merely untracked, the same
  files *do* appear in `ls-files --others --exclude-standard`, and the stamps work.
- Nothing stamps on `.claude/commands/opsx/`, so excluding it costs nothing and keeps
  `git status` readable.

**Accepted cost, named rather than fixed:** untracked `openspec/` lives inside the bay, and the bay
is deleted at cleanup — so the living spec that leg 6 folds deltas into does not survive the ticket.
That is acceptable here because openspec's value on this route is per-ticket scaffolding, a tasks
list that survives `/clear` within one ticket, not a long-lived specification of the corporate
codebase. If continuity turns out to matter, the escape hatch is to propose `openspec/` to the team
deliberately, as its own MR with their agreement — which is a different decision from smuggling it
in under a feature ticket.

**Also worth knowing:** `.git/info/exclude` is per-clone and does not travel between machines or
clones — already recorded in the contract's Future list for bays (src/bay.js:88). This step must be
repeated in each new work clone, and `waybill doctor` does not check it.

**Implementation steps**:

1. In the work repo's main checkout: `openspec init`
2. `printf '.claude/commands/opsx/\n' >> .git/info/exclude`
3. Confirm the split: `git status --short` shows `openspec/` as untracked (`??`) and shows nothing
   for `.claude/commands/opsx/`.
4. Confirm the consequence that matters: from a bay with a scaffolded change,
   `git ls-files --others --exclude-standard | grep -c 'openspec/changes/.*/tasks.md'` returns at
   least 1. If it returns 0, the specs and execute legs will never stamp.

### 6. Repo-side test: the work overlay

**Pattern to follow**: the existing *worked cleanup example* block, tests/bookings-overlay.test.js:229-250.

Add one `describe('the work overlay', …)` using the file's existing `overlayDir` and `isolated`
helpers, with inline booking constants alongside `OVERLAID_CLEANUP`. Two cases:

1. With the overlay in force, `bookings.get('review').command === '/mr-review'`,
   `bookings.get('cleanup').command === '/mar'`, the bay booking's body matches `/JIRA-123\//`, and
   `bookings.size` still equals `readdirSync('../bookings/').length` — the overlay rebound three
   legs and left none unbound.
2. With `WAYBILL_BOOKINGS_DIR` unset and `GIT_CONFIG_GLOBAL=/dev/null`, the stock bookings resolve
   unchanged: `review` is `/waybill:review` and `cleanup` is `/waybill:cleanup`.

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
  overlay is in force. Overlay set → `review` is `/mr-review`, `cleanup` is `/mar`, the bay body
  matches `/JIRA-123\//`, and `bookings.size` is unchanged. Overlay unset — no
  `WAYBILL_BOOKINGS_DIR`, and `GIT_CONFIG_GLOBAL=/dev/null` so the operator's now-real global
  `waybill.bookingsdir` cannot reach in → the stock
  `/waybill:review` and `/waybill:cleanup` resolve. Write the unset case **first** and watch it pass
  against today's tree; it is the regression guard, and a case that was never red proves nothing.
- **Check command**: `node --test tests/bookings-overlay.test.js` — seconds, against the ~173s full
  suite. Scope by file; never by `--test-name-pattern`, which exits 0 when it filters out every test.

### 7. Stretch, mentioned not specified

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
| 5 specs | `/spec:propose` | `openspec/changes/<id>/tasks.md` exists with tickable boxes; the leg stamps |
| 6 execute | `/spec:apply` | Boxes tick top to bottom, test first; progress reads `n of m` |
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
  the silent `stampCmd: false`, and `review` captures `glab mr view` into a shell variable and pipes
  the approvals count into `grep -q`, so nothing reaches stdout. Review any later edit against this
  rule before it lands.
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
| `tests/bookings-overlay.test.js` | The three-carrier work overlay in force; stock resolution when unset  |

**Key test cases**:

- Overlay in force: `review` → `/mr-review`, `cleanup` → `/mar`, bay body names `JIRA-123/`.
- Overlay in force: `bookings.size` unchanged — three legs rebound, none unbound, none added.
- Overlay unset: `review` → `/waybill:review`, `cleanup` → `/waybill:cleanup`.
- Each case declares its own tiers through `isolated` and inherits none, so the operator's now-real
  global `waybill.bookingsdir` cannot reach into the assertions.

### Manual Testing

- [ ] Phase 6 confirmed first: `waybill help` names 8 legs, and `command -v waybill` resolves inside
      the newly installed plugin cache version — **before** writing the review overlay.
- [ ] `glab auth status` reports authenticated against the self-hosted work host (phase 1).
- [ ] `mkdir -p ~/.waybill/bookings`, write the three bookings.
- [ ] `git config --global waybill.bookingsdir '~/.waybill/bookings'`, then
      `git config --global --get waybill.bookingsdir` prints a literal `~/...`.
- [ ] In a work repo: `waybill next` runs without error and reports `leg N of 8`.
- [ ] In a work repo on the review leg: `waybill next` names `/mr-review`, not `/waybill:review`.
- [ ] In a work repo on the cleanup leg: `waybill next` names `/mar`, not `/waybill:cleanup`.
- [ ] On the waybill repo itself, with the global config now set: `waybill next` still works and
      the route is intact (the overlay is global, so it applies here too — confirm `/mar` and
      `/mr-review` are what you want on this repo as well, and if not, unset per-repo).
- [ ] `openspec init` in the work repo; `git status --short` shows `openspec/` untracked and nothing
      for `.claude/commands/opsx/`.
- [ ] From a bay: `git ls-files --others --exclude-standard | grep -c 'openspec/changes/.*/tasks.md'`
      returns at least 1.
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
| Two overlay files claiming one leg | Throws `duplicate leg` at load (src/bookings.js:84). Three files, three distinct legs. |

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
| `openspec/` decision | **Legs 5 and 6 never stamp** | `openspec/` added to `.git/info/exclude` | `--exclude-standard` drops it from `changed` (src/repo.js:312), so `stampPath: openspec/changes/**/tasks.md` can never match and the route dead-ends at `specs` | Leave `openspec/` untracked and *not* excluded; verify with the `ls-files` check above |
| `openspec/` decision | Accidental commit into the work MR | A `git add -A` sweeps untracked `openspec/` into the ticket's commit | Personal tooling lands in a corporate MR and a colleague reviews paperwork | `/commit` stages named files rather than `-A`; review `git status --short` before pushing at leg 7 |
| `openspec/` decision | Living spec lost at cleanup | `openspec/` is untracked and lives inside the bay, which cleanup deletes | Leg 6's archived deltas do not survive the ticket | Accepted and stated; the escape hatch is a deliberate team-agreed MR, not a silent commit |
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

# The live run
# No command. One real work ticket through all eight legs, and at each leg the waybill named the
# command you would have reached for anyway. This is a judgment call and there is no check for it.
```

## Rollout Considerations

- **Feature flag**: `git config --global --unset waybill.bookingsdir` is the off switch. The stock
  route resolves unchanged the moment it is unset, with no other cleanup.
- **Rollback plan**: unset the config, or `rm -rf ~/.waybill/bookings`. Either restores the stock
  eight-leg route. The `openspec init` artifacts are removed with `rm -rf openspec
  .claude/commands/opsx` plus the `.git/info/exclude` line.
- **Monitoring**: none. This is one laptop.
- **Ordering**: phase 6 installed → phase 1's glab auth → overlay files → global config →
  `openspec init` → the live run.

## Open Items

- [ ] Confirm the work GitLab project has approval rules configured; if not, switch the review
      stamp to counting non-system notes.
- [ ] Confirm phase 5 stamps `review` through the booking rather than through bespoke `legIsDone`
      logic, and correct the review booking's body if not.

---

_This spec is ready for implementation. Phase 6 must be installed and confirmed first; writing the
review overlay before then breaks every `/waybill:*` command on the machine._
