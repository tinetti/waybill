# Implementation Spec: Leg Renames and a Six-Leg Route - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

`/waybill:new` is the one Waybill command whose waybill is for *this* session rather than the next: it runs the brainstorm in-session instead of handing it off, and `commands/new.md`'s frontmatter declares `model:` and `effort:` for exactly that reason. With the brainstorm leg removed from `LEGS`, `new` stops being "leg 1's waybill" and becomes an off-route on-ramp — the thing you run before a docket exists, which ends by telling you how to start one.

The change is smaller than it sounds, and the contract records a factual correction that shrinks it further: **`new` never printed a leg position.** `position()` (`src/waybill.js:65-69`) short-circuits to `no docket open` whenever `state.docketOpen` is false, and `firstLeg` (`src/cli.js:419-438`) hardcodes `docketOpen: false`. `tests/golden/ideate.md:2` is `main · no docket open`. So `src/waybill.js` is not touched in this phase, and no pre-route rendering mode, flag, or parameter is introduced.

What actually changes: `firstLeg` resolves the brainstorm booking by name instead of through `LEGS[0]`; the leg-1 warning is reworded; a `/waybill:bay` handoff block is appended; and `new`'s output gets a golden of its own, because the `ideate.txt` / `ideate.md` goldens now belong to the renamed `ideate` leg. At the Full tier the handoff proposes a concrete branch name rather than printing a placeholder.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **`/waybill:new` keeps `src/waybill.js` untouched** — rejected: a pre-route rendering mode. The pre-revision scope rested on a factual error; `position()` already returns `no docket open` here.
- **`/waybill:new` proposes a concrete branch name (Full tier)** — rejected: a `/waybill:bay <branch>` placeholder. The brainstorm conclusion is what makes the name inferable. This deliberately inverts `commands/bay.md:91` — "do not invent a branch, and do not pick one for me from whatever we were last working on" — for this one path.
- **Keep the brainstorm as a booking, prove rebookability with a test** — rejected: hardcode `/ideation:brainstorm` into `new.md`. Hardcoding would strand `new.md`'s `model`/`effort` as literals nothing pins.
- **Carry the off-route booking as one exported id constant** — rejected: an `offRoute` frontmatter key, a `Booking` field, or a parallel loader.
- **Collapse the brainstorm leg into `/waybill:new`** — rejected: keep it as leg 1 with `stampCmd: false`. Consequence accepted: a docket now begins at a branch, and there is no waybill state at all during a brainstorm.
- **Name each leg for the work its booking does** — rejected: name each leg for its stamp.
- **Merge `refine` into `contract`, call it `ideate`** — rejected: keep two legs.
- **The merged `ideate` inherits `handover: transfer`** — rejected: inherit `through`.
- **Accept that three leg ids match their carrier only by namespace** — rejected: renaming the vendored spec commands.
- **Ship rename, removal and `new` rework as one change** — rejected: two PRs.
- **Machine-local overlay breakage is a release note, backed by a new doctor test** — rejected: a migration or doctor change.
- **The ride-along's headings and fences move into the goldens phase** — rejected: keeping all guide edits together.
- **Every `cmd` check pairs a positive assertion with its negative half** — rejected: bare negated greps.

## Feedback Strategy

**Inner-loop command**: `node --test tests/cli.test.js tests/commands.test.js`

**Playground**: the test suite, plus `node src/cli.js new --markdown` run directly in a scratch repo to read the rendered block before pinning it as a golden.

**Why this approach**: the deliverable is an exact block of text. Running the CLI prints it in a second and the golden freezes it — there is no faster loop, and nothing here is visual.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `tests/golden/new.txt` | The `new` command's rendered block. Needed because `ideate.txt` now belongs to the renamed `ideate` leg. |
| `tests/golden/new.md` | The markdown variant, matching the existing `.txt`/`.md` golden pairing. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/cli.js` | `firstLeg` (`:419-438`): replace `LEGS[0].id` (`:424`) and `bookings.get(LEGS[0].id)` (`:428`) with a by-name brainstorm lookup; reword the warning at `:435`; drop or neutralise `index: 1`. Update the doc comment at `:409` and the prose at `:67`. Append the `/waybill:bay` handoff to the rendered output. |
| `commands/new.md` | Update the Task text: `new` is no longer "leg 1's waybill". Keep the `model:`/`effort:` frontmatter and the comment explaining why this command alone declares them. Document the handoff, and — per the contract's decision — state explicitly that proposing a branch name here inverts `commands/bay.md:91` on purpose. |
| `tests/cli.test.js` | `new`'s assertions re-pointed at `new.txt` / `new.md`; the `no-docket.txt` case at `:486` reviewed for overlap. |
| `tests/commands.test.js` | Assertions on `new.md`'s Task text and the handoff block. The `:213` model/effort pin was already re-pointed in phase 1. |

### Deleted Files

None.

## Implementation Details

### Resolving the brainstorm booking by name

**Pattern to follow**: `src/cli.js:419-438` — `firstLeg`'s existing shape, which already builds a synthetic state object rather than inferring one.

**Overview**: `firstLeg` currently reaches for `LEGS[0]` on the assumption that leg 1 is the brainstorm. It no longer is, so the lookup becomes explicit.

```js
import { OFF_ROUTE_BOOKINGS } from './legs.js';

const BRAINSTORM = OFF_ROUTE_BOOKINGS[0]; // 'brainstorm'

function firstLeg(cwd, root, bookings) {
  const state = resolveLeg(cwd, bookings);
  if (!state.docketOpen) return state;

  return {
    leg: BRAINSTORM,
    completed: [],
    skipped: [],
    booking: bookings.get(BRAINSTORM),
    branch: defaultBranch(root),
    docketOpen: false,
    changeId: null,
    warnings: [...state.warnings, /* reworded */],
  };
}
```

**Key decisions**:

- Reference the id through `OFF_ROUTE_BOOKINGS` rather than a bare `'brainstorm'` literal, so the id lives in one place — the same reason `BOOKABLE_IDS` exists.
- `index: 1` is meaningless once the brainstorm is off-route. `position()` short-circuits on `docketOpen: false` before reading it, so removing it is safe; leave it out rather than setting it to `0`.
- Do not touch `src/waybill.js`. If a change there seems necessary, the phase has drifted — re-read the contract decision.

**Implementation steps**:

1. Write the failing test first: assert `new`'s output contains a `/waybill:bay` line.
2. Import `OFF_ROUTE_BOOKINGS`; replace both `LEGS[0]` references.
3. Remove `index: 1`.
4. Reword the warning at `:435` — it currently reads "this is still leg 1's waybill, and the ideate leg writes nothing to disk wherever it is run", which names a leg that no longer exists. It should say the brainstorm writes nothing to disk wherever it is run, without claiming a leg position.
5. Update the doc comments at `:67` and `:409`.

**Feedback loop**:

- **Playground**: a scratch git repo; run `node src/cli.js new --markdown` in it.
- **Experiment**: on the trunk with no docket, on the trunk with a docket already open (the warning path), and outside a repository (the exit-2 path).
- **Check command**: `node --test tests/cli.test.js`

### The `/waybill:bay` handoff

**Pattern to follow**: the `NEXT:` block `new` already renders, and the `**NEXT** — paste each block on its own` shape `bay` uses.

**Overview**: `new` ends by telling you how to start the docket its brainstorm just justified.

**Key decisions**:

- **MVP** prints `/waybill:bay <branch>` as a placeholder. **Full tier** proposes a concrete name derived from the brainstorm conclusion. The tier chosen at approval is Full, so implement the proposal — but keep the placeholder as the fallback when no conclusion is available to derive from (for example, `new` run on a trunk with nothing discussed).
- The proposed name is a *suggestion*, and the rendered text must say so. `commands/bay.md:91` tells the model never to invent a branch; this path deliberately does. The inversion must be written down in `commands/new.md` where a later reader will find it, or someone will revert it as a bug.
- `new` does **not** run `bay`. It prints the command, exactly as every other Waybill handoff does.

**Implementation steps**:

1. Append the handoff block to the rendered output, after the existing `NEXT:` block.
2. Derive the branch name from the brainstorm conclusion; fall back to `<branch>` when there is nothing to derive from.
3. Add the note to `commands/new.md` recording the inverted rule and why.
4. Capture `tests/golden/new.txt` and `new.md` from the real output.

**Feedback loop**:

- **Playground**: the same scratch repo.
- **Experiment**: with a conclusion available and without one, confirming the fallback renders `<branch>` rather than a guess.
- **Check command**: `node --test tests/cli.test.js tests/commands.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/cli.test.js` | `new`'s rendered output against the new goldens; the docket-already-open warning path; the outside-a-repository path. |
| `tests/commands.test.js` | `commands/new.md`'s Task text and frontmatter; the recorded rule inversion. |

**Key test cases**:

- `new` on a clean trunk renders `main · no docket open` and a `/waybill:bay` line.
- `new` renders no `leg N of M` anywhere — the position line is absent, not merely different.
- The brainstorm booking's `command`, `model` and `effort` appear in the rendered block, sourced from `bookings/ideation-brainstorm.md`.
- Edge case: no conclusion to derive from → the handoff renders the `<branch>` placeholder, not an invented name.
- Edge case: `new` on a branch that already carries a docket → the reworded warning, with no reference to a leg number.
- Error case: `new` outside a git repository still exits 2 with its message reaching the session.

### Manual Testing

- [ ] Run `/waybill:new` in a scratch repo and confirm the handoff is pasteable as-is.
- [ ] Confirm the proposed branch name reads as the effort, not as a generic slug — the contract's one judgment criterion.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `firstLeg` | Booking not found | `bookings.get('brainstorm')` returns undefined because `BOOKABLE_IDS` was not widened in phase 1 | `new` renders an empty command block with no error | Phase 1 prereq; assert the booking's command appears in the golden |
| Handoff | Invented name presented as certain | The derivation runs with no conclusion in context | The user pastes a branch name that names nothing, and it becomes the docket's permanent identity | Fall back to `<branch>`; render the name as a suggestion |
| Handoff | Rule inversion silently reverted | A later reader sees `new` proposing a branch, compares it to `commands/bay.md:91`, and "fixes" it | The Full-tier behavior is lost with no record of why it existed | Record the inversion in `commands/new.md` and in the contract's decision log |
| Goldens | Stale pairing | `new`'s assertions left pointing at `ideate.txt` | `new`'s output is silently checked against the `ideate` leg's waybill | New `new.txt` / `new.md` goldens; success criterion greps `new.txt` for `/waybill:bay ` |
| Warning text | Orphan leg reference | `:435` left unchanged | The warning names "the ideate leg" meaning the brainstorm, which is now a different leg entirely | Step 4; covered by the golden |

## Validation Commands

```bash
# Inner loop
node --test tests/cli.test.js tests/commands.test.js

# Phase gate
node --test tests/
```

Note: `tests/guide.test.js` and the golden comparisons for the *legs* remain red until phase 4. This phase's own `new.txt` / `new.md` goldens should be green on completion.

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
