# Implementation Spec: next drives the route — Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

`status` and `next` swap identities. Today `status` reports and `next` hands off; after this project `status` reports _and_ hands off, and `next` acts. This phase does the handing-off half, and it lands before phase 3 takes the printing away from `next` — so there is never a commit in which the paste-relay is unreachable. That ordering is the main safety property of the whole plan.

The work is larger than moving a renderer. `status()` rejects every argument by design (`src/cli.js:316-321`, "Deliberately takes no options at all"), so it must learn `--markdown`. Its bang line in `commands/status.md:33` passes no flags and is pinned by `tests/commands.test.js`. And `commands/status.md:45-49` currently forbids in prose precisely what this phase makes the command do — that paragraph is rewritten, not appended to.

The rendering itself is a reuse, not a rewrite: `renderWaybillMarkdown` in `src/waybill.js:391-415` already produces the fenced, copy-button-per-command block. `status --markdown` calls it for the in-bay answer. The critical constraint is that no existing golden's _content_ changes; a golden may be renamed or added, but a modified one means the render drifted, and contract criterion 2 enforces that with `git diff --exit-code --diff-filter=M`.

The trunk answer is untouched. `status` on the trunk lists the fleet, one line per docket, and `commands/status.md:42-43` calls that "a report and not a menu". No waybill attaches to it — a fleet listing with eight waybills in it is not a report of anything.

`status` keeps its `Bash`-only `allowed-tools` line. After this phase it prints runnable commands, and it must remain structurally incapable of running them.

## Feedback Strategy

**Inner-loop command**: `node --test tests/cli.test.js tests/waybill.test.js`

**Playground**: The fixture harness in `tests/helpers/repo-fixture.js` — `createRepo()` and `addWorktree()` build a bay-docket in a temp repo, and `assertGolden()` compares rendered output.

**Why this approach**: Every change here is CLI output compared against goldens, and the fixture harness is the only way to produce that output deterministically.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/cli.js` | `status()` accepts `--markdown` (lines 316-321 currently reject all options). On the in-bay answer with `--markdown`, call `renderWaybillMarkdown`; without it, render as today. Trunk answer unchanged in both modes. |
| `commands/status.md` | Bang line gains `--markdown`. Rewrite the Task section: lines 45-49 currently forbid inferring the next leg's command; they become the instruction to show the waybill verbatim, mirroring `commands/next.md:51-61` as it reads today. Update the header comment at lines 14-22, which states "Neither carries a waybill". |
| `docs/guide/03-reference.md` | Add `--markdown` to the flags list. `tests/guide.test.js:202-204` asserts every USAGE flag appears here, so this cannot wait for phase 6. |
| `tests/commands.test.js` | Update the pinned `status` bang line and the prose-rule assertions keyed on literals from `src/waybill.js`. |
| `tests/cli.test.js` | Add `status --markdown` cases for both answers. |
| `tests/bang-lines.test.js` | The `status` bang line is executed by this suite; confirm the new flag still wraps its exit code. |

### Moved Files

| File Path | Reason |
| --- | --- |
| `tests/golden/status.txt` | Gains a markdown sibling. Keep the plain-text golden byte-identical and add `tests/golden/status-markdown.md`; do not repurpose the existing file. |

## Implementation Details

### `status --markdown`

**Pattern to follow**: `src/cli.js:220` (`next()`) — it already routes `--markdown` to `renderWaybillMarkdown` and plain to `renderWaybill`.

**Overview**: One flag, one branch, reusing the existing renderer.

```js
// src/cli.js — status()
// Today: "Deliberately takes no options at all" (lines 316-321)
// After: one option, and only one.
if (!inBay(cwd)) {
  // Trunk: fleet listing. --markdown does not add a waybill here.
  io.out(renderFleet(/* … */));
  return 0;
}
const state = resolveLeg(cwd, bookings);
const inspection = checkIgnored(root, paperPaths(bookings));
io.out(markdown
  ? renderWaybillMarkdown(state, inspection, { bay: root })
  : renderStatus(state, inspection));
```

**Key decisions**:

- Reuse `renderWaybillMarkdown` verbatim rather than extracting a shared helper. The output must be byte-identical to what `next` produces today, and the surest way to guarantee that is to call the same function.
- Pass `{ bay: root }` as the route, matching `src/cli.js:298`'s `inBay(cwd) ? { bay: root } : {}`. `status` is only ever called from where the operator stands, so the in-bay answer always has a bay.
- `--markdown` on the trunk is accepted and ignored for waybill purposes rather than rejected. Rejecting it would make the flag's validity depend on the operator's location, which is the one thing `status` deliberately does not do.

**Implementation steps**:

1. Write the failing golden test for `status --markdown` in a bay fixture, blessing it from the current `next --markdown` output so the bytes are pinned to today's render.
2. Add `--markdown` to `status()`'s option parsing.
3. Branch the in-bay answer.
4. Add the trunk case asserting no waybill appears.

**Feedback loop**:

- **Playground**: `tests/cli.test.js` with `createRepo()` + `addWorktree()`, plus direct runs of `node src/cli.js status --markdown` inside a scratch bay.
- **Experiment**: Render the same fixture through `next --markdown` and `status --markdown` and assert the two strings are equal. Then run `status --markdown` on the trunk with zero, one and two dockets and assert no fence containing `/waybill:` appears in any of them.
- **Check command**: `node --test tests/cli.test.js`

### `commands/status.md` rewrite

**Overview**: The Task section reverses. What was "do not infer the next leg's command" becomes "show the waybill verbatim".

**Key decisions**:

- Lift the verbatim-and-stop language from `commands/next.md:51-61` rather than writing new prose. That paragraph is well-tested and about to be deleted from `next`; moving it preserves both the wording and the tests' shape.
- Keep `allowed-tools` as `Bash(node:*), Bash(test:*), Bash(echo:*)`. No `Skill`, no `SlashCommand`, no `EnterWorktree`. `status` prints commands and must not be able to run them — the restriction is the guarantee.
- Keep the two-answers framing in the header comment; only the "Neither carries a waybill" clause changes, to "the in-bay answer carries a waybill; the fleet listing does not".

**Implementation steps**:

1. Update `tests/commands.test.js`'s pinned bang line and prose rules first, so they fail.
2. Rewrite the bang line.
3. Rewrite the Task section and header comment.
4. Confirm `tests/bang-lines.test.js` still executes the line cleanly and that a non-zero exit is still folded into `waybill: exited N`.

**Feedback loop**:

- **Playground**: `tests/commands.test.js` and `tests/bang-lines.test.js`, which execute the command body through bash in a temp repo.
- **Experiment**: Run the bang line outside a repository (where `status` exits 2) and confirm the marker line still reaches stdout, so the Task section still renders.
- **Check command**: `node --test tests/commands.test.js tests/bang-lines.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/cli.test.js` | `status --markdown` in a bay and on the trunk |
| `tests/waybill.test.js` | The markdown renderer is unchanged |
| `tests/commands.test.js` | The new bang line and Task prose |
| `tests/bang-lines.test.js` | The bang line executes and folds its exit code |
| `tests/fleet.test.js` | `fleet listing carries no waybill` |

**Key test cases**:

- `status --markdown` in a bay equals `next --markdown` for the same fixture, byte for byte.
- `fleet listing carries no waybill` — trunk with two dockets, `--markdown` set, no `/waybill:` fence in the output.
- Trunk with zero dockets under `--markdown` still reports no dockets open.
- `status` without `--markdown` is byte-identical to `tests/golden/status.txt` as it exists before this phase.
- An unknown flag is still rejected; `--markdown` did not open the door to arbitrary options.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `status --markdown` | Render drifts from `next`'s | A shared-helper extraction "tidies" the output | Phase 3 removes `next`'s printing and the relay is subtly different from what the operator learned | Assert equality against `next --markdown` on the same fixture, not against a hand-written golden |
| Goldens | A re-bless masks the drift | `UPDATE_GOLDEN=1` run to make tests pass | Criterion 2's guarantee is void | `git diff --exit-code --diff-filter=M -- tests/golden/` in the criterion; renames and additions allowed, modifications not |
| Trunk answer | A waybill leaks onto the fleet listing | `--markdown` handled before the in-bay branch | A report becomes a menu, contradicting `commands/status.md:42-43` | Explicit trunk test with `--markdown` set |
| `allowed-tools` | Widened to let `status` act | A later phase finds it convenient | `status` gains the power the split exists to deny it | `tests/commands.test.js` pins the exact tool list, as it already does for `next` and `bay` |
| Bang line | Non-zero exit discards the command file | `--markdown` added without re-checking the wrapper | The Task section never renders and the operator sees nothing | `tests/bang-lines.test.js:168` asserts every shelling command wraps |

## Validation Commands

```bash
# Inner loop
node --test tests/cli.test.js tests/waybill.test.js

# Command-file surfaces
node --test tests/commands.test.js tests/bang-lines.test.js

# Contract criterion 2 — the render did not drift
node --test tests/cli.test.js tests/waybill.test.js && git diff --exit-code --diff-filter=M -- tests/golden/

# Contract criterion 3
node --test --test-name-pattern 'fleet listing carries no waybill' tests/fleet.test.js 2>&1 | grep -qE '^# pass [1-9]'

# Full suite
node --test tests/
```

## Open Items

- [ ] Decide whether `status --markdown` on the trunk renders the fleet listing as markdown (fenced, copy-buttoned branch names) or as plain text. The contract only requires that it carry no waybill. Plain text is the smaller change and the safer default.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
