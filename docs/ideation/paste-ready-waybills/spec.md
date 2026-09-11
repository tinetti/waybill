# Implementation Spec: Paste-Ready Waybills

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

The NEXT block stops describing the handover and becomes the handover: a list of commands the
operator pastes, one at a time, in order — `/clear` (transfer legs only), `/model <model>`,
`/effort <effort>` (only when the booking declares one), then the leg command. Claude Code submits a
multi-line paste as a single input (the user's live test: `/model haiku` + newline + `/effort low`
→ `Model 'haiku     /effort low' not found`), so **every command must be its own paste**. That fact
drives everything below.

There are two renderings of the same command list. **Plain** (`waybill next`, `new`, `bay` in a
terminal) prints the commands one per line, unindented, under `NEXT:`; the `└ model · effort`
caption and the `/clear, then run:` / `run:` lines disappear. **Markdown** (`waybill next --markdown`
and `waybill bay --markdown`) wraps each command in its own ``` fence so the Claude desktop/web app
gives each one a copy button; `/waybill:next` and `/waybill:bay` call the CLI with `--markdown` and
keep their existing "echo verbatim" rule, so the fences come from code a golden file pins, not from
the model.

Keep one source of truth for *which* commands a handover needs: extract a pure helper in
`src/waybill.js` that both renderers call, so plain and markdown can never disagree about the list.
Keep `renderWaybill` pure (no fs, no clock) as it is today. `--json` is untouched: the change is
render-only and never reaches the inferred state.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **One fenced block per slash command** — rejected: one block holding `/model`, `/effort` and the leg command together. The user's paste test showed Claude Code submits a multi-line paste as one input.
- **Fences only in the slash surface; plain CLI prints bare, unindented command lines** — rejected: ``` fences in plain CLI output. A plain terminal would show literal backticks.
- **A `--markdown` flag on `next` and `bay` produces the fenced form; the slash command echoes it verbatim** — rejected: the model wrapping `/` lines per instructions in commands/next.md. Model-side transformation cannot be pinned by a golden and drifts between runs.
- **Commands with an argument Waybill cannot supply are fenced bare** — rejected: a placeholder like `/waybill:bay feat/<name>`. Paste-and-Enter would submit the literal placeholder.
- **/waybill:next and /waybill:bay switch to markdown; /waybill:new stays plain** — rejected: markdown on all three. /waybill:new runs its command in-session; its fences would never be clicked.
- **The booking's `model` value is passed to `/model` verbatim** — rejected: a context-window booking field. `opus[1m]` is Claude Code's documented 1M alias and a booking can already hold it.
- **The position block (header + leg strip) goes inside a ```text fence in markdown mode** — rejected: bare markdown lines. Markdown collapses the strip's single newlines into one paragraph.
- **commands/new.md is updated to run only the leg command** — rejected: leaving /waybill:new untouched. Its skip instruction names the `/clear, then run:` line this change deletes; left alone, the session could run `/clear` or `/model`.
- **`bay --markdown` renders its own heading and fenced cd in src/cli.js** — rejected: relying on the renderer's IN BAY section. `bay` never passes `cd` to `renderWaybill`; it prints `bay created at …` itself.
- **An unrecognised `handover` string stays as a prose line above the commands; `through` renders nothing, `transfer` renders the `/clear` command** — rejected: dropping the handover line for every value. Custom handovers are printed verbatim on purpose (tests/waybill.test.js "hand the laptop to Dave", README).
- **The plain `IN BAY:` / bay `cd` line keeps its current indented form** — rejected: unindenting cd in plain mode. cd is a shell command, markdown mode covers copying it, and cli.test.js pins the indent.
- **Success criteria check fence shape, unindented plain lines, unchanged non-waybill goldens and the flag conflict directly** — rejected: relying only on goldens the same PR generates. `UPDATE_GOLDEN=1` records whatever the code prints.

## Feedback Strategy

**Inner-loop command**: `node --test tests/waybill.test.js`

**Playground**: the golden-file test suite, plus the CLI run by hand against the repo itself
(`node src/cli.js next`, `node src/cli.js next --markdown`).

**Why this approach**: nearly every change is renderer output that golden files pin byte-for-byte,
so a sub-second test run tells you exactly which bytes moved.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `tests/golden/{ideate,no-docket,bay,refine,contract,specs,execute,cleanup}.md` | Markdown golden per booked-leg fixture already rendered as `.txt` (same fixture ids as the `.txt` loop at `tests/waybill.test.js:130` plus `no-docket`) |
| `tests/golden/trunk-one-docket.md` | Markdown golden with an `IN BAY` cd fence |
| `tests/golden/findings.md` | Markdown golden with IGNORED BY GIT and WARNINGS rendered as bullets |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/waybill.js` | Extract `handoverCommands(state)`; rewrite `nextBlock` for the plain form; add `renderWaybillMarkdown`; add bare `cdCommand` and make `cdLines` use it |
| `src/cli.js` | `--markdown` on `next` (incl. `next <branch>` and trunk single-docket paths) and `bay`; reject `--json` + `--markdown`; `bay --markdown` renders its own heading + fenced cd; one USAGE Options row |
| `commands/next.md` | Invoke `cli.js" next --markdown`; step-2 re-run becomes `next --markdown <branch>`; reword "the handover line says whether to `/clear` first" to point at the `/clear` block |
| `commands/bay.md` | Invoke `cli.js" bay --markdown "$ARGUMENTS"`; same `/clear` wording fix |
| `commands/new.md` | Replace the "Ignore the `/clear, then run:` line" paragraph: of the NEXT block's unindented command lines, run **only the last** (the leg command); never `/clear`, `/model` or `/effort` |
| `tests/waybill.test.js` | `assertGolden(name, actual, ext = 'txt')`; markdown golden cases; update hand-written shape assertions at ~366–419 and the `cdLines` assertion at ~262 |
| `tests/cli.test.js` | Update indented-command assertions (~380, ~415) to unindented; add `--markdown` tests incl. `--json --markdown` rejection and a test **named** `bay --markdown …`; cd assertions (~553–625) stay indented for plain mode |
| `tests/booking-swap.test.js` | ~93–95: expect `^\/ideation:execute-spec` unindented and `^\/clear$` instead of `  /clear, then run:` |
| `tests/bookings-overlay.test.js` | ~223: update to the unindented command form |
| `tests/commands.test.js` | ~335: unindented command; pin that next.md/bay.md pass `--markdown` and new.md says to run only the last command line (if it pins the `!` invocation strings, update them) |
| `tests/golden/*.txt` (booked legs + trunk-one-docket) | Regenerated with `UPDATE_GOLDEN=1` and reviewed by eye |
| `README.md` | Update every sample waybill (lines ~12–20, the trunk example, others); document `--markdown`; update the `handover` field description (~209) to the new semantics |

`tests/index.js` needs no change as long as new tests go into existing suites (it imports each suite
explicitly for Node 26 — a new test file **must** be added there).

## Implementation Details

### 1. The handover command list (`src/waybill.js`)

**Pattern to follow**: `nextBlock` and `ARGUMENT_SOURCES` in `src/waybill.js` (keep the Map lookup
and the "drop a null argument" rule exactly).

```js
/**
 * @returns {{ prose: string|null, commands: string[] }}
 *   prose    — a handover value that is neither `transfer` nor `through` (rendered verbatim), else null
 *   commands — ['/clear'?] + [`/model ${model}`] + [`/effort ${effort}`?] + [leg command]
 */
function handoverCommands(booking, state) { … }
```

Rules:
- `handover: transfer` → leading `/clear`. `through` or undefined → nothing. Any other string →
  `prose` (the old "render unrecognised values verbatim" behaviour), no `/clear`.
- `/model ${booking.model}` always (model is a required booking key), value verbatim.
- `/effort ${booking.effort}` only when declared — never a default.
- Leg command: `command` + argument exactly as today (argument dropped when the source yields null).

**Plain `nextBlock`** becomes:

```
NEXT:
  <prose, if any, indented>
/clear
/model opus
/effort high
/spec:apply add-thing

  <booking body, indented as today>
```

Unchanged: the complete state (`NEXT:\n  nothing to hand off — every leg is complete` — the
`complete.txt` golden must not change) and the no-booking message (`  no booking is bound…` /
`  └ add one under bookings/…`; there is no golden for it, so leave its text alone).

**Feedback loop**:
- **Playground**: `tests/waybill.test.js` `next(...)` helper cases (~360–420).
- **Experiment**: handover `transfer` / `through` / `undefined` / `'hand the laptop to Dave'`;
  effort present / absent; `changeId: null`; `argument: 'branch'` with and without a branch;
  `argument: 'none'`.
- **Check command**: `node --test tests/waybill.test.js`

### 2. Markdown renderer (`src/waybill.js`)

**Pattern to follow**: `renderWaybill` + `withFindings`.

```js
/**
 * @param {Inference} state
 * @param {Inspection} [inspection]
 * @param {string[]} [cd] bare shell commands (from cdCommand), empty when already there
 * @returns {string} markdown, ends with exactly one newline
 */
export function renderWaybillMarkdown(state, inspection = { ignored: [], warnings: [] }, cd = []) { … }

/** `cd <target>`, bare — cdLines becomes `alreadyThere ? [] : [`${INDENT}${cdCommand(target)}`]`. */
export function cdCommand(target) { … }
```

Exact shape for the execute fixture (the success criterion greps this):

````
```text
feat/thing · leg 6 of 7 (execute)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract  ✓ specs
  ▶ execute (1 of 3 tasks)
```

**NEXT** — paste each block on its own, in order:

```
/clear
```

```
/model opus
```

```
/effort high
```

```
/spec:apply add-thing
```

Work the tasks list top to bottom, test first, ticking each box as it lands. A phase is roughly one
session's context — stop and hand the docket on when the remaining tasks no longer fit, rather than
running the session dry.
````

- Every command line sits alone between a bare opening ``` and a closing ```. Nothing else inside.
- Position block: the same header/strip lines as plain, inside ```` ```text ````. No docket open →
  header only.
- `IN BAY` (non-empty `cd`): `**IN BAY** — run this in your shell first:` then a fence holding the
  bare `cd …`, placed before NEXT (same ordering reason as `renderWaybill`).
- Custom handover prose: a plain paragraph between the NEXT line and the first fence.
- Body: unindented (the `.trim()` rule from `waybillText` still applies; no trailing whitespace).
- Complete / no-booking: `**NEXT** — nothing to hand off — every leg is complete` / the no-booking
  sentence, no fences.
- IGNORED BY GIT / WARNINGS: `**IGNORED BY GIT**` / `**WARNINGS**` followed by `- ⚠ …` bullets,
  same text and order as plain, WARNINGS last.
- Sections separated by one blank line; file ends with exactly one `\n`.

**Feedback loop**:
- **Playground**: add `renders the <id> leg in markdown` cases next to the `.txt` loop at
  `tests/waybill.test.js:130`, plus `trunk-one-docket` (with `[cdCommand(BAY)]`) and a findings case.
- **Experiment**: transfer vs through fixtures (execute vs contract), effort-less booking,
  custom handover, cd present/absent, ignored + warnings, complete state.
- **Check command**: `node --test --test-name-pattern=markdown tests/waybill.test.js`

### 3. CLI flags (`src/cli.js`)

**Pattern to follow**: `NEXT_FLAGS` handling in `next()`; `--bay-dir` parsing in `bay()`.

1. `NEXT_FLAGS` gains `--markdown`. Right after the flag loop (before `repoRoot`), if both
   `--json` and `--markdown` are present: `io.err("waybill: \`--json\` and \`--markdown\` cannot be
   combined\n" + USAGE)` and return 2. The error must contain the literal `--markdown`.
2. Thread a `markdown` boolean through `issueWaybill` and the final `renderWaybill` call in `next()`
   so every waybill `next` prints (in-bay, `next <branch>`, trunk single docket) uses
   `renderWaybillMarkdown` when set; `issueWaybill` passes `cdCommand` output instead of `cdLines`
   in markdown mode. `renderSelect` / `noWaybill` output is **unchanged** under `--markdown`.
3. `bay()` accepts `--markdown`. In markdown mode, the heading is a paragraph
   (`bay created at <path>` / `bay already exists at <path>`, or the "already inside" line), followed
   by `**IN BAY** — run this in your shell first:` and a fence holding `cdCommand(result.path)` when
   not already inside; then a blank line and `renderWaybillMarkdown(...)`. Plain `bay` output is
   unchanged apart from the NEXT block.
4. USAGE Options: one row, e.g.
   `'  --markdown        Fence each handover command for pasting (`next`, `bay`)'`.
   Do not touch the Commands block (the in-flight `ideation/waybill-help` branch edits it).
5. `begin()` (`waybill new`) takes no `--markdown`; it keeps rejecting every argument.

**Feedback loop**:
- **Playground**: `tests/cli.test.js` with the repo fixtures (`tests/helpers/repo-fixture.js`).
- **Experiment**: `next --markdown` in a bay; `next --markdown <branch>` from trunk (cd fence
  present); `next --json --markdown` (exit 2, stderr names `--markdown`); `next --markdown --jsonn`
  (still "unknown option"); `bay --markdown feat/x` fresh and already-existing; `bay --markdown`
  from inside the bay (no cd fence).
- **Check command**: `node --test --test-name-pattern='markdown' tests/cli.test.js`

The bay test's name must contain `bay --markdown` — a success criterion selects it by that name.

### 4. Slash command files

- `commands/next.md`: the `!` line invokes `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown`
  (keep the bare `${CLAUDE_PLUGIN_ROOT}` spelling and the else-branch message exactly — see the
  comment block and `tests/commands.test.js`). Step 2's fenced command becomes
  `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown <branch>`. Reword "the handover line says
  whether to `/clear` first" to say the first block is `/clear` when the next leg wants a fresh
  session. Keep the verbatim rule: the markdown is echoed as markdown, not wrapped in another fence.
- `commands/bay.md`: `… cli.js" bay --markdown "$ARGUMENTS"`; same wording fix.
- `commands/new.md`: replace the "Ignore the `/clear, then run:` line…" paragraph with: the NEXT
  block lists commands one per line; run **only the last one** (the leg command, with whatever
  argument it carries); never run `/clear`, `/model` or `/effort` — this session is already the
  fresh one and its model/effort came from the command's own frontmatter context. Keep the rest.
- None of the three may contain the text `then run:` afterwards.

### 5. README

Update every sample waybill to the new plain form, add `--markdown` to the commands/options
description, and rewrite the `handover` field description: `transfer` → a leading `/clear`
command, `through` → none, anything else → printed verbatim above the commands. Remove every
`then run:` occurrence.

## Testing Requirements

### Unit / golden tests

| Test File | Coverage |
| --- | --- |
| `tests/waybill.test.js` | plain + markdown goldens for every booked leg, trunk-one-docket (cd), findings; `handoverCommands` rules via the `next(...)` helper |
| `tests/cli.test.js` | `--markdown` on next (bay / trunk / `<branch>`), `--json --markdown` rejection, `bay --markdown` cd fence, unindented plain commands |
| `tests/commands.test.js` | next.md / bay.md pass `--markdown`; new.md runs only the last command; no `then run:` in commands |
| `tests/booking-swap.test.js`, `tests/bookings-overlay.test.js` | updated shape assertions |

**Key test cases**:
- transfer leg: `/clear` first; through leg: no `/clear`; custom handover: verbatim prose, no `/clear`.
- booking without `effort`: no `/effort` line / fence.
- `changeId: null`: command fenced bare (`/spec:propose`), no trailing space.
- markdown: each command alone between fences — never two commands in one fence.
- `select.txt`, `status.txt`, `fleet.txt`, `fleet-empty.txt`, `complete.txt` byte-identical to main.

### Manual Testing

- [ ] `node src/cli.js next` and `node src/cli.js next --markdown` in this worktree read correctly.
- [ ] (Judgment, operator) `/waybill:next` in the Claude desktop app: one copy button per command.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| handoverCommands | Command with empty argument | `changeId` null / branch null | Pasted command has a trailing space or blank arg | Keep today's "omit null argument" rule; test `changeId: null` |
| handoverCommands | Custom handover silently dropped | Booking overlay with `handover: "hand the laptop to Dave"` | Operator loses the booking's instruction | Render as prose; keep the existing test (reshaped) |
| Markdown renderer | Two commands in one fence | Joining commands before fencing | Paste fails exactly as the user's test showed | Fence per command; criterion greps execute.md |
| Markdown renderer | Leg strip collapses | Emitting strip as bare markdown | Unreadable position | ```text fence |
| Markdown renderer | Booking body contains ``` | An overlay booking body with a code fence | Breaks fence pairing after it | Body is emitted after all command fences, so command fences stay intact; accept |
| CLI | `--markdown` ignored on some `next` path | Forgetting `issueWaybill` or trunk single-docket path | /waybill:next shows plain text on those paths | Test `next --markdown <branch>` from trunk |
| CLI | Flag conflict error reported after repo lookup | Check placed after `repoRoot` | Wrong error outside a repo | Check right after the flag loop |
| commands/new.md | Session runs `/clear` or `/model` | Stale "ignore the /clear line" wording | Session wipes its own instruction / changes default model | Rewrite to "run only the last command line"; pinned in commands.test.js |
| Goldens | Regenerated goldens accepted blindly | `UPDATE_GOLDEN=1` | Wrong output recorded as truth | Review `git diff tests/golden` by eye; independent criteria greps |

## Validation Commands

```bash
# Full suite (what CI runs: package.json "test")
node --test tests/

# Inner loop
node --test tests/waybill.test.js

# Regenerate goldens after an intentional renderer change, then REVIEW the diff
UPDATE_GOLDEN=1 node --test tests/waybill.test.js && git diff --stat tests/golden

# Contract checks (all must exit 0)
node /Users/tinetti/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/paste-ready-waybills/contract-data.json
```

No linter or typechecker is configured in this repo (package.json has only `test`).

## Rollout Considerations

- **Feature flag**: none — `--markdown` is opt-in on the CLI; the slash commands opt in.
- **Release**: out of scope — the repo bumps versions in a separate `chore: release` PR.
- **Rebase note**: `ideation/waybill-help` edits `src/cli.js` USAGE, `tests/commands.test.js` and
  `README.md`; whichever lands second rebases those three.
- **Rollback plan**: revert the PR; no state or data is involved.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
