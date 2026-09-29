# Implementation Spec: next drives the route — Phase 5

**Contract**: ./contract.md
**Estimated Effort**: S
**Tier**: Full — the route default from phase 1 is complete without this.

## Technical Approach

A booking may re-declare whether its leg is a gate. The route in `src/legs.js` supplies the default; a `gate:` key in booking frontmatter overrides it in either direction. The motivating case is a solo operator who reviews their own work and wants autopilot to cross `review`; the symmetric case — gating a leg the route ships un-gated, say `execute` on a machine where the operator wants to watch it — costs nothing extra once the resolution rule exists.

This mirrors what bookings already do. `src/bookings.js` lets a machine-local `~/.waybill/bookings` overlay rebook which carrier, model and effort run a leg, while `loadBookings({knownLegs})` rejects unknown legs (lines 64-66) so an overlay can never add a ninth leg to the route. Gates follow the same shape: re-declarable per leg, never creatable.

The one wrinkle is that frontmatter values are strings. `gate: false` parses as the string `"false"`, which is truthy. The parser must coerce explicitly, and reject anything that is neither `true` nor `false` rather than treating a typo as a silent `true` — a booking that says `gate: yes` and gets crossed unattended is exactly the failure this key exists to prevent.

`tests/guide.test.js:206` asserts every key in `src/bookings.js`'s `REQUIRED` + `OPTIONAL` appears as a code span in `docs/guide/03-reference.md`. Adding `gate` to `OPTIONAL` reddens that test the moment this phase lands, so the reference doc changes in the same commit.

## Feedback Strategy

**Inner-loop command**: `node --test tests/bookings.test.js tests/inference.test.js`

**Playground**: `tests/bookings-overlay.test.js` already builds a machine-local overlay directory via `WAYBILL_BOOKINGS_DIR` and asserts leg routing through it — the override needs no new harness.

**Why this approach**: The whole phase is frontmatter parsing plus one resolution rule, both of which the existing booking suites cover directly.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/bookings.js` | Add `gate` to `OPTIONAL` (lines 22-23). Coerce `"true"`/`"false"` to boolean; reject any other value with the same diagnostic shape the other keys use. |
| `src/inference.js` | Resolve `gate`: the booking's value when present, else the route's. One expression, at the point the leg object is built. |
| `docs/guide/03-reference.md` | Add the `gate` key to the booking-key table beside `handover` (line 66), with the resolution rule in one sentence. |
| `tests/bookings.test.js` | Parsing and rejection cases. |
| `tests/inference.test.js` | Resolution in both directions. |
| `tests/bookings-overlay.test.js` | An overlay that un-gates `review` and one that gates `execute`. |

## Implementation Details

### The `gate` booking key

**Pattern to follow**: `src/bookings.js`'s handling of `handover`, which is likewise an optional frontmatter key with a constrained value set.

**Overview**: One key, three accepted states — absent, `true`, `false`.

```js
// src/bookings.js
const OPTIONAL = ['effort', 'handover', 'argument', 'stampPath', 'stampCmd', 'gate'];

function parseGate(raw, legId) {
  if (raw === undefined) return undefined;          // absent: defer to the route
  if (raw === 'true')    return true;
  if (raw === 'false')   return false;
  throw new Error(`booking for ${legId}: gate must be true or false, not ${raw}`);
}
```

```js
// src/inference.js — where the leg object is built
const gate = booking.gate ?? routeLeg.gate ?? false;
```

**Key decisions**:

- `undefined` and `false` mean different things at the booking level and must not be collapsed. Absent defers to the route; `false` overrides it. `??` rather than `||` is load-bearing.
- Reject unrecognised values rather than coercing. A machine-local overlay is edited by hand and rarely read again; a typo that silently un-gates a leg would surface only as an unattended run that did not stop.
- No `gate` on wrapper legs' self-stamps. `bay` and `cleanup` have booking files, so the key works for them through the same path as any other leg; `ideate`'s override is accepted and inert, exactly like its route default.

**Implementation steps**:

1. Write the failing parse cases — absent, `true`, `false`, and `yes`.
2. Add `gate` to `OPTIONAL` and implement `parseGate`.
3. Write the failing resolution cases — booking silent, booking `true` over route absent, booking `false` over route `true`.
4. Add the `??` chain in `src/inference.js`.
5. Add the `gate` code span to `docs/guide/03-reference.md`.

**Feedback loop**:

- **Playground**: `tests/bookings-overlay.test.js`'s overlay builder, pointed at `WAYBILL_BOOKINGS_DIR`.
- **Experiment**: Build an overlay that sets `gate: false` on `review` and walk the fixture under autopilot; assert the walk halts twice, not three times, and that `cleanup` is reached in the same run. Then build one that sets `gate: true` on `execute` and assert the walk gains a halt.
- **Check command**: `node --test tests/bookings-overlay.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/bookings.test.js` | Parsing: absent, `true`, `false`, invalid |
| `tests/inference.test.js` | Resolution in both directions |
| `tests/bookings-overlay.test.js` | End-to-end through a machine-local overlay |
| `tests/guide.test.js` | The key is documented |

**Key test cases**:

- `gate: false` on a booking whose route entry is `gate: true` resolves to false.
- `gate: true` on a booking whose route entry has no `gate` resolves to true.
- An absent `gate` resolves to the route's value, and does not resolve to false.
- `gate: yes` is rejected, naming the leg and the value.
- An overlay un-gating `review` reduces the full-walk halt count from three to two.
- An overlay cannot introduce a leg the route does not know — the existing `loadBookings({knownLegs})` rejection at lines 64-66 still holds.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `parseGate` | `"false"` treated as truthy | String value used without coercion | A leg the operator explicitly un-gated still halts, or worse, a gated one does not | Explicit string comparison; a test for each of the four inputs |
| Resolution | `\|\|` used instead of `??` | Ordinary refactor | `gate: false` collapses into "absent" and the route wins | The absent-vs-false distinction has its own test |
| Overlay | A typo silently un-gates a destructive leg | Hand-edited machine-local file | Autopilot crosses a leg the operator meant to watch | Invalid values throw at load, naming leg and value |
| Docs | `gate` missing from the reference | The key lands without the doc | `tests/guide.test.js:206` fails the build | Same-commit requirement, called out in this phase's file list |

## Validation Commands

```bash
# Inner loop
node --test tests/bookings.test.js tests/inference.test.js

# Overlay behaviour
node --test tests/bookings-overlay.test.js

# Docs coupling
node --test tests/guide.test.js

# Full suite
node --test tests/
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
