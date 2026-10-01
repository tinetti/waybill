# Implementation Spec: Leg Renames and a Six-Leg Route - Phase 3

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

This phase exists because two of the contract's claims were unbacked, and the success-criteria critic caught both. It adds test cases and nothing else — no source changes.

The first claim is the load-bearing one behind an **out-of-scope** decision. The contract declines to build any migration for a machine-local `~/.waybill/bookings` overlay that binds a retired leg id, on the grounds that `waybill doctor` already handles it: `checkBookings` (`src/doctor.js:405-429`) catches the `resolveBookings` throw, degrades it to `warn` rather than `fail` precisely so doctor stays runnable on the machine it is diagnosing, and prints the offending file with the error's first line. That is true — but no test proves it for the case this change creates. The only existing overlay-warn case (`tests/doctor.test.js:401`) uses a **duplicate-leg** fixture and asserts `/duplicate leg/`; nothing exercises an *unknown* leg through doctor. So the criterion backing the decision passes today, passes after the change, and could never have failed.

The second claim is the sole surviving justification for keeping the brainstorm as a booking at all. The scope-creep critic withdrew the other one: `tests/commands.test.js:204-216` reads the booking by filename via `parseFrontmatter`, not through `loadBookings`, so that pin only ever needed a file on disk. What remains is per-machine rebookability of a carrier that is no longer on the route — and nothing exercises it. A generality nobody tests is a generality nobody can claim.

Both gaps close with one small test case each.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Machine-local overlay breakage is a release note, backed by a new doctor test** — rejected: build a migration, or extend `waybill doctor` to recognise the rename. The mechanism already works; one test case makes the out-of-scope call honest.
- **Keep the brainstorm as a booking, prove rebookability with a test** — rejected: hardcode `/ideation:brainstorm` into `new.md`. Note the withdrawn justification: the `commands.test.js` pin reads by filename, not through the loader.
- **Every `cmd` check pairs a positive assertion with its negative half** — rejected: bare negated greps. A negated grep passes for free when nothing can ever emit the string.
- **Carry the off-route booking as one exported id constant** — rejected: an `offRoute` frontmatter key, a `Booking` field, or a parallel loader.
- **Pointing overlay failure messages at `waybill doctor`** is explicitly **out of scope** — a real one-line gap, but it improves every overlay failure rather than anything this rename introduces.
- **Collapse the brainstorm leg into `/waybill:new`** — rejected: keep it as leg 1 with `stampCmd: false`.
- **Name each leg for the work its booking does** — rejected: name each leg for its stamp.
- **Merge `refine` into `contract`, call it `ideate`** — rejected: keep two legs.
- **The merged `ideate` inherits `handover: transfer`** — rejected: inherit `through`.
- **Accept that three leg ids match their carrier only by namespace** — rejected: renaming the vendored spec commands.
- **Ship rename, removal and `new` rework as one change** — rejected: two PRs.
- **`/waybill:new` keeps `src/waybill.js` untouched** — rejected: a pre-route rendering mode.
- **The ride-along's headings and fences move into the goldens phase** — rejected: keeping all guide edits together.

## Feedback Strategy

**Inner-loop command**: `node --test tests/doctor.test.js tests/booking-swap.test.js`

**Playground**: the existing overlay test harness. `tests/bookings-overlay.test.js:37-42` has an `isolated()` wrapper that re-pins `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_SYSTEM` to `/dev/null` and unsets `WAYBILL_BOOKINGS_DIR` per case — copy that shape rather than inventing a new one.

**Why this approach**: both cases are pure assertions over a temp-directory fixture; the suite runs them in under a second and there is nothing visual to inspect.

## File Changes

### New Files

None.

### Modified Files

| File Path | Changes |
| --- | --- |
| `tests/doctor.test.js` | Add a case: write an overlay binding a **retired** leg id, run doctor, assert the `bookings` row is `warn` with a detail matching `/unknown leg/`, and assert doctor itself still completes. |
| `tests/booking-swap.test.js` | Add a case: an overlay rebooking the **brainstorm** carrier, asserting the swapped command is what `/waybill:new` would resolve. |

### Deleted Files

None.

## Implementation Details

### Doctor survives a retired leg in an overlay

**Pattern to follow**: `tests/doctor.test.js:401-411` — the existing "warns rather than failing on a malformed overlay" case, which uses a duplicate-leg fixture. Copy its structure, change the fixture.

**Overview**: Prove the escape hatch the out-of-scope decision depends on.

**Key decisions**:

- Use a genuinely retired id — `refine`, `contract`, or `specs` — not a nonsense string. The failure this models is a real user's `~/.waybill/bookings/ideation-specs.md` after the rename ships, and a nonsense id would not demonstrate that.
- Assert **two** things: the verdict is `warn` (not `fail`), and doctor's run completes. A `fail` here would be a regression in its own right — `src/doctor.js:394-400`'s comment explains that doctor has to stay runnable on the machine it is diagnosing.
- Assert on the detail matching `/unknown leg/`, which is the message `src/bookings.js:97-98` produces. That string is what tells the user which file to fix.

**Implementation steps**:

1. Write the case; confirm it **fails** before phase 1's ids exist as "retired" — or, if run after phase 1, confirm it fails when pointed at a currently-valid id.
2. Build the overlay fixture with a single booking whose `leg:` is a retired id, using the `isolated()` wrapper.
3. Assert verdict `warn`, detail matching `/unknown leg/`, and that the remaining doctor checks still report.

**Feedback loop**:

- **Playground**: a temp overlay directory under the existing harness.
- **Experiment**: a retired id (expect `warn`), a valid id (expect `info` with the rebooked count), and an absent directory (expect `info`, the healthy steady state).
- **Check command**: `node --test tests/doctor.test.js`

### An overlay can rebook the brainstorm carrier

**Pattern to follow**: `tests/bookings-overlay.test.js:338-371` — the existing overlay-builds-a-`specs`-booking cases.

**Overview**: Prove the one thing that justifies keeping the brainstorm a booking rather than a hardcoded string.

**Key decisions**:

- Assert on the **resolved command**, not merely that the file loaded. The claim is that a work machine could point the brainstorm at a different carrier; only the resolved command demonstrates it.
- The success criterion greps `tests/booking-swap.test.js` for the literal `brainstorm`, so the case belongs in that file specifically.
- Keep the overlay booking's `stampCmd: false` — `src/bookings.js:91-96` throws without a stamp, off-route or not.

**Implementation steps**:

1. Write the case asserting the rebooked command; confirm it fails with no overlay present.
2. Build an overlay with `leg: brainstorm` and a different `command:`.
3. Resolve bookings and assert the brainstorm entry carries the overlay's command, not the shipped one.

**Feedback loop**:

- **Playground**: the same temp-overlay harness.
- **Experiment**: overlay present (expect the swapped command), overlay absent (expect `/ideation:brainstorm`).
- **Check command**: `node --test tests/booking-swap.test.js tests/bookings-overlay.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/doctor.test.js` | A retired leg id in an overlay degrades to `warn`, names the file, and leaves doctor runnable. |
| `tests/booking-swap.test.js` | An overlay rebooks the brainstorm carrier; the resolved command is the overlay's. |

**Key test cases**:

- Overlay binding `leg: specs` after the rename → `bookings` row is `warn`, detail matches `/unknown leg/`.
- The same run still reports its other checks — doctor does not abort.
- Overlay binding `leg: brainstorm` with a different command → that command resolves.
- Edge case: no overlay configured → `info`, "no overlay in force", which `src/doctor.js:396-397` calls the healthy steady state and must not become a warning.
- Edge case: overlay directory configured but absent → `info`, not an error.

### Manual Testing

- [ ] With a real `~/.waybill/bookings/ideation-specs.md` in place, run `waybill doctor` against a post-rename checkout and confirm it names the file and the leg.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Doctor overlay case | Tautological assertion | The new case reuses the duplicate-leg fixture | The criterion still cannot fail; the out-of-scope decision stays unbacked | Fixture must use a retired leg id; assert `/unknown leg/`, not `/duplicate leg/` |
| Doctor overlay case | Verdict drifts to `fail` | A future change treats a malformed overlay as fatal | Doctor stops being runnable on exactly the machine that needs it | Assert `warn` explicitly, not merely "not ok" |
| Rebooking case | Asserts loading, not rebooking | The case checks the file parses but not the resolved command | The generality remains unproven; the booking's existence stays unjustified | Assert the resolved command differs from the shipped one |
| Both cases | Environment bleed | `WAYBILL_BOOKINGS_DIR` or a real global git config leaks into the fixture | Tests pass or fail based on the developer's machine | Use the `isolated()` wrapper at `tests/bookings-overlay.test.js:37-42` |

## Validation Commands

```bash
# Inner loop
node --test tests/doctor.test.js tests/booking-swap.test.js

# Phase gate
node --test tests/
```

Note: `tests/guide.test.js` and the leg goldens remain red until phase 4.

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
