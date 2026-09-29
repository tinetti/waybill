# Implementation Spec: next drives the route — Phase 1

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

`src/legs.js` holds an exported `LEGS` array whose doc comment states that "this ordered list _is_ the route". Each entry is `{id, owner, progress?}`. This phase adds one optional key — `gate` — set true on `ideate`, `refine`, `contract` and `review`, and absent elsewhere. Nothing reads it yet; phases 3 and 4 do.

Keeping this phase to pure data is deliberate. The route is the one place in waybill that carries the shape of an effort, and every later phase keys off `gate`, so landing it alone means a bisect that fingers gate semantics can only be pointing at the consumer, never at the declaration.

Two surfaces document the route and must learn the word in the same commit: `src/help.js`'s `ROUTE` block, which renders the route table for `/waybill:help`, and `docs/guide/03-reference.md`. Neither is optional politeness — `tests/help.test.js` and `tests/guide.test.js` both assert against rendered route content, and introducing a route property that the route's own documentation doesn't mention is exactly the prose drift `docs/ideation/learnings.md` records against this repo.

`ideate`'s gate flag is documentation-only and must be commented as such. `src/cli.js:278` refuses when no docket is open, and `src/legs.js:131` marks `ideate` done the moment one is, so `next` can never land on it. The flag is true because the route should tell the truth about which legs belong to a human, not because anything in this project reads it.

## Feedback Strategy

**Inner-loop command**: `node --test tests/legs.test.js`

**Playground**: The existing `node:test` suite. `tests/legs.test.js` already covers the `LEGS` array and the wrapper stamp map, so the describe block to extend is in place.

**Why this approach**: This phase is a data change with a documentation obligation; a scoped test run over the route's own suite is the tightest loop, and the two doc surfaces are covered by their own suites in the same run.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/legs.js` | Add `gate: true` to the `ideate`, `refine`, `contract` and `review` entries in `LEGS` (lines 32-41). Extend the array's doc comment (lines 16-31) to define a gate as "a leg waybill will not cross unattended". Add an inline comment on `ideate` recording that its flag is documentation-only. |
| `src/inference.js` | Carry `gate` through onto the resolved leg object so `resolveLeg`'s consumers can read it without re-importing `LEGS`. |
| `src/help.js` | Add the gate marker to the `ROUTE` block so `/waybill:help` renders which legs are gates. |
| `docs/guide/03-reference.md` | Add a gate column (or marker) to the route table and one paragraph defining the term alongside the existing `handover` definition at line 66. |
| `docs/guide/02-glossary.md` | Add `gate` to the glossary, matching the tone of the existing entries (`trunk`, `docket`, `bay`, `leg`, `stamp`, `booking`, `carrier`, `waybill`). |
| `tests/legs.test.js` | Add the `route declares its gates` case. |
| `tests/golden/*` | Re-bless any route-rendering golden that `src/help.js` changes, via `UPDATE_GOLDEN=1`. Review each diff by eye — this is the one phase where a golden change is expected. |

## Implementation Details

### The gate key on LEGS

**Pattern to follow**: `src/legs.js:32-41` — the existing `progress: true` key on `execute` is the precedent for an optional per-leg boolean.

**Overview**: One optional boolean per route entry, defaulting absent.

```js
export const LEGS = Object.freeze([
  { id: 'ideate',   owner: 'booking',  gate: true },  // documentation-only: next never reaches this leg
  { id: 'bay',      owner: 'wrapper'  },
  { id: 'refine',   owner: 'booking',  gate: true },
  { id: 'contract', owner: 'booking',  gate: true },
  { id: 'specs',    owner: 'booking'  },
  { id: 'execute',  owner: 'booking',  progress: true },
  { id: 'review',   owner: 'booking',  gate: true },
  { id: 'cleanup',  owner: 'wrapper'  },
]);
```

**Key decisions**:

- `gate` absent rather than `gate: false` on non-gate legs, matching how `progress` is already expressed. A route entry lists what is true of it.
- No `isGate()` helper. One property read at two call sites does not earn a function, and `src/legs.js` already exports `LEGS` directly.
- The key goes on the route, not the booking. Phase 5 adds the booking override; until then the route is the only source and the resolution rule does not exist yet.

**Implementation steps**:

1. Write the failing `route declares its gates` case in `tests/legs.test.js`.
2. Add the four `gate: true` keys.
3. Extend the `LEGS` doc comment with the definition and the `ideate` caveat.
4. Thread `gate` through `resolveLeg` in `src/inference.js`.

**Feedback loop**:

- **Playground**: The `LEGS` describe block already in `tests/legs.test.js`.
- **Experiment**: Assert the gate set is exactly `['ideate','refine','contract','review']` by filtering `LEGS`, and assert the complement — `bay`, `specs`, `execute`, `cleanup` — has no `gate` key at all, so a stray `gate: false` fails too.
- **Check command**: `node --test tests/legs.test.js`

### Route documentation

**Overview**: Three prose surfaces gain the word `gate`.

**Key decisions**:

- Render gates in the `ROUTE` block with a distinct glyph rather than a column of booleans; the block is already a compact strip and `src/help.js:21` sets the precedent with stamp labels.
- The glossary entry defines a gate in terms of the operator, not the implementation: a leg waybill will not cross without them.

**Implementation steps**:

1. Add the glossary entry.
2. Add the reference-doc route-table marker and definition.
3. Update `src/help.js`'s `ROUTE`.
4. Re-bless affected goldens and read every diff.

**Feedback loop**:

- **Playground**: `node src/cli.js help` run directly, plus `tests/help.test.js` and `tests/guide.test.js`.
- **Experiment**: Run `node src/cli.js help` and confirm by eye that exactly four legs are marked; then confirm the guide and help suites pass without re-blessing anything other than the route strip.
- **Check command**: `node --test tests/help.test.js tests/guide.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/legs.test.js` | The gate set and its complement |
| `tests/help.test.js` | The rendered route strip marks gates |
| `tests/guide.test.js` | `03-reference.md` and `02-glossary.md` define the term |

**Key test cases**:

- `route declares its gates` — the filtered gate set equals `['ideate','refine','contract','review']` in route order.
- The four non-gate legs have no `gate` key (guards against `gate: false` creeping in).
- `resolveLeg` surfaces `gate` on the resolved leg for a docket sitting on `refine`.
- The glossary lists `gate` among its terms.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `LEGS` | Gate set drifts from the contract | A later phase edits the array for another reason | Autopilot stops in the wrong places, silently | The test asserts the exact set and its complement, not merely that gates exist |
| `resolveLeg` | `gate` dropped when the leg object is rebuilt | Any refactor of `src/inference.js` | Phases 3-4 read `undefined` and cross a gate | Assert `gate` on the resolved leg, not only on `LEGS` |
| `ideate`'s flag | A future reader assumes it is live | The comment is removed | Someone builds gate behaviour on an unreachable leg | The caveat lives in the code comment, not only in this spec |
| Goldens | A re-bless hides an unintended render change | `UPDATE_GOLDEN=1` run without reading diffs | Route rendering changes unnoticed | Read every golden diff in this phase's commit; it is the only phase where one is expected |

## Validation Commands

```bash
# Inner loop
node --test tests/legs.test.js

# Documentation surfaces
node --test tests/help.test.js tests/guide.test.js

# Full suite
node --test tests/

# Contract criterion 1
node --test --test-name-pattern 'route declares its gates' tests/legs.test.js 2>&1 | grep -qE '^# pass [1-9]'
```

## Open Items

- [ ] Choose the gate glyph for the `ROUTE` strip. `◆` is used in this project's contract previews and does not collide with the existing `✓ ▶ ⚠` stamp markers.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
