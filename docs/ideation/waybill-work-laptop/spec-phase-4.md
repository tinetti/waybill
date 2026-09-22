# Implementation Spec: Waybill on the Work Laptop - Phase 4

**Contract**: ./contract.md
**Phase**: De-hardcode the leg count — risk `medium`, blocking, prereq: Phase 2 (Portability fixes)
**Estimated Effort**: S

## Technical Approach

Phase 5 appends a stock `review` leg. This phase does **not** add it. It removes the arithmetic that
would otherwise have to be edited in a dozen places when phase 5 lands, so that adding a leg is a
one-line change to `LEGS` plus a booking plus a fixture — and nothing else.

Three things change, and nothing else:

1. **Totals derive from `LEGS`.** The renderer already does this correctly: `src/waybill.js:67-68`
   and `:85` interpolate `LEGS.length`, and `src/help.js:80` generates route rows from `LEGS`. The
   surviving literals are in the **test** files, where 24 assertions embed `of 7` / `7 legs` /
   `seven legs` in regexes, strings and test names. Those are the de-hardcode target. `tests/waybill.test.js:575`,
   `:581` and `:604` already use `` `of ${LEGS.length}` `` — that is the pattern every other site
   adopts.
2. **A declared dispatch table replaces the id-comparison chain in `legIsDone`.** Today
   `src/inference.js:22-23` hardcodes `if (leg.id === 'bay')` and `if (leg.id === 'cleanup')`, then
   falls through to `evaluateBooking`. The fallthrough is already generic in effect but not in
   *declaration*: nothing ties the two bespoke branches to the `owner: 'wrapper'` field that is
   supposed to mean exactly this, and nothing stops a future leg acquiring a third hardcoded branch.
   Move the pairing into `src/legs.js` as an exported `WRAPPER_STAMPS` map keyed by leg id, have
   `legIsDone` look up that map and otherwise judge the leg purely by its booking's
   `stampPath`/`stampCmd`. Phase 5's `review` leg then needs no edit to `src/inference.js` at all.
3. **`tests/legs.test.js` pins the structural invariant**, so the thing being de-hardcoded — the
   *count* — is replaced by the thing that actually matters: `bay` is the anchor (index 1, wrapper
   -owned, stamped by `bayIsDone`) and `cleanup` is the terminus (last, wrapper-owned, stamped by
   `cleanupIsDone`), whatever the total becomes.

The count stays 7 after this phase, so **the golden diff should be zero**. Any golden churn here is
a signal that something behavioural changed by accident, not a thing to re-bless.

### Explicitly out of scope

- **`after:` frontmatter splicing / adding non-stock legs via an overlay.** Cut to Future by the
  contract (`scope.outOfScope`, `scope.future`): once `review` ships stock, nothing in the approved
  scope declares a non-stock leg. If the implementation starts designing a splice mechanism, an
  insertion point, or an overlay-declared leg, stop — that is the wrong phase.
- **Adding the eighth leg.** Phase 5 does that.
- **The prose sweep.** `README.md`, `docs/guide/**`, the golden fixtures and the `src/` *comments*
  that say "leg 7" (`src/fleet.js:15`, `:23`, `src/cli.js:375`) belong to phase 5, which owns the
  contract criterion `grep -rniE 'of 7|7/7|7[- ]legs|seven[- ]legs?|seven-leg' README.md docs/guide/
  src/ commands/ bookings/`. The one exception is `src/legs.js:17`, whose comment *asserts* the
  invariant this phase replaces — leaving it would make the file contradict itself.

## Feedback Strategy

**Inner-loop command**: `node --test tests/legs.test.js` — sub-second, and it is the file being
built. Widen to `node --test tests/legs.test.js tests/inference.test.js` (~34s) before each commit.

**Playground**: the `node:test` runner, scoped per suite. The full suite is ~173s (cli 78s,
inference 34s, bay 20s, waybill 13s, commands 4.9s, help 0.65s) and must not be the inner loop.

**Why this approach**: every deliverable here is a pure-logic or test-file change with no I/O and no
CLI surface, so a scoped test run is the tightest honest signal available.

**Never use `--test-name-pattern`.** `node --test --test-name-pattern 'zzz_no_such_test_zzz'
tests/help.test.js` exits 0 — a filter that matches nothing is vacuously green, so a check built on
one proves nothing. Scope by file path only.

## File Changes

### New Files

| File Path          | Purpose                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `tests/legs.test.js` | The structural invariant of the leg model: `bay` is the anchor, `cleanup` is the terminus, wrapper stamps match `owner`, and every leg is judged by something. No git fixtures — pure and fast. |

### Modified Files

| File Path                 | Changes                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/legs.js`             | Export a `WRAPPER_STAMPS` map (`bay` → `bayIsDone`, `cleanup` → `cleanupIsDone`). Rewrite the `LEGS` doc comment at `:16-26` so the stated invariant is anchor/terminus, not `"7/7"`. |
| `src/inference.js`        | `legIsDone` (`:21-23`) dispatches through `WRAPPER_STAMPS` instead of two `leg.id ===` comparisons; everything else falls through to the booking's stamp unchanged.                 |
| `tests/inference.test.js` | De-hardcode the count in test names (`:59`, `:84`, `:224`) and comments (`:73`, `:229`). Keep `:74` and `:244` exactly as they are — both already derive from `LEGS.length`. Add one behavioural test for the stamp-only fallthrough. |
| `tests/waybill.test.js`   | `:146` test name, `:299`, `:398`, `:604` (`index: 7`), `:771` — derive from `LEGS.length`.                                                                                        |
| `tests/cli.test.js`       | `:105`, `:208`, `:225`, `:237`, `:303`, `:313`, `:378`, `:450`, `:515` (comment), `:518`, `:612`, `:613`, `:667`, `:816` — derive from `LEGS.length`; add the `LEGS` import.       |
| `tests/commands.test.js`  | `:376` — derive from `LEGS.length`; add the `LEGS` import.                                                                                                                        |
| `tests/fixtures/no-docket.js` | `:5` — a comment quoting `leg 2 of 7 (bay)`; drop the total from the quoted string.                                                                                            |

### Deleted Files

None.

## Implementation Details

### 1. The wrapper-stamp table (`src/legs.js`)

**Pattern to follow**: `src/help.js:16` (`WRAPPER_STAMPS = { bay: 'bay exists', cleanup: 'merged,
bay gone' }`) — the same idea, same name, already keyed by leg id. `src/waybill.js:15`
(`ARGUMENT_SOURCES`) is the precedent for a `Map` over an object literal, and the reason given there
(a leg id of `constructor` finding a prototype function) applies identically here.

**Overview**: name the two legs that judge themselves, in the module that owns the leg model, so the
inference walk has nothing leg-specific left in it.

```js
/**
 * The legs that judge themselves rather than through a booking — the route's anchor and its
 * terminus. Every other leg is judged purely by its booking's stamp, so adding a leg to {@link LEGS}
 * needs no edit to the inference walk.
 *
 * A Map rather than an object literal, for the reason `ARGUMENT_SOURCES` in `src/waybill.js` is one:
 * a lookup table should not answer for keys it was never given.
 *
 * @type {Map<string, (state: RepoState) => boolean>}
 */
export const WRAPPER_STAMPS = new Map([
  ['bay', bayIsDone],
  ['cleanup', cleanupIsDone],
]);
```

**Key decisions**:

- Declared in `src/legs.js`, not `src/inference.js`: the anchor/terminus pairing is a fact about the
  leg model, and `tests/legs.test.js` has to be able to assert it against `LEGS` without importing
  the inference walk.
- Keyed by id and cross-checked against `owner` in the test, rather than derived from
  `owner === 'wrapper'` at runtime. A derived lookup would fail *silently* (an unstamped leg reads
  as never done, and the route stalls forever) if a future wrapper leg had no entry; the test turns
  that into a named failure at development time.
- Declared **after** `bayIsDone` and `cleanupIsDone` in the file — `const` bindings are not hoisted,
  so a table placed above them throws at module load.

**Implementation steps**: see the ordered TDD list below.

**Feedback loop**:

- **Playground**: `tests/legs.test.js`, created first with one smoke assertion.
- **Experiment**: assert `[...WRAPPER_STAMPS.keys()]` against the ids of every `owner: 'wrapper'`
  leg — in both directions, so neither a missing entry nor a stray one passes.
- **Check command**: `node --test tests/legs.test.js`

### 2. The generic stamp fallthrough (`src/inference.js`)

**Overview**: `legIsDone` stops naming legs. It asks the table; if the table has no answer, the
booking's `stampPath`/`stampCmd` decide, exactly as they do for `refine`, `contract`, `specs` and
`execute` today.

```js
function legIsDone(leg, state, bookings, warnings, progress) {
  const wrapper = WRAPPER_STAMPS.get(leg.id);
  if (wrapper) return wrapper(state);

  const booking = bookings.get(leg.id);
  if (!booking) return false;
  // ... unchanged from here: evaluateBooking, warnings, the progress-leg clause
}
```

**Key decisions**:

- Behaviour-preserving by construction. `bay` and `cleanup` resolve to the same two functions in the
  same order; every other leg takes the same path it takes today. The golden fixtures are the proof:
  they must not move.
- The `progress` clause (`src/inference.js:30-37`) is untouched. It is keyed off the declared
  `leg.progress` flag, which is already generic — a future progress leg needs no edit there either.
- `ideate` stays special-cased at the *call site* (`src/inference.js:120-121`), because it is judged
  on what came after it rather than on its own stamp and therefore cannot be a per-leg predicate.
  Do not try to fold it into the table.

**Feedback loop**:

- **Playground**: `tests/inference.test.js`, which already carries the repo fixtures.
- **Experiment**: drive `resolveLeg` with a hand-built bookings map (the `bookingMap` helper at
  `tests/inference.test.js:51`) in which a booking-owned leg is stamped by `stampCmd` alone — `true`
  and `false` — and assert the walk stops exactly where the stamp says. No `stampPath`, so the only
  thing that can be deciding is the generic fallthrough.
- **Check command**: `node --test tests/legs.test.js tests/inference.test.js`

### 3. `tests/legs.test.js`

**Pattern to follow**: `tests/inference.test.js:58-76` (the existing `describe('LEGS')` block) for
tone and shape — but do **not** move those two tests here. The roster test (`:59`) and the
fixture-count test (`:74`) stay where they are: `:74` is self-enforcing against `LEGS.length + 1`
and belongs beside the fixtures it counts, and duplicating the roster in two files means phase 5
updates it twice and they drift.

**Overview**: the invariants that survive a changing leg count. Pure — no `createRepo`, no git, no
temp dirs — so it runs in milliseconds and is the inner loop.

```js
import { LEGS, WRAPPER_STAMPS, bayIsDone, cleanupIsDone } from '../src/legs.js';
```

**Key test cases**:

- `bay` is the anchor: `LEGS[1].id === 'bay'`, it is `owner: 'wrapper'`, and no leg before it is
  wrapper-owned. (**Array index 1**, 0-based — which is **leg 2** in the 1-based numbering the
  waybills, the guide and `leg N of M` all use. Index 1, not 0, because `ideate` precedes it, and
  `ideate` leaves no papers. Later phases quoting this invariant must say which of the two numbers
  they mean.)
- `cleanup` is the terminus: `LEGS.at(-1).id === 'cleanup'` and it is `owner: 'wrapper'`. Stated
  positionally against the array's end, so it holds at any length.
- `bay` precedes `cleanup`, and `LEGS.length >= 3` — a route with no booking-owned leg between the
  anchor and the terminus is not a route.
- Leg ids are unique and non-empty. Duplicate ids would make `bookings.get(leg.id)` answer twice for
  one entry and make the strip print a leg name that means two positions.
- `WRAPPER_STAMPS` keys are exactly the ids of the `owner: 'wrapper'` legs — asserted both
  directions with a `deepEqual` of sorted arrays, so a missing entry and a stray entry both fail.
- `WRAPPER_STAMPS.get('bay') === bayIsDone` and `.get('cleanup') === cleanupIsDone` — the anchor and
  the terminus are stamped by the functions that are documented to stamp them, not by each other.
- Every `owner: 'booking'` leg is absent from `WRAPPER_STAMPS`, i.e. is judged by its booking alone.
- No test in this file asserts `LEGS.length === 7`, in any form. The count is the thing being
  de-hardcoded; asserting it here would reintroduce the defect in the file meant to remove it.

**Key decisions**:

- These are **behaviour** assertions — named tests with an exit code, per the `bang-line-exit-guard`
  learning in `docs/ideation/learnings.md`. Do **not** add a guard that forbids diffs to `src/legs.js`
  or compares it byte-for-byte against a snapshot; that style of guard blocks incidental correctness
  fixes and leaves known-stale text behind.

### 4. The test-literal sweep

**Overview**: mechanical. Every assertion that names the *total* derives it; every assertion that
names a leg's *index* keeps its literal.

**Key decisions**:

- **Totals derive, indexes stay literal.** `leg 3 of 7` becomes `` `leg 3 of ${LEGS.length}` `` —
  the `3` is a position in the route and is still correct. Phase 5 inserts `review` between
  `execute` and `cleanup`, so only `cleanup`'s index (7 → 8) moves, and that is phase 5's edit to
  make deliberately rather than phase 4's to pre-empt.
- `tests/waybill.test.js:604` passes `index: 7` into a synthetic "walk fell off the end" state. That
  **is** a total wearing an index's clothes — `src/inference.js:139` returns `LEGS.length` for that
  case — so it becomes `index: LEGS.length`.
- Regex literals become `new RegExp` with a template string. Escape what the regex needs (`\\/`,
  `\\(`); `·` needs no escaping. `tests/cli.test.js:225` already builds a `new RegExp` from a
  template and is the pattern to copy.
- Test *names* and *comments* saying "seven legs" are in scope here (`tests/inference.test.js:59`,
  `:73`, `:84`, `:224`, `:229`; `tests/waybill.test.js:146`; `tests/cli.test.js:515`;
  `tests/fixtures/no-docket.js:5`). A test called `is the fixed seven-leg model` that passes with
  eight legs is worse than no name at all.
- `tests/cli.test.js` and `tests/commands.test.js` do not import from `src/legs.js` yet; add
  `import { LEGS } from '../src/legs.js';` alongside the existing `src/` imports.
- **Golden fixtures are not touched.** `tests/golden/*.txt|md` legitimately contain `leg 5 of 7` as
  *rendered output*, and the count is still 7 after this phase.

**Feedback loop**:

- **Playground**: one suite at a time, cheapest first.
- **Experiment**: `waybill` (13s) → `commands` (4.9s) → `inference` (34s) → `cli` (78s), running the
  suite after each file is edited rather than batching all four.
- **Check command**: `node --test tests/waybill.test.js` (then the next file's suite in turn).

## Implementation Steps (TDD)

1. **Rebase onto phase 2 first.** Phase 2 modifies `src/bookings.js` (exit-127 warning) and
   `src/repo.js` (tilde expansion) and lands ahead of this phase. Confirm `git log --oneline` shows
   phase 2's commits before writing anything, and re-run `node --test tests/bookings.test.js` once
   after rebasing so a merge artefact in the shared file surfaces now rather than at the end.
2. **RED** — create `tests/legs.test.js` importing `WRAPPER_STAMPS` from `src/legs.js` with the
   anchor, terminus and ordering cases. `node --test tests/legs.test.js` fails: `WRAPPER_STAMPS` is
   `undefined`.
3. **GREEN** — add and export `WRAPPER_STAMPS` in `src/legs.js`, below `bayIsDone` and
   `cleanupIsDone`. `node --test tests/legs.test.js` passes.
4. **RED** — add the remaining `tests/legs.test.js` cases (keys match `owner: 'wrapper'` both
   directions; each key maps to its documented function; every booking-owned leg is absent). Confirm
   each fails for the right reason by temporarily deleting one map entry, then restore it.
5. **GREEN/REFACTOR** — rewrite `legIsDone` in `src/inference.js` to dispatch through the table.
   `node --test tests/legs.test.js tests/inference.test.js` passes with no other edit — this is
   behaviour-preserving, so a failure here means the refactor changed something.
6. **RED** — add the stamp-only fallthrough test to `tests/inference.test.js`: a `bookingMap` whose
   booking-owned leg carries `stampCmd` and no `stampPath`, asserted at `true` and at `false`. Write
   the `false` case first and watch the walk stop on that leg.
7. **GREEN** — it should already pass against step 5's code. If it does not, the fallthrough is not
   generic and the refactor is wrong; fix `legIsDone`, not the test.
8. **REFACTOR** — rewrite the `LEGS` doc comment in `src/legs.js:16-26`. Replace the `"7/7 legs" is a
   standing invariant` sentence with the invariant that is now enforced: the list is ordered, `bay`
   anchors it and `cleanup` terminates it, the count is derived everywhere, and `tests/legs.test.js`
   holds the line. Leave the `owner` paragraph — it is still accurate and now has a table backing it.
9. **Sweep the literals**, one file per commit-sized step, running that file's suite after each:
   `tests/waybill.test.js` → `tests/commands.test.js` → `tests/fixtures/no-docket.js` →
   `tests/inference.test.js` → `tests/cli.test.js`.
10. **Verify the sweep is complete** with the grep in Validation Commands. It must return nothing.
11. **Verify the goldens did not move**: `git status --short tests/golden/` must be empty. Do not run
    `UPDATE_GOLDEN=1` in this phase — see Failure Modes.
12. **Full suite**: `node --test tests/` exits 0.

## Testing Requirements

### Unit Tests

| Test File                 | Coverage                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `tests/legs.test.js`      | New. Anchor/terminus/ordering/uniqueness of `LEGS`; `WRAPPER_STAMPS` matches `owner` both ways.   |
| `tests/inference.test.js` | Extended. A booking-owned leg judged by `stampCmd` alone, proving the fallthrough is not id-keyed. |

### Regression Tests (existing, must stay green and unchanged in meaning)

| Test File                     | Why it matters here                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `tests/inference.test.js:74`  | Fixture count `=== LEGS.length + 1`. Self-enforcing; keep verbatim — it is phase 5's tripwire.  |
| `tests/inference.test.js:244` | `result.index === LEGS.length` when the walk falls off the end. Already derived; keep verbatim. |
| `tests/golden/**` (31 files)  | Byte-identical after this phase. Zero diff is the acceptance signal for the refactor.           |
| `tests/help.test.js`          | `MAX_LINES` budget — the route block grows by a row only in phase 5, so this must not move.     |

### Manual Testing

- [ ] `node bin/waybill help` — the ROUTE block still lists 7 rows, unchanged.
- [ ] `git status --short tests/golden/` — empty.
- [ ] `git diff --stat` names only the 9 files in File Changes.

## Error Handling

| Error Scenario                                              | Handling Strategy                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A leg id has no `WRAPPER_STAMPS` entry and no booking        | Unchanged from today: `legIsDone` returns `false` and `nextBlock` (`src/waybill.js:196-202`) prints "no booking is bound to the X leg". |
| A wrapper-owned leg is added to `LEGS` with no stamp entry   | `tests/legs.test.js` fails by name. No runtime handling — this is a development-time bug, not a user-facing state.                   |
| `evaluateBooking` throws or the stamp command cannot run     | Unchanged: warnings collected in place, leg reads not-done. Phase 2 makes the missing-binary case a named warning.                    |

## Failure Modes

| Component                | Failure Mode                          | Trigger                                                                                   | Impact                                                                                             | Mitigation                                                                                                    |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `WRAPPER_STAMPS`         | Silent stall on an unstamped leg      | A future wrapper-owned leg is added to `LEGS` with no map entry                             | The leg is never done, the route stalls there forever, and no warning is printed — the worst bug this tool has | `tests/legs.test.js` asserts the keys match `owner: 'wrapper'` in both directions                                 |
| `WRAPPER_STAMPS`         | Temporal dead zone at module load     | The `const` map is declared above `bayIsDone`/`cleanupIsDone` in `src/legs.js`              | Every `waybill` invocation throws `ReferenceError` on import — total outage of the CLI                 | Declare it after both functions; any test run catches it immediately, since every suite imports `src/legs.js`     |
| `legIsDone` refactor     | Behaviour drift disguised as a refactor | Dispatch order changed, or `ideate` accidentally folded into the table                      | A leg stamps at the wrong time; `ideate` back-stamping breaks and `no docket open` regresses           | Golden diff must be zero; `tests/golden/**` is the byte-level check the unit tests cannot be                      |
| Golden fixtures          | Re-blessed noise                      | An implementer hits a golden mismatch and reaches for `UPDATE_GOLDEN=1`                     | A real behavioural regression is committed as an "expected" fixture, and phase 5 inherits it            | This phase must produce **zero** golden diff. A mismatch is a bug, not a stale fixture. See the warning below     |
| Test-literal sweep       | Escaped-regex breakage                | `new RegExp` built from a template drops a `\\/` or `\\(`                                   | The assertion matches the wrong thing, or nothing, and passes vacuously or fails opaquely              | Run each file's suite immediately after editing it; never batch the sweep                                         |
| Test-literal sweep       | Vacuous green                         | Someone scopes a re-run with `--test-name-pattern`                                          | A filter matching nothing exits 0, so the sweep looks verified when it is not                           | Scope by file path only. This is a contract-level rule (`gates.criteria`), not a preference                       |
| Phase 2 overlap          | Merge artefact in `src/bookings.js`    | This phase is developed against a pre-phase-2 tree and rebased late                          | `evaluateBooking`'s new missing-binary warning is silently reverted, breaking a phase 2 criterion       | Rebase first (step 1) and re-run `tests/bookings.test.js` before starting                                         |
| Phase 5 overlap          | Golden collision                      | Phase 5 rewrites all 31 goldens for the 8-leg count while this branch is open                | A conflict in 31 generated files, resolvable only by regenerating                                       | Keep this phase's golden diff at zero and land it before phase 5 starts                                           |

**Re-blessing goldens**: `UPDATE_GOLDEN=1 node --test tests/` rewrites all 31 files in
`tests/golden/`. It must never be run reflexively. If it is ever run, the result has to be reviewed
as a `git diff`, line by line, with every changed line explained — a golden file that rewrites
itself during a normal run is a tautology, which is exactly why regeneration is an environment flag
(`tests/helpers/repo-fixture.js:230-248`). In this phase the correct golden diff is **empty**.

## Validation Commands

```bash
# Inner loop (sub-second)
node --test tests/legs.test.js

# Acceptance check 1 — the phase's own surfaces
node --test tests/legs.test.js tests/inference.test.js   # exits 0

# Acceptance check 2 — nothing else regressed
node --test tests/                                        # exits 0

# Acceptance check 3 — no test file asserts a bare leg total any more
grep -rnE '\b(of|all) 7\b|7 legs|seven[- ]legs?' tests/ --include='*.js'   # returns no matches (exit 1)

# The refactor must not move a single rendered byte
git status --short tests/golden/                          # prints nothing
```

There is no lint, typecheck, build or CI step in this repo — zero dependencies, ESM with JSDoc
types, Node >= 22, `node:test`, no justfile. `node --test` is the whole verification story.

**Never add `--test-name-pattern` to any of these.** It exits 0 when it filters out every test,
which makes the check vacuously green.

## Rollout Considerations

- **Feature flag**: none. No user-visible behaviour changes — the route is still 7 legs and every
  rendered byte is identical.
- **Breaking change**: none in this phase. Phase 5 carries the breaking change for plugin users.
- **Rollback plan**: revert the branch. Nothing persists outside the repo, no migration, no state.
- **Ordering**: land after phase 2 (shared `src/bookings.js`) and before phase 5 (shared goldens and
  `LEGS`). Blocking for phase 5 by the contract's `prereqs`.

## Open Items

- [ ] Confirm during step 1 that phase 2's `src/bookings.js` and `src/repo.js` changes are present in
      the branch before starting, so the rebase is not discovered at the end.
- [ ] Hand phase 5 the `src/` comment hits this phase deliberately leaves behind — `src/fleet.js:15`,
      `src/fleet.js:23`, `src/cli.js:375` — so its prose-sweep grep, which covers `src/`, is not a
      surprise.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
