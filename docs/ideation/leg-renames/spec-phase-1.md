# Implementation Spec: Leg Renames and a Six-Leg Route - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

`src/legs.js`'s `LEGS` array is the route — the file says so outright, and every other module derives from it (route length, the tick strip, the inference walk, the `knownLegs` validation set). This phase edits that array and everything that breaks as a direct consequence, and nothing else.

Three things happen at once because they cannot be separated. The array drops from eight entries to six with four ids changed. The `ideate` leg's backwards-judging machinery — `ideateIsDone` in `src/legs.js` and the hardcoded index-0 branch in `src/inference.js` — is deleted outright, because the leg it existed to serve is gone. And the booking files and test fixtures, both of which are keyed by leg id, go through a **three-way rename with a filename collision**: today's `ideation-ideate.md` is the brainstorm booking, but the merged contract leg takes the id `ideate`, so the old name must be vacated before the new occupant can take it.

The off-route brainstorm booking needs to load without being a leg. The mechanism already exists: `loadBookings` only rejects a booking whose `leg:` is absent from the caller-supplied `knownLegs` set (`src/bookings.js:97-98`), and that set is constructed identically at four call sites. Widening it by one id is the entire change — no new frontmatter key, no `offRoute` field on `Booking`, no second loader function.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Name each leg for the work its booking does** — rejected: name each leg for its stamp. Carrier-naming reads better against the booking file and fixes the verb/noun mix; three ids match only by namespace.
- **Merge `refine` into `contract`, call it `ideate`** — rejected: keep two legs. One carrier, no gate between; `contract.md` is downstream of `contract-data.json` so no coverage is lost.
- **The merged `ideate` inherits `handover: transfer`** — rejected: inherit `through`. The interview is long and previously got a fresh session.
- **Collapse the brainstorm leg into `/waybill:new`** — rejected: keep it as leg 1 with `stampCmd: false`. It was the only leg not judged from its own papers, forcing two special cases.
- **Keep the brainstorm as a booking, prove rebookability with a test** — rejected: hardcode `/ideation:brainstorm` into `new.md`. Note the withdrawn justification: `tests/commands.test.js:204-216` reads by filename, not through `loadBookings`.
- **Carry the off-route booking as one exported id constant** — rejected: an `offRoute` frontmatter key, an `offRoute` field on `Booking`, or a parallel loader. One file does not justify a second booking category.
- **Accept that three leg ids match their carrier only by namespace** — rejected: renaming the vendored spec commands, which pulls in `src/doctor.js:215-258` and every machine's symlinks.
- **Ship rename, removal and `new` rework as one change** — rejected: two PRs. A split rewrites 33 byte-exact goldens twice.
- **`/waybill:new` keeps `src/waybill.js` untouched** — rejected: a pre-route rendering mode. `position()` already returns `no docket open` on that path.
- **`/waybill:new` proposes a branch name (Full tier)** — rejected: a placeholder. Inverts `commands/bay.md:91` for this one path, deliberately.
- **Machine-local overlay breakage is a release note, backed by a new doctor test** — rejected: a migration or doctor change.
- **The ride-along's headings and fences move into the goldens phase** — rejected: keeping all guide edits together. `tests/guide.test.js` couples them to `LEGS` in one assertion.
- **Every `cmd` check pairs a positive assertion with its negative half** — rejected: bare negated greps.

## Feedback Strategy

**Inner-loop command**: `node --test tests/legs.test.js tests/bookings.test.js tests/inference.test.js`

**Playground**: the repo's own test suite. `package.json:15` declares one script (`node --test tests/`); there is no lint, typecheck, or build step, and no `justfile`.

**Why this approach**: every change in this phase is a data-structure edit whose consequences surface as assertion failures within a second — the test runner is the tightest possible loop, and no part of this phase produces visual or interactive output.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `bookings/ideation-brainstorm.md` | Today's `ideation-ideate.md`, renamed. The off-route brainstorm booking (`leg: brainstorm`, `command: /ideation:brainstorm`). |
| `bookings/openspec-specify.md` | Today's `openspec-specs.md`, renamed. |
| `tests/fixtures/brainstorm.js` | Today's `ideate.js`, renamed. |
| `tests/fixtures/specify.js` | Today's `specs.js`, renamed. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/legs.js` | `LEGS` down to six entries (`bay`, `ideate`, `specify`, `execute`, `review`, `cleanup`); delete `ideateIsDone` and its JSDoc; add `OFF_ROUTE_BOOKINGS` and a derived `BOOKABLE_IDS`. |
| `src/inference.js` | Delete the index-0 branch at `:140-146` — both the `if (i === 0) return false;` skip and the `done[0] = ideateIsDone(...)` assignment. Use `BOOKABLE_IDS` for the `knownLegs` set at `:75`. |
| `src/cli.js` | `KNOWN_LEGS` at `:87` built from `BOOKABLE_IDS`; a new `LEG_IDS` (route ids only) for `parseTarget`; the leg-1 prose in `firstLeg`'s JSDoc and its runtime warning. |
| `src/doctor.js` | `KNOWN_LEGS` at `:29` built from `BOOKABLE_IDS`. |
| `src/help.js` | `knownLegs` at `:122` built from `BOOKABLE_IDS`; `STAMP_LABELS` (`:13-18`) re-keyed to the new ids. |
| `bookings/ideation-ideate.md` | **Replaced** by today's `ideation-contract.md`, absorbing `ideation-refine.md`'s body. Keeps `leg: ideate`, `stampPath: docs/ideation/*/contract.md`, and takes `handover: transfer`. |
| `tests/fixtures/ideate.js` | **Replaced** by the merge of today's `refine.js` and `contract.js`. |
| `tests/commands.test.js` | `:213` re-pointed from `'ideation-ideate.md'` to `'ideation-brainstorm.md'`. |
| `tests/legs.test.js` | Index anchor `:22` from `LEGS[1].id === 'bay'` to index 0, with its comment's rationale rewritten; the wrapper-owned `findIndex` assertion likewise; add an explicit `deepEqual` on the full id list. |
| `tests/bookings.test.js` | Add a case asserting `ideation-brainstorm.md` loads and is not a leg. |
| `tests/inference.test.js` | `:100` fixture count `LEGS.length + 2` (now 8 — see Open Items); `:114` booking-map keys now compare against `BOOKABLE_IDS`, not `KNOWN_LEGS`. |
| `tests/help.test.js` | The `names the stamp for each shipped leg` map re-keyed to the six route ids (`ideate` now shows `contract.md`, not `repo state`). |
| `tests/booking-swap.test.js`, `tests/bookings-overlay.test.js`, `tests/waybill.test.js`, `tests/cli.test.js` | Fixture imports re-pointed; leg-id literals updated. |
| `tests/frontmatter.test.js` | Leg-id literals updated. |

### Deleted Files

| File Path | Reason |
| --- | --- |
| `bookings/ideation-refine.md` | Merged into the `ideate` booking; `contract.md` is a strictly stronger stamp than `contract-data.json`. |
| `tests/fixtures/refine.js` | Merged into the new `ideate.js`. |
| `tests/fixtures/contract.js` | Becomes the new `ideate.js`. |
| `tests/fixtures/specs.js` | Becomes `specify.js`. |

## Implementation Details

### The LEGS array

**Pattern to follow**: `src/legs.js:32-41` — the existing array, with its per-entry `id` / `owner` shape.

**Overview**: Six entries in route order. `bay` moves to index 0 and becomes the first wrapper-owned leg.

```js
export const LEGS = [
  { id: 'bay',     owner: 'wrapper' },
  { id: 'ideate',  owner: 'booking' },
  { id: 'specify', owner: 'booking' },
  { id: 'execute', owner: 'booking', progress: true },
  { id: 'review',  owner: 'booking' },
  { id: 'cleanup', owner: 'wrapper' },
];

/** Bookings that ship with Waybill but are not legs. `/waybill:new` resolves the brainstorm here. */
export const OFF_ROUTE_BOOKINGS = ['brainstorm'];

/** Every id a shipped or overlaid booking may legitimately bind. */
export const BOOKABLE_IDS = [...LEGS.map((leg) => leg.id), ...OFF_ROUTE_BOOKINGS];
```

**Key decisions**:

- `OFF_ROUTE_BOOKINGS` is a plain array of ids, not a category with behavior. The contract rejects an `offRoute` frontmatter key or a `Booking` field explicitly.
- `BOOKABLE_IDS` exists so the concat happens once rather than at four call sites — a shared derivation, not an abstraction.
- Keep the existing `progress: true` on `execute`; it is unrelated to this change.

**Implementation steps**:

1. Write the failing assertion first: add `assert.deepEqual(LEGS.map((l) => l.id), ['bay', 'ideate', 'specify', 'execute', 'review', 'cleanup'])` to `tests/legs.test.js`.
2. Rewrite `LEGS`; add `OFF_ROUTE_BOOKINGS` and `BOOKABLE_IDS`.
3. Delete `ideateIsDone` and its JSDoc block entirely.
4. Fix `tests/legs.test.js`'s index anchor to 0 and rewrite the comment — its stated reason ("`ideate` precedes it, and `ideate` leaves nothing to stamp") no longer describes anything.

**Feedback loop**:

- **Playground**: `tests/legs.test.js`, which is deliberately count-free and asserts route shape only.
- **Experiment**: run it before and after the array edit; confirm the new `deepEqual` fails first.
- **Check command**: `node --test tests/legs.test.js`

### The inference walk

**Pattern to follow**: `src/inference.js:120-186` — `inferState`'s existing leg walk.

**Overview**: With no leg judged backwards, the walk has no special first case. Both statements go.

**Key decisions**:

- Delete, do not inline. Retaining `if (i === 0) return false;` under a different justification is exactly the failure the contract's goal 3 names, and the success criterion greps for `i === 0` and `done[0]` as well as `ideateIsDone`.
- `bay` at index 0 is wrapper-owned and self-judging (`WRAPPER_STAMPS`), so the walk's general path already handles it.

**Implementation steps**:

1. Delete the index-0 branch at `:140-146`.
2. Update the comments at `:1,134,137,151` that name `ideateIsDone`.
3. Re-point the `knownLegs` construction at `:75` to `BOOKABLE_IDS`.
4. Update `tests/inference.test.js:114` to compare booking-map keys against `BOOKABLE_IDS` — the map now legitimately holds one more entry than there are legs.

**Feedback loop**:

- **Playground**: `tests/inference.test.js`, the heaviest suite (~75 leg-name assertions).
- **Experiment**: a docket at each of the six legs plus the no-docket trunk case; confirm `completed` / `skipped` arrays shift correctly now that index 0 is a real stamped leg.
- **Check command**: `node --test tests/inference.test.js`

### The booking and fixture shuffle

**Overview**: Two directories keyed by leg id, both carrying the same collision. Order matters.

**Key decisions**:

- Vacate `ideation-ideate.md` **before** moving `ideation-contract.md` onto that name. Use `git mv` in sequence so the rename is visible in history rather than appearing as a delete plus an add.
- Re-point `tests/commands.test.js:213` in this phase, not later. All three ideation bookings are `opus`/`high`, so if the pin is left alone it silently begins asserting `new.md`'s model against the *merged contract* booking and still passes — leaving the brainstorm booking, the one it exists to pin, unpinned.
- The brainstorm booking must keep `stampCmd: false`. `src/bookings.js:91-96` throws on a booking that defines neither `stampPath` nor `stampCmd`, and that validation does not care whether the booking is a leg.

**Implementation steps**:

1. `git mv bookings/ideation-ideate.md bookings/ideation-brainstorm.md`; set `leg: brainstorm`.
2. `git mv bookings/ideation-contract.md bookings/ideation-ideate.md`; keep `leg: ideate` and the `contract.md` stamp; change `handover: through` to `handover: transfer`; fold `ideation-refine.md`'s body text into it.
3. `git rm bookings/ideation-refine.md`.
4. `git mv bookings/openspec-specs.md bookings/openspec-specify.md`; set `leg: specify`.
5. Same sequence in `tests/fixtures/`: `ideate.js` → `brainstorm.js`; `contract.js` → `ideate.js` absorbing `refine.js`; `specs.js` → `specify.js`; delete `refine.js`.
6. Fix the fixture import chain — today `contract.js:4` imports `refine.js`, `specs.js:4` imports `contract.js`, and `execute.js:4` / `review.js:4` import `specs.js`.
7. Re-point `tests/commands.test.js:213`.

**Feedback loop**:

- **Playground**: `tests/bookings.test.js` and `tests/frontmatter.test.js` for the bookings; `tests/inference.test.js` for the fixture count.
- **Experiment**: after each `git mv`, run the loader — a half-finished shuffle should throw `unknown leg`, which confirms the validation is live.
- **Check command**: `node --test tests/bookings.test.js tests/frontmatter.test.js tests/inference.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/legs.test.js` | Route shape; the new explicit id-list `deepEqual`; index anchor at 0. |
| `tests/bookings.test.js` | Every leg bound to a booking; the off-route brainstorm booking loads and is not a leg. |
| `tests/inference.test.js` | The leg walk with no special first case; fixture count `LEGS.length + 2`; booking-map keys against `BOOKABLE_IDS`. |
| `tests/booking-swap.test.js` | Leg↔booking rebinding under the new ids. |
| `tests/frontmatter.test.js` | Booking frontmatter validity under the new `leg:` values. |

**Key test cases**:

- `LEGS` is exactly `['bay','ideate','specify','execute','review','cleanup']`.
- A booking declaring a retired id (`refine`, `contract`, `specs`) throws `unknown leg`.
- `bookings/ideation-brainstorm.md` loads, carries `command: /ideation:brainstorm`, and is absent from `LEGS`.
- The fixture directory holds exactly eight files (`LEGS.length + 2` — see Open Items).
- Edge case: `bay` at index 0 is still recognised as the first wrapper-owned leg.
- Error case: a booking with neither `stampPath` nor `stampCmd` still throws, brainstorm included.

### Manual Testing

- [ ] `git log --follow bookings/ideation-ideate.md` shows the contract booking's history, not the brainstorm's.
- [ ] A deliberately half-finished shuffle throws `unknown leg` rather than silently loading.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Booking shuffle | Silent pin drift | `tests/commands.test.js:213` left at `'ideation-ideate.md'` | The pin asserts against the merged contract booking and passes; the brainstorm booking's model/effort go unpinned forever | Re-point in this phase; success criterion greps `tests/bookings.test.js` for `ideation-brainstorm` |
| Booking shuffle | Rename collision | `ideation-contract.md` moved onto `ideation-ideate.md` before the old file is vacated | Overwritten brainstorm booking, lost history | Strict `git mv` ordering, step 1 before step 2 |
| `ideateIsDone` removal | Relocated rather than deleted | Helper deleted but `if (i === 0) return false;` inlined | The special case survives under a new name; goal 3 unmet | Success criterion greps `ideateIsDone`, `i === 0` and `done\[0\]` together |
| `BOOKABLE_IDS` | Off-route booking surfaces as a route leg | `OFF_ROUTE_BOOKINGS` folded into `LEGS` rather than alongside it | `brainstorm` reappears in the route, tick strip, and `leg N of M` | `tests/legs.test.js`'s explicit id-list `deepEqual` fails immediately |
| Fixture merge | Broken import chain | `refine.js` deleted without fixing `contract.js:4` | Five suites fail to import | Step 6 fixes the chain explicitly |
| Booking loader | Brainstorm booking rejected | `stampCmd: false` dropped during the rename | `src/bookings.js:91-96` throws; every `/waybill:*` command fails | Stated as a constraint; `tests/bookings.test.js` case covers it |

## Validation Commands

```bash
# This repo has no lint, typecheck, or build step — package.json:15 declares one script.

# Inner loop
node --test tests/legs.test.js tests/bookings.test.js tests/inference.test.js

# Phase gate
node --test tests/
```

Note: `tests/guide.test.js` and the golden comparisons are expected to be **red** at the end of this phase. They are settled in phase 4, which owns the goldens and the ride-along together.

## Implementation Notes

_Written during implementation; these record where the shipped diff differs from the spec above._

- **`/waybill:new` hands off `bay`, not the brainstorm, for the length of this phase.** `firstLeg` (`src/cli.js:430,434`) resolves `LEGS[0]`, and `LEGS[0]` is now `bay`, so `waybill new` prints `/waybill:bay`. `tests/cli.test.js:489,528` were re-pointed at that carrier rather than added to the expected-red list, because they are plain assertions and an undeclared red suite would hide a real regression at the phase gate. **Phase 2 owns the fix**: `/waybill:new` resolves the brainstorm booking *by name* out of `OFF_ROUTE_BOOKINGS`, and those two assertions go back to `/ideation:brainstorm`.
- **`tests/help.test.js` is a spec gap.** The `names the stamp for each shipped leg` map is keyed by leg id, so the `LEGS` edit breaks it directly, but the file appeared in neither the Modified Files table nor the expected-red note. It has been added to the table and re-keyed to the six route ids, with `ideate: 'contract.md'` (its `stampPath` is `docs/ideation/*/contract.md`, so `stampOf` renders the basename, not the `repo state` fallback).
- **Golden filenames stay on the new leg ids.** `tests/cli.test.js:98,802` now both read `GOLDEN/specify.txt` and `GOLDEN/specify.md`, matching `tests/waybill.test.js`'s golden case table, which is driven off the leg ids. Neither file exists yet, so both throw `ENOENT` — deliberately inside the expected-red golden set. **Phase 4 renames the golden files** (`specs.*` → `specify.*`, `contract.*`/`refine.*` folded into `ideate.*`) and regenerates their contents; there is one baseline to reconcile, not two.
- **`LEG_IDS` in `src/cli.js:92-93` is a deliberate in-phase addition** the spec did not list. `parseTarget` must be given the route's ids only: handing it the widened `BOOKABLE_IDS` would make `<branch>/brainstorm` parse as a leg token for a position that does not exist.
- **The renderer suite's synthetic states were re-pointed, not merely re-imported.** `tests/waybill.test.js`'s `state()` and its derived fixtures named `specs`/`refine`/`contract` and carried old indices; `strip()` walks `LEGS` positionally, so several of them were failing outright. They now read `bay`/`ideate`/`specify` at their live positions.

## Open Items

- **Spec correction: the fixture count is `LEGS.length + 2`, not `+ 1`.** The arithmetic at `:65` and the "exactly seven files" wording under Key test cases were wrong, and both have been corrected above. The post-rename directory holds eight files — `bay`, `brainstorm`, `cleanup`, `execute`, `ideate`, `no-docket`, `review`, `specify` — because `brainstorm.js` is a net-new off-route fixture *on top of* the pre-existing `no-docket.js`. The contract's success criterion should be checked against eight.
- **Adjacent, not fixed here:** two prose claims about the old `ideate` leg survive outside this phase's change list. `bookings/waybill-bay.md`'s body still says the bay leg's `stampCmd` never succeeds "exactly as the ideate leg's does not", and `commands/new.md:74` still says "the ideate leg writes nothing to disk". Both are false now that `ideate` stamps `docs/ideation/*/contract.md`. `commands/new.md` is phase 2's file (the `/waybill:new` rework), and the booking body is byte-compared by the phase-4 goldens; fix each where it lands. The equivalent claim inside `src/cli.js`'s runtime warning *was* corrected here, because it is operator-visible.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
