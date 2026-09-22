# Implementation Spec: Waybill on the Work Laptop - Phase 2

**Contract**: ./contract.md
**Phase**: 2 — Portability fixes: exit-127 and tilde expansion (risk: low, blocking: false)
**Estimated Effort**: S

## Technical Approach

Two small, independent portability fixes that share nothing but a release. Fix A closes a silent
failure mode in the `stampCmd` executor; Fix B closes a tilde-expansion gap across three
configuration tiers. Either can be implemented and committed on its own; both together are still a
sub-hundred-line diff. Neither adds a dependency — `tests/commands.test.js` asserts the toolchain
stays dependency-free, and nothing here needs anything outside `node:` builtins.

**Fix A — exit 127 must warn, not silently stall.** `runStamp` (src/bookings.js:246-257) already
distinguishes three outcomes: ran, could-not-run, and exit 127. `evaluateBooking`
(src/bookings.js:299-329) already turns the second and third into warnings and pushes them onto the
array `legIsDone` threads through (src/inference.js:21, :28-29), which the renderer surfaces as the
waybill's `WARNINGS:` section (src/waybill.js:230-244) and as `- ⚠ …` lines in markdown
(src/waybill.js:409-411). So the warnings *channel* exists and must be reused, not reinvented. Two
gaps remain: (1) `stampedByCmd` (src/bookings.js:267-270) — the exported, warnings-less sibling —
throws the distinction away and returns a bare `false`, and its doc comment at :259-261 states
"A missing binary (exit 127) is simply not-done" as intended behaviour; (2) the existing warning
text, `stampCmd command not found: <whole command>`, never names the binary, which is the one thing
an operator needs to fix it. The fix gives `stampedByCmd` an optional warnings sink, and routes both
call sites through one shared message builder so the wording cannot drift.

Alternatives considered for `stampedByCmd`'s signature. (a) **Optional third parameter
`warnings = []`** — chosen: the smallest change, keeps every existing call site valid, and mirrors
exactly how `legIsDone(leg, state, bookings, warnings, progress)` already threads a collected-in-place
array. Cost: a caller can still pass nothing and get silence. (b) Change the return type to
`{done, warnings}` — makes silence impossible but breaks the export's shape for a function whose only
non-test caller would be `evaluateBooking`. (c) Delete `stampedByCmd` and fold it into
`evaluateBooking` — removes the silent API entirely, but deletes a directly-tested unit
(tests/bookings.test.js:186-204) and a documented export for no behavioural gain. (a) wins because
the module's own stated principle is "the rule lives once" (src/bookings.js:276-278), and a shared
message builder satisfies that without churning the public surface.

**Fix B — tilde expansion parity.** Exactly one tier expands `~` today: `waybill.bookingsdir`, because
it reads through `configPath` and git's `--type=path` does the expansion (src/repo.js:22-32, consumed
at src/bookings.js:114). Its sibling `waybill.baydir` reads a plain `config --get`
(src/repo.js:134) and does not expand, and neither env tier — `WAYBILL_BAY_DIR` (src/repo.js:134) or
`WAYBILL_BOOKINGS_DIR` (src/bookings.js:114) — expands either. A literal `~/…` set from
`settings.json` or a hook therefore creates a directory *named* `~` in the checkout. The git tier is
fixed by routing through the existing `configPath`; verified that `--type=path` leaves a blank value
blank (exit 0, empty stdout) and leaves relative values such as `..` and `bays` untouched, so the
blank-tier guard at src/repo.js:135 and the existing relative-path tests (tests/repo.test.js:103-139)
keep their current meaning. The env tiers need a small `expandTilde` helper, which belongs in
src/repo.js beside `configPath` — src/bookings.js already imports from there (src/bookings.js:7), so
one home is enough for both consumers.

## Feedback Strategy

**Inner-loop command**: `node --test tests/bookings.test.js tests/repo.test.js`

**Playground**: the existing `node:test` suite plus the `tests/helpers/repo-fixture.js` sandbox —
`stubBin` + `withPath`/`pathWithout` for the missing-binary cases, `createRepo` + `withEnv` for the
tier cases.

**Why this approach**: both fixes are pure logic in two modules that already have dedicated,
fast-running unit files; the full suite is ~173s, so the scoped run is the only loop worth running
dozens of times.

**Never use `--test-name-pattern`.** `node --test --test-name-pattern 'zzz_no_such_test_zzz'` exits 0
when it filters out every test, so a filtered run is vacuously green. Every command in this spec is
file-scoped instead.

## File Changes

### New Files

None.

### Modified Files

| File Path                    | Changes                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/bookings.js`            | Add a private `stampWarning(prefix, command, result)` message builder naming the missing binary; give `stampedByCmd` an optional `warnings` sink; route `evaluateBooking`'s stampCmd branch through the same builder; correct the doc comment at :259-261. Wrap the `WAYBILL_BOOKINGS_DIR` tier at :114 in `expandTilde`. |
| `src/repo.js`                | Export a new `expandTilde(value)`; route `waybill.baydir` (:134) through `configPath`; wrap the `WAYBILL_BAY_DIR` tier (:134) in `expandTilde`.                                                                     |
| `tests/bookings.test.js`     | **Rewrite** the test at :195 (currently asserts the silent behaviour) plus new cases for the warning text and for the `WAYBILL_BOOKINGS_DIR` tilde tier.                                                          |
| `tests/repo.test.js`         | New cases for `~` in `waybill.baydir` and in `WAYBILL_BAY_DIR`, and for values that must *not* be touched.                                                                                                        |

### Deleted Files

None.

### Shared-file warning

Phase 4 ("De-hardcode the leg count") also modifies `src/bookings.js` — the generic
`stampPath`/`stampCmd` fallthrough in `legIsDone` and the derived leg count. **Phase 2 lands first.**
Phase 4 must rebase onto Phase 2's `main` rather than branch from the same point, or the two edits to
`evaluateBooking`/`legIsDone` will conflict. Phase 4's fallthrough should call the post-Phase-2
`evaluateBooking`, which already warns on a missing binary; it must not reintroduce a warnings-less
path.

## Implementation Details

### Fix A — a missing stampCmd binary warns by name

**Pattern to follow**: `src/bookings.js:299-329` (`evaluateBooking`) for the warnings shape, and
`src/inference.js:21` (`legIsDone`'s `warnings` parameter) for the collected-in-place convention.

**Overview**: exit 127 from a `stampCmd` becomes a visible warning that names the binary, on both the
`evaluateBooking` path and the `stampedByCmd` path, from one shared message builder.

```js
/** The word a shell would look up first — the best available guess at which binary was missing. */
function binaryOf(command) {
  return command.trim().split(/\s+/)[0] ?? command;
}

/**
 * @param {string} prefix '' from stampedByCmd, `${label}: ` from evaluateBooking
 * @param {string} command
 * @param {{ran:boolean, notFound:boolean, status:number|null}} result
 * @returns {string}
 */
function stampWarning(prefix, command, result) {
  return result.notFound
    ? `${prefix}stampCmd missing binary \`${binaryOf(command)}\`: ${command}`
    : `${prefix}stampCmd could not be executed: ${command}`;
}

/**
 * @param {string} command
 * @param {string} cwd
 * @param {string[]} [warnings] collected in place; a stamp that could not run at all says so here
 * @returns {boolean}
 */
export function stampedByCmd(command, cwd, warnings = []) { /* … */ }
```

**Key decisions**:

- The warning says **`missing binary`**, not `command not found`. `command not found` is the shell's
  phrasing for the same event and reads as "the stamp answered no"; `missing binary \`glab\`` names
  the thing the operator has to install. This phrase is also what the contract's acceptance grep
  looks for.
- The full command is still printed after the binary name. `shell: true` means 127 can come from any
  word in a pipeline, so the first word is a guess; printing both makes a wrong guess recoverable
  rather than misleading.
- `could not be executed` (spawn failure, timeout, `status === null`) keeps its existing wording. It
  is a different failure with a different remedy and the two must not be collapsed.
- Exit non-zero-but-not-127 stays silent. That is a stamp that ran and honestly said "not done" —
  warning on it would put a `⚠` beside every leg that simply is not finished yet. In particular the
  three stock bookings use `stampCmd: false` (bookings/ideation-ideate.md:7,
  bookings/waybill-bay.md:7, bookings/waybill-cleanup.md:8), and `false` exits 1, not 127 — **no
  golden fixture changes in this phase**, and `UPDATE_GOLDEN=1` must not be run.
- `evaluateBooking` keeps calling `runStamp` directly (it needs `result.status` for the verdict) and
  passes `` `${label}: ` `` as the prefix; the wording itself lives in one function.

**Implementation steps** (TDD — the test comes first, and must be seen to fail):

1. **RED.** Rewrite `tests/bookings.test.js:195` — the case named *"is false — never thrown — when the
   command does not exist (exit 127)"*. It currently asserts the silent behaviour and **must not be
   left passing**; rename it to something like *"warns, naming the missing binary, when the command
   does not exist (exit 127)"* and assert both halves: the return is still `false` (a stamp never
   throws) **and** a `warnings` array passed in now holds one entry matching `/missing binary/` and
   containing the binary name. Build the case with `stubBin('waybill-stamp-probe', 'exit 0')` +
   `withPath` for the present-binary control and `withPath(pathWithout('waybill-stamp-probe'))` for
   the absent one, so a binary that happens to exist on the developer's machine cannot turn the test
   green by accident. Run the inner loop; confirm it fails.
2. **RED.** Add a case asserting `evaluateBooking({ stampCmd: <absent binary>, path: '…/x.md' }, …)`
   returns `done: false` with a warning that contains both the booking label and `missing binary`.
3. **RED.** Add a case asserting that `exit 1` produces **no** warning — the regression guard for
   over-warning. And one asserting the spawn-failure wording (`could not be executed`) is unchanged
   for a `status === null` outcome, if it can be provoked cheaply; if not, say so rather than
   faking it.
4. **GREEN.** Add `binaryOf` and `stampWarning` to `src/bookings.js`; add the `warnings = []`
   parameter to `stampedByCmd` and push on `!result.ran`; replace the inline `const reason = …`
   message in `evaluateBooking` (:320-321) with a `stampWarning` call.
5. Correct the now-false doc comment at `src/bookings.js:259-261`. It currently asserts that a missing
   binary "is simply not-done"; it must say that a missing binary is still not-done but is reported
   through `warnings`, and that only an explicit non-zero exit is silent.
6. Re-run the inner loop; then `node --test tests/inference.test.js` to confirm the reworded warning
   breaks no assertion downstream.

**Feedback loop**:

- **Playground**: `tests/bookings.test.js`'s existing `describe('stampedByCmd')` block, plus a
  `stubBin`/`pathWithout` pair for the present/absent binary.
- **Experiment**: run the same stamp four ways — binary present and exits 0 (no warning, true),
  binary present and exits 1 (no warning, false), binary absent (one `missing binary` warning,
  false), and via `evaluateBooking` with a booking `path` set (warning is label-prefixed).
- **Check command**: `node --test tests/bookings.test.js`

### Fix B — `~` expands in every tier that names a directory

**Pattern to follow**: `src/repo.js:19-32` (`configPath`, and its comment explaining why git owns the
expansion) and the existing git-tier test at `tests/bookings-overlay.test.js:155`.

**Overview**: one `expandTilde` helper for the env tiers, and `configPath` for the remaining git tier,
so all four settings that name a directory agree about what `~` means.

```js
/**
 * A leading `~` replaced with the home directory. Anything else is returned untouched — a `~` that
 * is not the first segment is a legal directory name, and an unset home is not a reason to root a
 * path at ''.
 *
 * `process.env.HOME` first, `os.homedir()` second: the same order src/signals.js:130 uses, and the
 * reason is the same — tests hand in a HOME of their own.
 *
 * @template {string|null|undefined} T
 * @param {T} value
 * @returns {T|string}
 */
export function expandTilde(value) { /* … */ }

function configuredBayDir(cwd, override) {
  const tiers = [override, expandTilde(process.env.WAYBILL_BAY_DIR), configPath(cwd, 'waybill.baydir')];
  // … unchanged blank-and-trim selection
}
```

**Key decisions**:

- The git tier is fixed by *reusing* `configPath`, not by running `expandTilde` on git's output. Git
  already owns this expansion for `waybill.bookingsdir`, and two expanders would eventually disagree —
  git's `--type=path` also handles `~user`, which `expandTilde` deliberately does not.
- `expandTilde` therefore handles only `~` alone and a leading `~/`. `~otheruser/…` from an env var is
  left literal. That asymmetry between the env and git tiers is accepted and recorded in Failure
  Modes rather than papered over by reimplementing passwd lookups.
- Expansion is applied to the env value *inside* the tiers array, before selection. `expandTilde` is a
  no-op on `''`, `'  '` and `undefined`, so the existing blank-is-not-an-answer guards
  (src/repo.js:135, src/bookings.js:115) keep their exact current behaviour — including the test at
  tests/repo.test.js:150.
- The `override` tier in `configuredBayDir` (a caller-supplied `bayDir`) is **not** expanded. It comes
  from an argument the shell has already expanded, and widening the fix beyond the contract's two env
  tiers plus one git tier is scope the contract did not approve. Noted here so the omission reads as a
  decision rather than an oversight.
- Expanding to an absolute path composes correctly with both consumers: `path.resolve(main, …)`
  (src/repo.js:155) and `path.resolve(checkoutRoot(cwd) ?? cwd, …)` (src/bookings.js:146) both let an
  absolute value win outright.

**Implementation steps** (TDD):

1. **RED.** In `tests/repo.test.js`, inside `describe('resolveBayPath is configurable')`, add: *"expands
   a leading `~` in `waybill.baydir`"* — `createRepo()`, `git(repo, ['config', 'waybill.baydir',
   '~/bays'])`, then inside `withEnv({ HOME: <a tempRoot()> })` assert `resolveBayPath('feat/x', repo)`
   equals `path.join(home, 'bays', 'repo-feat-x')`. The fixture already pins
   `GIT_CONFIG_GLOBAL=/dev/null` (tests/helpers/repo-fixture.js:14-16), so overriding `HOME` cannot
   drag in the developer's real global config. Confirm it fails with a literal `~` segment in the path.
2. **RED.** Add *"expands a leading `~` in `WAYBILL_BAY_DIR`"* — same assertion via
   `withEnv({ HOME: home, WAYBILL_BAY_DIR: '~/bays' })`.
3. **RED.** Add the negative guards in the same block: a value with a non-leading `~` (`'bays/~keep'`)
   is untouched, and a blank `WAYBILL_BAY_DIR` still falls through to the git tier (extend, do not
   duplicate, tests/repo.test.js:150).
4. **RED.** In `tests/bookings.test.js`, add a `describe` covering the `WAYBILL_BOOKINGS_DIR` tier:
   with `withEnv({ HOME: home, WAYBILL_BOOKINGS_DIR: '~/overlay' })` and an overlay booking written
   under `<home>/overlay`, `resolveBookings(repo, { knownLegs: … })` picks the overlaid leg up.
   *Placement note*: the sibling git-tier tilde test lives in `tests/bookings-overlay.test.js:155`,
   so that file is arguably this test's natural home. It goes in `tests/bookings.test.js` instead
   because that is the unit file for `src/bookings.js`, where `configuredBookingsDir` lives — and
   because the contract's acceptance grep is scoped to `tests/repo.test.js` and
   `tests/bookings.test.js`, and satisfying that gate with a real test beats satisfying it with a
   comment. `tests/bookings-overlay.test.js` is still run in the validation commands to prove the
   precedence tests did not regress.
5. **GREEN.** Add and export `expandTilde` in `src/repo.js`. Swap the `waybill.baydir` read at
   src/repo.js:134 from `tryGit(cwd, ['config', '--get', 'waybill.baydir'])` to
   `configPath(cwd, 'waybill.baydir')`. Wrap `process.env.WAYBILL_BAY_DIR` (src/repo.js:134) and
   `process.env.WAYBILL_BOOKINGS_DIR` (src/bookings.js:114) in `expandTilde`; import it in
   src/bookings.js alongside the existing `configPath` import (src/bookings.js:7).
6. Re-run the inner loop plus `node --test tests/bookings-overlay.test.js tests/bay.test.js`.

**Feedback loop**:

- **Playground**: `createRepo()` from the fixture, driven under `withEnv` with a `tempRoot()` standing
  in for `HOME`.
- **Experiment**: drive each tier with four values — `~/bays` (expands), `bays` (relative, unchanged,
  still anchored on the main checkout), an absolute path (unchanged), and `'  '` (blank, falls
  through) — and assert `resolveBayPath` / `resolveBookings` for each.
- **Check command**: `node --test tests/repo.test.js tests/bookings.test.js`

## Testing Requirements

### Unit Tests

| Test File                      | Coverage                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tests/bookings.test.js`       | `stampedByCmd` and `evaluateBooking` warning on a missing binary; the `WAYBILL_BOOKINGS_DIR` `~` tier |
| `tests/repo.test.js`           | `~` in `waybill.baydir` and in `WAYBILL_BAY_DIR`; values that must stay untouched                     |
| `tests/bookings-overlay.test.js` | Unchanged — run as a regression guard on tier precedence                                            |
| `tests/inference.test.js`      | Unchanged — run to confirm the reworded warning breaks nothing downstream                             |

**Key test cases**:

- Missing binary: `stampedByCmd` returns `false`, does not throw, and records exactly one warning
  matching `/missing binary/` and naming the binary. **This replaces tests/bookings.test.js:195,
  which currently asserts the silent behaviour and must not survive this phase unchanged.**
- Missing binary via `evaluateBooking`: `done === false`, warning prefixed with the booking's `path`.
- Binary present, exits 0 → `true`, zero warnings. Binary present, exits 1 → `false`, **zero
  warnings** (the over-warning guard).
- `~/bays` in `waybill.baydir`, and in `WAYBILL_BAY_DIR`, both land under the test's `HOME`.
- `bays/~keep` is untouched; a blank env value still falls through to the git tier; a relative git
  value is still resolved against the main checkout, not the cwd.
- `~/overlay` in `WAYBILL_BOOKINGS_DIR` resolves to a real overlay directory and its booking wins.

### Integration Tests

None added. Both fixes are unit-level; the phase's integration risk is covered by running the
existing `tests/bookings-overlay.test.js`, `tests/bay.test.js` and `tests/inference.test.js`
unchanged, and by the full-suite run before the PR.

### Manual Testing

- [ ] `git config waybill.baydir '~/waybill-bays'` in a scratch repo, run `node bin/waybill bay feat/x --dry-run` (or the nearest read-only path), and confirm no directory literally named `~` appears.
- [ ] Point a booking's `stampCmd` at a binary that is not installed, run `node bin/waybill next`, and confirm the `WARNINGS:` section names the binary.

## Error Handling

| Error Scenario                                | Handling Strategy                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `stampCmd` binary missing (exit 127)          | Leg stays not-done; push `stampCmd missing binary \`<bin>\`: <command>` onto `warnings`. Never throw. |
| `stampCmd` spawn failure or 10s timeout       | Leg stays not-done; existing `could not be executed` warning, wording unchanged.                     |
| `stampCmd` exits non-zero, not 127            | Leg not-done, silent — this is an honest "not finished yet".                                         |
| `HOME` unset and `os.homedir()` unusable      | `expandTilde` returns the value untouched rather than rooting the path at `''`.                      |
| Blank value at any tier                       | Unchanged: skipped by the existing trim guard, falls through to the next tier.                       |
| `waybill.baydir` unset                        | Unchanged: `configPath` returns `null`, `DEFAULT_BAY_DIR` applies.                                   |

## Failure Modes

| Component                     | Failure Mode                           | Trigger                                                                   | Impact                                                                            | Mitigation                                                                                                     |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `binaryOf` / `stampWarning`   | Misattributed binary name              | `shell: true` means 127 can come from any word in a pipeline or from `VAR=x bin` | The warning names the wrong word; the operator installs the wrong thing              | The full command is always printed after the name, so the guess is checkable. Acknowledged, not fixed.            |
| `stampedByCmd`                | Silence still available                | A caller omits the optional `warnings` argument                             | The stall this phase exists to fix reappears at that call site                       | No `src/` caller omits it after this phase; Phase 4's fallthrough must go through `evaluateBooking`, noted above. |
| `evaluateBooking` warnings    | Warning flood                          | A booking's stamp binary is missing and the waybill is rendered repeatedly | Every render repeats the same `⚠` line                                               | Accepted: one leg, one line per render; deduplication would hide a second genuinely-missing binary.               |
| `expandTilde`                 | `~user` left literal                   | An env tier is set to `~alice/bays`                                         | A directory named `~alice` is created — the exact bug this phase fixes, one case on  | Documented asymmetry with the git tier; git's `--type=path` handles it, `expandTilde` does not.                   |
| `expandTilde`                 | Home moved mid-process                 | `HOME` is reassigned after a path was already resolved                      | Two resolutions in one process disagree                                              | Read at call time, never cached. Named so the implementer does not "optimise" it into a module constant.          |
| `waybill.baydir` via `configPath` | A value git rejects as a path       | An exotic config value `--type=path` refuses to parse                       | `configPath` returns `null` and the tier silently falls through to the default       | Same behaviour `waybill.bookingsdir` has had since it shipped. Verified: blank and relative values are unaffected. |
| Both fixes                    | Phase 4 conflict in `src/bookings.js`  | Phase 4 branches from pre-Phase-2 `main`                                    | Merge conflict in `evaluateBooking` / `legIsDone`                                    | Phase 2 lands first; Phase 4 rebases. Stated in File Changes and in the PR description.                            |

## Validation Commands

No lint, typecheck or build exists in this repo, and none is added by this phase — it is
zero-dependency ESM with JSDoc types, Node >= 22, no build step.

```bash
# Inner loop (fast, run constantly)
node --test tests/bookings.test.js
node --test tests/repo.test.js tests/bookings.test.js

# Regression guards for the modules these two files feed
node --test tests/bookings-overlay.test.js tests/bay.test.js tests/inference.test.js

# Full suite — once, before opening the PR (~173s)
node --test tests/
```

### Acceptance checks (verbatim from the contract)

These are fail-closed on purpose. **Do not add `--test-name-pattern` to any of them** — it exits 0
when it filters out every test, which makes the check vacuously green.

- `node --test tests/bookings.test.js` — exits 0
- `grep -c 'missing binary' tests/bookings.test.js` — at least 1
- `node --test tests/repo.test.js tests/bookings.test.js` — exits 0
- `grep -cE 'tilde|expand' tests/repo.test.js tests/bookings.test.js` — each at least 1

Additional gate for this phase: `node --test tests/` exits 0 and **no golden fixture is re-blessed**.
`UPDATE_GOLDEN=1` must not appear in this phase's work — every stock booking uses `stampCmd: false`,
which exits 1, not 127, so no rendered output changes.

## Rollout Considerations

- **Feature flag**: none. Both fixes are strictly-more-informative behaviour with no opt-out.
- **Behaviour change users will see**: a machine whose overlay names a binary it does not have will
  start printing a `⚠ … missing binary …` line where it previously printed nothing. That is the point.
  Call it out in the PR description and the release notes — it is an added warning, not a new failure:
  no exit code changes.
- **Migration**: an operator who worked around the missing expansion by creating a literal `~`
  directory will find it orphaned after this lands. Worth a sentence in the release notes; not worth
  code.
- **Rollback**: revert the commit. Nothing persists, no config is rewritten, no fixture is re-blessed.
- **Sequencing**: this phase is non-blocking but is a prerequisite of Phase 3 (`waybill doctor`) and
  Phase 4 (de-hardcode the leg count). Land and merge it before either starts.

## Open Items

- [ ] Confirm whether a `status === null` spawn failure can be provoked cheaply in a test (a stamp
      that exceeds `STAMP_TIMEOUT_MS` = 10s would work but costs 10s of suite time). If not, leave the
      `could not be executed` branch covered only by inspection and say so in the PR rather than
      adding a slow test.
- [ ] Decide during implementation whether the two fixes ship as one PR or two. They are independent;
      one PR is defensible because the diff is small and both are "portability", two is defensible
      because they share no code. Default to one, titled for both.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
