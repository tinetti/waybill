# Implementation Spec: next drives the route — Phase 3

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

`next` stops reporting and starts driving. The paste-relay left for `status` in phase 2, so this phase deletes `commands/next.md`'s verbatim-and-stop rule rather than weakening it, and replaces it with a short set of actions keyed on literals the CLI emits.

The design constraint that shapes everything here is `commands/next.md:68-69`: _"The exceptions are keyed on exact strings at the start of a line, never on your reading of the situation — a verbatim rule that bends whenever a model decides it should is not a rule."_ That principle survives intact. Every decision this phase introduces — conduct or cross, in-session or dispatched, which model — is made by the CLI and expressed as a literal. The session matches literals and acts; it never inspects the route, the bookings, or its own state to decide anything.

Three literals join the existing `ENTER BAY:`, `RUN:`, `NEXT LEG:` and `SELECT A DOCKET:`:

| Literal | Meaning | Emitted when |
| --- | --- | --- |
| `GATE: <leg>` | Conduct this leg here, then stop | The current leg's `gate` is true |
| `RUN: <command> [<arg>]` | Invoke in this session | The leg is a gate, or its booking is `handover: through` |
| `DISPATCH: <model> <command> [<arg>]` | Invoke in a subagent at `<model>` | The leg is not a gate and its booking is `handover: transfer` |

`RUN:` and `DISPATCH:` are mutually exclusive. `GATE:` always accompanies `RUN:`, never `DISPATCH:` — a gate is conducted with the operator present, so it cannot be sent to a subagent whatever its handover says.

`DISPATCH:` is how a `transfer` leg crosses without a `/clear`. `transfer` means "this leg wants its own fresh context at its own model", and a subagent is exactly that: separate context, settable model. The session's own model is never consulted, because nothing in `src/` can discover it — the only environment variables read anywhere are `HOME`, `WAYBILL_BAY_DIR` and `WAYBILL_BOOKINGS_DIR`. The booking's `handover` is the trigger, and it is already data.

One existing behaviour is deliberately widened. `ENTER BAY:` and `RUN:` are emitted today only for a _named_ target (`target.named` and `token` at `src/cli.js:161-165`, `keyedLines` at `src/waybill.js:364-368`), because they existed only for the pasted-after-`/clear` path. With `next` driving, a bare invocation needs them too. `ENTER BAY:` becomes conditional on location rather than on naming: emitted when the session's cwd is not the docket's bay, which the CLI can determine, and omitted when it already is.

**Effort is not settable on a subagent.** A dispatched `execute` runs at opus, not opus/high. This is accepted and out of scope; the `DISPATCH:` line names the model so the run log records what actually happened.

## Feedback Strategy

**Inner-loop command**: `node --test tests/cli.test.js tests/waybill.test.js`

**Playground**: The fixture harness. `tests/fixtures/*.js` already builds per-leg scenarios (`bay.js`, `cleanup.js`, `execute.js`, `review.js`), so each literal can be driven from a fixture parked on the relevant leg.

**Why this approach**: The CLI half of this phase is pure string rendering against repo state, which the fixture harness tests exactly. The session half lives in `commands/next.md` prose, which `tests/commands.test.js` pins by asserting the prose quotes literals exported from `src/waybill.js` — so a renderer change that orphans the docs fails the suite.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/waybill.js` | Export `GATE:` and `DISPATCH:` alongside the existing literals at lines 38-40. Emit them from `keyedLines` (lines 364-368). Drop the `named`-only gating; make `ENTER BAY:` conditional on cwd vs bay path. Add the per-leg model line. |
| `src/cli.js` | Pass cwd-vs-bay and the resolved leg's `gate` into the renderer. Remove the `target.named`/`token` gating at lines 161-165. |
| `src/inference.js` | Surface the current leg's booking `handover` on the resolved leg so the renderer can choose `RUN:` vs `DISPATCH:`. |
| `commands/next.md` | Delete the verbatim-and-stop rule (lines 51-61). Replace the Task section with literal-keyed actions. Add the dispatch tool to `allowed-tools`. Rewrite the header comment, which currently explains why the command must not act. |
| `docs/guide/03-reference.md` | Document the three new literals beside the existing ones. |
| `tests/commands.test.js` | Update the pinned `allowed-tools` list for `next` (line 250) and the prose rules keyed on `src/waybill.js` literals (line 226). |
| `tests/waybill.test.js` | Literal-emission cases per leg and per handover. |
| `tests/cli.test.js` | End-to-end rendering for bare and named invocations. |
| `tests/golden/*` | New goldens for the driving render. The phase-2 goldens for `status` must not change. |

## Implementation Details

### Literal selection

**Pattern to follow**: `src/waybill.js:364-368` (`keyedLines`) — the existing literal emitter.

**Overview**: A pure function from leg state to at most four lines.

```js
// src/waybill.js
export const GATE = 'GATE:';
export const DISPATCH = 'DISPATCH:';

function keyedLines(state, route, cwd) {
  const lines = [];
  const bay = route.bay ?? state.bayPath;

  // Location, not naming, decides this now.
  if (bay && !samePath(cwd, bay)) lines.push(`${ENTER_BAY} ${bay}`);

  if (state.staleLeg) return [...lines, `${NEXT_LEG} ${state.leg.id}`];

  if (state.leg.gate) {
    lines.push(`${GATE} ${state.leg.id}`);
    lines.push(`${RUN} ${state.booking.command}${arg}`);   // gates never dispatch
  } else if (state.booking.handover === 'transfer') {
    lines.push(`${DISPATCH} ${state.booking.model} ${state.booking.command}${arg}`);
  } else {
    lines.push(`${RUN} ${state.booking.command}${arg}`);
  }
  return lines;
}
```

**Key decisions**:

- The gate branch comes first and is unconditional. Reading it, "a gate is never dispatched" is a property of the code's shape, not of a comment.
- `DISPATCH:` carries the model as its first token so the session needs no lookup. The session must not read bookings; everything it needs is on the line.
- No `effort` on the `DISPATCH:` line. It cannot be honoured, and a line naming a value nothing applies is worse than its absence.
- `samePath` compares resolved real paths. A bay reached through a symlink is the same bay.

**Implementation steps**:

1. Write failing `tests/waybill.test.js` cases for each of the three shapes.
2. Export the two new literals.
3. Rewrite `keyedLines` as above.
4. Remove the `named` gating in `src/cli.js:161-165`; thread `cwd` through.
5. Thread `handover` onto the resolved leg in `src/inference.js`.

**Feedback loop**:

- **Playground**: `tests/waybill.test.js` with the per-leg fixtures.
- **Experiment**: Render all eight legs in turn and assert the emitted literal per leg — `bay` and `cleanup` give `RUN:`, `specs` and `execute` give `DISPATCH: opus`, `refine`/`contract`/`review` give `GATE:` plus `RUN:`, and no leg ever gives both `RUN:` and `DISPATCH:`. Then render `refine` again with a fixture whose booking is forced to `handover: transfer` and assert it still gives `RUN:`.
- **Check command**: `node --test tests/waybill.test.js`

### `ENTER BAY:` by location

**Overview**: The line appears when the session is somewhere other than the docket's bay.

**Key decisions**:

- Location is a fact the CLI holds (`cwd`, and the bay path from `fleet`/`bay.js`), so this stays deterministic.
- Emitted for the trunk-with-one-docket path (`src/cli.js:281`) as well as the named path. That case previously produced no `ENTER BAY:` at all, which is why a bare `next` had nowhere to go.
- Omitted when already in the bay, so a second `next` in the same session does not re-enter.

**Implementation steps**:

1. Add the fixture case: bare `next` from the trunk with one docket emits `ENTER BAY:`.
2. Add the fixture case: bare `next` from inside the bay does not.
3. Make the emission conditional; delete the `named` check.

**Feedback loop**:

- **Playground**: `tests/cli.test.js` with `addWorktree()`.
- **Experiment**: Run bare `next` from three locations against one fixture — trunk, inside the bay, and inside a _different_ docket's bay — and assert the line appears in the first and third and not the second.
- **Check command**: `node --test tests/cli.test.js`

### `commands/next.md` rewrite

**Overview**: The command file's Task section becomes a literal-dispatch table.

**Key decisions**:

- The `allowed-tools` line gains the subagent-dispatch tool. `tests/commands.test.js:250` pins this list exactly, and an omitted tool is silently unavailable rather than an error — the header comment already explains this at lines 10-15 and that explanation stays.
- `AskUserQuestion` stays for `SELECT A DOCKET:`; `EnterWorktree`, `Skill` and `SlashCommand` stay for `ENTER BAY:` and `RUN:`.
- The refusal to run `/clear`, `/model` or `/effort` (lines 89-91) stays, verbatim and for the same reason. `DISPATCH:` is how a leg gets a different model now; the session never changes its own.
- `NEXT LEG:` staleness handling stays unchanged. A stale paste must still refuse to re-run a finished leg, and that matters more once `next` acts.
- Order of operations is fixed and stated: `ENTER BAY:` first and its failure aborts the rest, exactly as today at lines 84-85. A leg run from the wrong checkout does its work in the wrong tree.

**Implementation steps**:

1. Update `tests/commands.test.js`'s pinned tool list and prose rules first.
2. Add the dispatch tool to `allowed-tools`.
3. Replace lines 51-61 with the literal table.
4. Add the `GATE:` and `DISPATCH:` sections.
5. Rewrite the header comment to explain why the command now acts.

**Feedback loop**:

- **Playground**: `tests/commands.test.js`, plus `tests/bang-lines.test.js` which executes the bang line through bash.
- **Experiment**: Assert each of the six literals named in `src/waybill.js` appears in the command prose, and that the prose contains no instruction conditioned on the session's own judgment — grep for the phrases the old file used to forbid.
- **Check command**: `node --test tests/commands.test.js`

### The model line

**Overview**: Each leg reports the model it ran at.

**Key decisions**:

- For a dispatched leg the model is known exactly — it is on the `DISPATCH:` line. For an in-session leg the CLI cannot know it, so the line records the booked model and that the leg ran in-session, not a claim about the session's model.
- This is the honest half of the no-silent-degradation goal. Waybill cannot promise a `through` leg ran at its booked model; it can promise the operator is told where it ran.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/waybill.test.js` | Literal selection per leg and handover |
| `tests/cli.test.js` | `ENTER BAY:` by location; bare and named invocations |
| `tests/commands.test.js` | `allowed-tools`, prose rules, literal coverage |
| `tests/inference.test.js` | `handover` and `gate` reach the resolved leg |

**Key test cases**:

- `non-gate leg emits the run literal` — a `through` non-gate leg emits `RUN:` and no paste fence.
- `transfer dispatches and gates never do` — `specs`/`execute` emit `DISPATCH: opus`; `refine` forced to `transfer` still emits `RUN:`.
- No render ever contains both `RUN:` and `DISPATCH:`.
- Bare `next` from the trunk with one docket emits `ENTER BAY:`; from inside that bay it does not.
- A stale named leg still emits `NEXT LEG:` and no `RUN:`.
- `SELECT A DOCKET:` on a crowded trunk is unchanged and still exits 2.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Literal selection | A gate leg emits `DISPATCH:` | The gate branch is moved below the handover branch | An interactive leg runs in a subagent with no operator; the gate is silently skipped | Gate branch first and unconditional; a dedicated test forces a gate booking to `transfer` |
| `ENTER BAY:` | Omitted when the session is elsewhere | `samePath` compares unresolved paths and a symlinked bay looks different — or the same | A leg runs in the main checkout, writing to the tree waybill exists to protect | Compare resolved real paths; test from three locations including another docket's bay |
| `commands/next.md` | Prose drifts from the emitted literals | `src/waybill.js` renamed a literal | The session matches nothing and silently does nothing | `tests/commands.test.js:226` keys the prose rules on the exported literals |
| `allowed-tools` | Dispatch tool omitted | The line is edited without updating the pin | `DISPATCH:` lines are unactionable, with nothing raised to explain the silence | The pinned list in `tests/commands.test.js:250`; the header comment records why omission is silent |
| `DISPATCH:` | Subagent cannot resolve the carrier | The user-level `/spec:*` links are absent on this machine | A crossed leg does nothing and the stamp stays unflipped | Phase 4's single ask catches this; the session says which command failed to resolve and stops |
| Order of operations | `RUN:` acted on after a failed `ENTER BAY:` | The abort rule is softened | Work lands in the wrong tree | The rule is stated as today at lines 84-85 and pinned by the prose test |

## Validation Commands

```bash
# Inner loop
node --test tests/cli.test.js tests/waybill.test.js

# Command-file surfaces
node --test tests/commands.test.js tests/bang-lines.test.js

# Contract criterion 4
node --test --test-name-pattern 'non-gate leg emits the run literal' tests/cli.test.js 2>&1 | grep -qE '^# pass [1-9]'

# Phase 2's guarantee still holds
git diff --exit-code --diff-filter=M -- tests/golden/status-markdown.md

# Full suite
node --test tests/
```

## Open Items

- [ ] Confirm the exact name of the subagent-dispatch tool as Claude Code exposes it to a command file's `allowed-tools`, and whether a model override is settable there. If the model cannot be set, `DISPATCH:` degrades to `RUN:` with the model line recording the discrepancy — decide before implementing, as it changes what phase 4 can cross.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
