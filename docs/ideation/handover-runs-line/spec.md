# Implementation Spec: Handover Runs Line

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

`handoverCommands` (`src/waybill.js:155-180`) already computes the leg's own command and argument as
`command`, and already decides whether to replace the last handover line with the
`/waybill:next <branch>/<leg>` wrapper. That decision is the predicate `transfer && bay` at
`src/waybill.js:176`. The change is to surface the decision rather than re-derive it: return a
`wrapped` boolean alongside `command`, and have `nextMarkdown` (`src/waybill.js:319-340`) emit one
extra paragraph when it is set.

The paragraph is ``→ runs `<command>` `` — prose, not a fence. That distinction is the whole point.
`nextMarkdown`'s header tells the operator to "paste each block on its own, in order", so anything
rendered as a fence is a step; the annotation is a description of the step above it. It also must
not begin with `RUN:`, `ENTER BAY:` or `NEXT LEG:`, because `commands/next.md:87` instructs a
session to invoke any line carrying the `RUN:` key, and a handover that printed one would start the
leg without being asked.

Nothing else moves. `renderWaybill` calls `handoverCommands` with no bay (`src/waybill.js:202`), so
its `wrapped` is always false and the plain-text rendering is untouched — it already prints the raw
command beside a `cd` line. `keyedLines` (`src/waybill.js:354-359`) keeps using `command` as it does
today, which means a routed render prints the command twice: once as its own `RUN:` line for the
session reading it now, once as the annotation inside the handover meant for the next session. That
duplication is accepted (see the decision log below) rather than suppressed, because suppressing it
would make the handover's content depend on how it was requested.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Annotate the wrapper with what it runs, as prose under the last fence** — rejected: a fifth
  fence carrying the raw command. The block header says "paste each block on its own, in order", so
  a fence is a step, and the leg would be pasted twice.
- **Word it as what the wrapper runs (`→ runs …`)** — rejected: wording it as an alternative
  ("already in the bay? paste X instead"). The operator chose visibility over skipping the wrapper,
  and the "instead" wording carries the same double-run risk as a fence.
- **Put the annotation directly under the last fence, above the booking body** — rejected: folding
  it into the `**NEXT**` header as a parenthetical. The header sits four fences above the command it
  would describe.
- **Keep `RUN:` as the only keyed way to name a command; scope the guard to the NEXT section** —
  rejected: reusing the `RUN:` prefix, and asserting globally that no handover line carries a keyed
  prefix. The global assertion is false by construction: `keyedLines` emits those prefixes above the
  position fence, pinned in three goldens.
- **Accept that a routed render prints the command twice** — rejected: suppressing the annotation
  when keyed lines are present. The two lines address different sessions.
- **Branch on a `wrapped` flag returned by `handoverCommands`** — rejected: re-deriving
  `transfer && bay` inside `nextMarkdown`. One predicate in one place.
- **Leave the terminal rendering untouched** — rejected: adding the annotation to `renderWaybill`
  for symmetry. Plain text already shows the raw command, and the two renderers deliberately share
  no formatting (`src/waybill.js:366-369`).
- **Anchor the criteria on greps over generated golden text** — rejected: pointing every criterion
  at `node --test tests/waybill.test.js`. That suite passes on the untouched checkout, so the
  criteria would be green before any work started.
- **Execute through `/ideation:execute-spec`, amending `openspec/specs/handover/spec.md` in place**
  — rejected: the docket's booked specs and execute legs (`/spec:propose`, `/spec:apply`), which
  would have produced a change delta. `/spec:propose` delegates to the `opsx:propose` skill, which
  is not installed here. The trade: no entry under `openspec/changes/`, so the docket's specs leg
  never stamps.

## Feedback Strategy

**Inner-loop command**: `node --test tests/waybill.test.js`

**Playground**: the existing test suite. `tests/waybill.test.js` already renders every leg's waybill
through fixtures (`tests/fixtures/*.js`) and compares against `tests/golden/*.md`, so a change to the
renderer shows up as a diff in seconds with no scaffolding to build.

**Why this approach**: the entire change is one pure function's output, and the suite already prints
that output for every leg shape the change has to distinguish.

## File Changes

### New Files

None.

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/waybill.js` | `handoverCommands` returns `wrapped`; its JSDoc (`:150-154`) documents it. `nextMarkdown` emits the annotation paragraph between the command fences and the booking body. |
| `tests/waybill.test.js` | Assert the annotation's shape in the wrapper case; add `includes('→ runs') === false` to the two existing negative tests (`:419-421`, `:424-426`). |
| `tests/golden/execute.md` | Regenerated — gains the annotation. |
| `tests/golden/refine.md` | Regenerated — gains the annotation. |
| `tests/golden/specs.md` | Regenerated — gains the annotation. |
| `tests/golden/trunk-one-docket.md` | Regenerated — gains the annotation. |
| `tests/golden/next-branch-only.md` | Regenerated — gains the annotation; the file no longer ends at the wrapper fence. |
| `tests/golden/next-run.md` | Regenerated — gains the annotation below the keyed `RUN:` line. |
| `tests/golden/next-stale-leg.md` | Regenerated — gains the annotation below the keyed `RUN:` line. |
| `tests/golden/bay-cut.md` | Regenerated through `tests/cli.test.js`, not `tests/waybill.test.js`. |
| `openspec/specs/handover/spec.md` | Amend the Markdown document shape (`:117-134`, especially the `:128` booking-body bullet) and the transfer-handover scenario (`:140-143`). Edited in place — see the decision log. |
| `README.md` | The `--markdown` paragraph (`:174-181`) describes the annotation. |

### Deleted Files

None.

## Implementation Details

### The `wrapped` flag

**Pattern to follow**: `src/waybill.js:155-180` — the function being changed.

**Overview**: `handoverCommands` already knows whether the wrapper replaced the leg's command; today
it throws that fact away and returns only the substituted `commands` array.

```js
// src/waybill.js — handoverCommands' return, today
return {
  prose: known ? null : (booking.handover ?? null),
  commands: [ /* … */ transfer && bay ? `/waybill:next ${state.branch}/${state.leg}` : command ],
  command,
};

// after: the same predicate, named once and returned
const wrapped = Boolean(transfer && bay);
return {
  prose: known ? null : (booking.handover ?? null),
  commands: [ /* … */ wrapped ? `/waybill:next ${state.branch}/${state.leg}` : command ],
  command,
  wrapped,
};
```

**Key decisions**:

- `wrapped` is derived from the existing `transfer` local and the `bay` parameter, so there is no
  second predicate to keep in step.
- The JSDoc at `:150-154` documents `wrapped` alongside `command`; that block is the contract three
  call sites read (`renderWaybill`, `keyedLines`, `nextMarkdown`).

**Implementation steps**:

1. Name the predicate as `wrapped` and use it in the `commands` array in place of the inline
   `transfer && bay`.
2. Add `wrapped` to the returned object and to the JSDoc `@returns`.

**Feedback loop**: omitted — this component has no behaviour of its own; the renderer's tests cover
it.

### The annotation paragraph

**Pattern to follow**: `src/waybill.js:319-340` — `nextMarkdown` builds an array of paragraphs that
the caller joins with a blank line, so a new paragraph is a new array entry.

**Overview**: when `wrapped` is set, one prose paragraph goes between the last command fence and the
booking body.

```js
const { prose, commands, command, wrapped } = handoverCommands(booking, state, bay);
const body = booking.body.trim();
return [
  '**NEXT** — paste each block on its own, in order:',
  ...(prose === null ? [] : [prose]),
  ...commands.map((command) => fence([command])),
  ...(wrapped ? [`→ runs \`${command}\``] : []),
  ...(body === '' ? [] : [body]),
];
```

**Key decisions**:

- The annotation goes after every command fence, for the reason the comment at `:330-331` already
  gives about the body: whatever follows the fences cannot break the pairing of the fences the
  operator copies.
- The command is wrapped in inline backticks so it is copyable, and prefixed with `→ ` so the line
  can never be read as a keyed line or as a fence.
- The inner `commands.map` shadows `command`; rename the map parameter (to `line`) so the
  annotation reads the outer binding. **This is the one place the change can silently go wrong** —
  the shadowed name is in scope for the map callback only, but a reader editing nearby code will
  not expect two bindings with one name.

**Implementation steps**:

1. Destructure `command` and `wrapped` from `handoverCommands`.
2. Rename the `commands.map` parameter away from `command`.
3. Insert the annotation entry before the body entry.
4. Bless the goldens (both commands, below) and read the diff — every changed file should gain
   exactly one line.

**Feedback loop**:

- **Playground**: `tests/waybill.test.js`, which already renders each fixture leg.
- **Experiment**: render the three shapes the change distinguishes — a transfer leg with a bay
  (annotation), a transfer leg with no bay (no annotation), a through leg (no annotation).
- **Check command**: `node --test tests/waybill.test.js`

### The handover spec amendment

**Overview**: `openspec/specs/` is normally archive output in this repo, written by archiving a
change. The `opsx:propose` skill that produces those changes is not installed on this machine, so
this spec is amended in place — leaving it unamended would leave the repo's own record contradicting
the tool.

**Key decisions**:

- Two requirements change: the Markdown document shape at `openspec/specs/handover/spec.md:117-134`,
  whose `:128` bullet says the booking body is unindented prose after the last command fence; and
  the transfer-handover scenario at `:140-143`, which has the handover ending at the wrapper fence.
- Match the surrounding requirement and scenario style exactly — the file is otherwise
  generator-shaped, and a hand edit that reads differently is how the next archive run produces a
  confusing diff.

**Implementation steps**:

1. Restate the document shape with the annotation named as an optional paragraph between the last
   command fence and the booking body, present exactly when the last command is the wrapper.
2. Restate the transfer scenario so the wrapper is the last *command* rather than the last line.

**Feedback loop**: omitted — prose.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/waybill.test.js` | The annotation's presence, position and shape in the wrapper case; its absence in the two non-wrapper cases; the eight regenerated goldens. |
| `tests/cli.test.js` | `bay --markdown` and `next --markdown` end-to-end, including `tests/golden/bay-cut.md`. |

**Key test cases**:

- A transfer leg with a bay renders `→ runs \`/spec:apply add-thing\`` as its own line, after the
  last fence and before the booking body.
- A transfer leg with no bay (`tests/waybill.test.js:419-421`) contains no `→ runs`.
- A through leg (`tests/waybill.test.js:424-426`) contains no `→ runs`.
- The markdown output still ends with exactly one newline (`:458`), with and without a booking body.
- A wrapper handover whose booking body is empty still renders the annotation, and nothing follows
  it.

### Integration Tests

Covered by `tests/cli.test.js` above; the repo has no separate integration suite.

### Manual Testing

- [ ] `node src/cli.js next --markdown` from a bay, and read the rendered block as an operator
      would: the annotation sits under the wrapper and is obviously not a step.

## Error Handling

No new failure surface: the annotation is derived from values the function already returns, and
`command` is always a non-empty string (`src/waybill.js:163`).

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Annotation paragraph | Shadowed `command` binding resolves to the map parameter | The `commands.map((command) => …)` parameter is left named `command` | The annotation names the wrapper instead of the leg — the exact bug the change exists to prevent, shipped silently | Rename the map parameter; the golden diff shows `→ runs \`/waybill:next …\`` if it is missed |
| Annotation paragraph | Emitted for a leg that has no wrapper | `wrapped` re-derived, or inverted | Operators are told to run a command the handover never named | The two negative assertions, plus six byte-exact goldens with no wrapper |
| Annotation paragraph | Read as a step and pasted | Wording or formatting suggests an instruction | The leg runs twice — once through the wrapper, once directly | Prose not a fence; `→ ` prefix; no keyed prefix |
| Goldens | `bay-cut.md` left stale | Blessed only through `tests/waybill.test.js` | `node --test tests/` fails at the end of the phase with a confusing diff | Both regeneration commands listed under Validation Commands |

## Validation Commands

```bash
# Bless the goldens (seven files)
UPDATE_GOLDEN=1 node --test tests/waybill.test.js

# Bless bay-cut.md, which is minted from the CLI test
UPDATE_GOLDEN=1 node --test tests/cli.test.js

# The suite CI runs
node --test tests/

# The contract's criteria
grep -q '^→ runs `/spec:apply' tests/golden/execute.md
! grep -q '^→ runs' tests/golden/ideate.md tests/golden/cleanup.md tests/golden/contract.md
! grep -nE '^(RUN|ENTER BAY|NEXT LEG): ' tests/golden/execute.md tests/golden/specs.md tests/golden/refine.md tests/golden/bay-cut.md
grep -q '→ runs' openspec/specs/handover/spec.md
! grep -q 'Booking body\*\*: unindented prose after the last command fence' openspec/specs/handover/spec.md
```

## Rollout Considerations

- **Feature flag**: none. The annotation is unconditional wherever the wrapper appears.
- **Rollback plan**: revert the commit; no state, no migration, no persisted output.
- **Versioning**: the next release PR ships it. This spec names no version number.

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
