# Implementation Spec: Next From Anywhere

**Contract**: ./contract.md
**Estimated Effort**: M
**Precondition**: `ideation/bang-line-exit-guard` is merged to main, and this branch is rebased onto it. Both rewrite the `!` lines in `commands/next.md` and `commands/bay.md`. Line numbers below are from main at `7abf19b` and may shift after the rebase.

## Technical Approach

The CLI already resolves a docket from anywhere: `next <branch>` looks the branch up in `fleet()` (`src/cli.js:221-225`). This change leaves resolution alone and changes three things:

1. **What the session handover says.** Markdown (session) output for a transfer leg of a docket that has a bay replaces the leg's raw command fence with `/waybill:next <branch>/<leg>` and no longer prints the `**IN BAY**` `cd` fence. `/clear`, `/model` and `/effort` stay.
2. **What the CLI tells the Task when it's given an argument.** Keyed lines go at the top of the markdown output: `ENTER BAY: <abs path>`, `RUN: <command> [<arg>]` and `NEXT LEG: <leg>`. This is the same pattern as today's `SELECT A DOCKET:` exception. The CLI decides; the prompt only reacts to headings.
3. **What `commands/next.md` does with those lines.** It calls `EnterWorktree({path})`, then invokes the booking command through Skill/SlashCommand. Otherwise it shows the block and stops.

The renderer can't make decision 1 today, because `renderWaybillMarkdown(state, inspection, cd=[])` (`src/waybill.js:328`) never learns the bay path; the only bay signal is `cd.length > 0`. So its third parameter changes from `cd` strings to a `route` object. Plain output (`renderWaybill`) and `--json` stay the same.

Interview spikes (headless `claude -p`, Claude Code 2.1.268) confirmed that `EnterWorktree({path})` moves the session from the main checkout and from one `.claude/worktrees` bay to another. They also confirmed that a command invoked through Skill afterwards runs in the new bay and can Write, even when neither command's `allowed-tools` names Write.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **The token after the branch is the leg id (`feat/foo/execute`)**. Rejected: a command-derived slug (`feat/foo/spec-apply`), or no token. Leg ids are a closed set, so the split is reliable, and they stay stable when a bay overrides the booking's command. With no token there'd be no way to tell "show me" from "run it".
- **Keep `/model` and `/effort` in the handover.** Rejected: a 2-line handover that relies on frontmatter. `claude -p` ignores `model:` frontmatter even on a direct call, and `spec:apply` is `model: inherit`.
- **A stale leg token refuses**: switch into the bay, show the current waybill with a note, run nothing. Rejected: run the named leg anyway, or ask. A stale paste must never re-run finished work.
- **Every transfer handover with a bay gets the new line** (in-bay, trunk, `/waybill:bay`), in session output only; plain output keeps `cd`. Rejected: only `/waybill:next` inside a bay.
- **`/waybill:next <branch>` with no leg switches into the bay and shows the waybill.** Rejected: show only, with a `cd`.
- **If the bay can't be entered, show `cd` and stop.** Rejected: run the leg in the current checkout.
- **Fold the /waybill:help walkthrough into this effort.** Rejected: a separate follow-up. #12 landed after approval, and the card would otherwise contradict the handover.
- **Record this as an ideation contract plus spec, editing the living command-surface spec directly.** Rejected: an additional OpenSpec change folder.
- **Build after bang-line-exit-guard lands.** Rejected: build now and rebase bang-line.
- **The session switch uses `EnterWorktree({path})`; the CLI only emits the path.** Rejected: printing a `cd` for the user.
- **`ENTER BAY` requires an explicit argument, not just the caller's location.** Rejected: emit it whenever the caller is outside the resolved bay, which would move the session on a plain trunk `/waybill:next`.
- **The bang-line gate is a wait on the other docket's merge.** Rejected: this contract merging bang-line itself.
- **The stale note is a keyed marker `NEXT LEG: <leg>`.** Rejected: free prose.
- **The `cd` fallback reuses the `ENTER BAY` path, with exact text fixed by the living spec.** Rejected: rendering a second, cd-bearing waybill.

## Feedback Strategy

**Inner-loop command**: `node --test tests/waybill.test.js tests/cli.test.js tests/commands.test.js`

**Playground**: the test suite. Goldens are re-minted with `UPDATE_GOLDEN=1` and then reviewed with `git diff tests/golden/`.

**Why this approach**: every change is either a pure render (golden-pinned) or CLI routing (driven in-process through `cli(argv, cwd)`). The only parts not covered by tests are the two live-session judgment checks.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `tests/golden/bay-cut.md` | `bay --markdown` output after cutting a bay at the refine leg: heading, then a waybill ending in `/waybill:next feat/thing/refine`, with no `cd` fence (path-normalised, see Testing) |
| `tests/golden/next-run.md` | Execute leg, argument `feat/thing/execute`, caller outside the bay: `ENTER BAY:`, `RUN: /spec:apply add-thing`, then the waybill |
| `tests/golden/next-branch-only.md` | Argument `feat/thing`, caller outside the bay: `ENTER BAY:` and no `RUN:` |
| `tests/golden/next-stale-leg.md` | Specs leg, argument `feat/thing/execute`: `ENTER BAY:`, `NEXT LEG: specs`, and no `RUN:` |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/waybill.js` | Export `ENTER_BAY`, `RUN`, `NEXT_LEG` heading constants. `renderWaybillMarkdown(state, inspection, route)` gets a `{bay, enter, token}` route: portable last command, no IN BAY fence, keyed lines on top |
| `src/cli.js` | `parseTarget(arg, branches, legIds)`. `next` passes `{bay, enter, token}`. `issueWaybill` takes the route. The in-bay path passes its own bay. `bay --markdown` drops its `move` cd fence and passes `{bay: path}` |
| `commands/next.md` | `argument-hint`. The bang line routes `$ARGUMENTS` like bay.md does. `allowed-tools` gains `EnterWorktree, Skill, SlashCommand`. Task rules for `ENTER BAY:` / `RUN:` / `NEXT LEG:`. A SELECT re-run stays show-only |
| `commands/bay.md` | Task prose that describes the removed `cd` (`:46-48`, `:70`, `:95`) now points at the `/waybill:next <branch>/<leg>` line |
| `openspec/specs/command-surface/spec.md` | "`next` accepts a branch" (`:64-77`) gains the leg token. "Verbatim rendering, with one keyed exception" (`:144-160`) becomes "with keyed exceptions" |
| `tests/golden/refine.md`, `specs.md`, `execute.md`, `trunk-one-docket.md` | Re-minted: the portable line replaces the raw leg command, and there's no `cd` fence |
| `tests/waybill.test.js` | Per-leg `.md` goldens for legs after `bay` render with `{bay: BAY}`. `trunk-one-docket.md` renders with `{bay: BAY}`. New goldens. The markdown "puts the bay before NEXT" case (`:351-356`) is rewritten as "names the portable line and no cd fence" |
| `tests/cli.test.js` | Parse cases. `cdFence` (`:688-689`) and its uses (`:708`, `:709`, `:719`, `:776`, `:791`, `:827`) are rewritten for no markdown `cd` fence. `bay-cut.md` golden with a normalised path |
| `tests/commands.test.js` | `runBang('next.md', 'feat/…', cwd)` argument routing. `allowed-tools` has `EnterWorktree`/`Skill`/`SlashCommand`. next.md names each exported heading constant, the same way `:223` does for SELECT |
| `src/help.js` | FROM ZERO steps 3 and 5 (`:27`, `:29`) name `/waybill:next <branch>/<leg>` as the session route next to the shell `cd`, with the same line count (45-line cap, `tests/help.test.js:131`) |
| `tests/golden/help.txt` | Re-minted |
| `README.md` | The handover example (`:19`) and the `/waybill:next` row show the `<branch>[/<leg>]` form |

### Deleted Files

None.

## Implementation Details

### 1. Target parsing (`src/cli.js`)

**Pattern to follow**: the `named` lookup in `next()` at `src/cli.js:221-225`.

```js
// branches: fleet branches that have a bay; legIds: LEGS.map((l) => l.id)
export function parseTarget(arg, branches, legIds) {
  if (branches.includes(arg)) return { branch: arg, token: null };
  const cut = arg.lastIndexOf('/');
  const suffix = arg.slice(cut + 1);
  if (cut > 0 && legIds.includes(suffix)) return { branch: arg.slice(0, cut), token: suffix };
  return { branch: arg, token: null };
}
```

**Key decisions**:

- The whole string is tried as a branch first. Git won't let `feat/foo` and `feat/foo/execute` both exist, so there's never a real collision, and a branch like `fix/specs` still resolves as a branch.
- A known-leg suffix whose prefix has no bay still goes to the existing miss message for the *prefix* (`no bay for feat/foo — cut one with …`), not for the whole string.

**Implementation steps**:

1. Add `parseTarget` and use it where `named` is resolved. Keep `docket` and `token`.
2. `--json` accepts the argument form and ignores `token`. Its output shape doesn't change.

**Feedback loop**:

- **Playground**: `tests/cli.test.js`, next to the `next <branch>` cases (`:294-367`), using `trunkWith('feat/thing')`.
- **Experiment**: `feat/thing`, `feat/thing/execute`, `feat/thing/bogus` (no bay → miss names `feat/thing/bogus`), `feat/nope/execute` (miss names `feat/nope`), and a bay on branch `fix/specs` (resolves as the branch).
- **Check command**: `node --test --test-name-pattern "leg token" tests/cli.test.js`

### 2. Route-aware markdown rendering (`src/waybill.js`)

**Pattern to follow**: `handoverCommands` (`src/waybill.js:127-149`) and `nextMarkdown` (`:287-308`).

```js
export const ENTER_BAY = 'ENTER BAY:';
export const RUN = 'RUN:';
export const NEXT_LEG = 'NEXT LEG:';

// route: { bay?: string|null, enter?: boolean, token?: string|null }
export function renderWaybillMarkdown(state, inspection, route = {}) { … }
```

**Behaviour**:

| Condition | Output change |
| --- | --- |
| `route.bay` set and `handover === 'transfer'` | Last command fence → `/waybill:next ${state.branch}/${state.leg}`; `/clear`, `/model`, `/effort` unchanged |
| `route.bay` set, `through` or custom handover | Unchanged: the raw command, since the session never leaves the bay |
| Always, in markdown | No `**IN BAY**` cd fence |
| `route.enter` | First line `ENTER BAY: ${route.bay}` |
| `route.token === state.leg` | Next line `RUN: ${command}[ ${arg}]`: the booking's raw command and argument, i.e. what `handoverCommands` returns as its last command *before* the portable rewrite |
| `route.token` set and `!== state.leg` | Next line `NEXT LEG: ${state.leg}`, and no `RUN:` |

The keyed lines are plain lines above the ```` ```text ```` fence, so the Task can read them before anything is displayed.

**Key decisions**:

- `RUN:` carries the booking's raw command, not the portable line. Otherwise the session would loop into `/waybill:next` again.
- A `cleanup` token emits `RUN:` without `ENTER BAY:`. Entering the bay you're about to delete is wrong, and cleanup already runs from anywhere with `argument: branch`.
- Plain `renderWaybill` keeps its `cd=[]` parameter and its output. Only markdown changes.

**Implementation steps**:

1. Split `handoverCommands` so the raw last command is available separately from the rewritten list.
2. Change the third parameter of `renderWaybillMarkdown` to `route`. Delete the IN BAY section (`:333-335`) from the markdown path only.
3. Prepend the keyed lines.

**Feedback loop**:

- **Playground**: `tests/waybill.test.js` per-leg golden loop (`:128-146`) and `BAY` (`:90`).
- **Experiment**: render execute with `{bay: BAY}`, `{bay: BAY, enter: true, token: 'execute'}` and `{bay: BAY, enter: true}`; specs with `{bay: BAY, enter: true, token: 'execute'}`; contract (through) with `{bay: BAY}` (raw command kept); ideate with `{}` (unchanged).
- **Check command**: `UPDATE_GOLDEN=1 node --test tests/waybill.test.js && git diff --stat tests/golden/`, then without `UPDATE_GOLDEN`.

### 3. CLI wiring (`src/cli.js`)

**Pattern to follow**: `issueWaybill` (`src/cli.js:115-132`) and the `bay` markdown branch (`:507-513`).

**Implementation steps**:

1. `issueWaybill(docket, cwd, json, markdown, io, target = {})`. The markdown route is `{ bay: docket.path, enter: target.named && !isInside(docket.path, cwd), token: target.token ?? null }`. The plain path is unchanged.
2. The no-argument, single-docket trunk path (`:233-247`) calls it with `target = {}`. That gives the portable line, no ENTER BAY and no cd fence.
3. The in-bay path (`:249-256`) passes `{ bay: <this worktree's root> }` when `inBay`, using the same root helper `repoRoot` uses. That gives the portable line with no ENTER BAY.
4. `bay --markdown`: remove `move` (the `**IN BAY**` cd fence) and pass `{ bay: path }` to `renderWaybillMarkdown`. The heading line stays.

**Feedback loop**:

- **Playground**: `tests/cli.test.js` `trunkWith` and the markdown cases around `:688-830`.
- **Experiment**:
  - `next --markdown` from the trunk with one docket (no ENTER BAY).
  - `next --markdown feat/two` from the trunk, from another bay, and from inside `feat/two` (no ENTER BAY).
  - `next --markdown feat/two/<its leg>` gives RUN; `feat/two/<other leg>` gives NEXT LEG.
  - `bay --markdown feat/x`, both newly created and already existing.
- **Check command**: `node --test tests/cli.test.js`

### 4. `commands/next.md`

**Pattern to follow**: `commands/new.md` (`:5` allowed-tools, `:51-63` run-only-the-command and cannot-be-resolved rules) and `commands/bay.md:36` (`$ARGUMENTS` routing).

**Implementation steps**:

1. Frontmatter: `argument-hint: "[branch[/leg] — e.g. feat/thing/execute; omit to see where this docket stands]"`. Append `EnterWorktree, Skill, SlashCommand` to `allowed-tools`, and extend the comment block with why. EnterWorktree is a deferred tool, and loading it through ToolSearch worked in the spike under a restrictive list.
2. Bang line: after the bang-line rebase, `if [ -z "$ARGUMENTS" ]; then … next --markdown; else … next --markdown "$ARGUMENTS"; fi`, keeping bang-line's `2>&1 || echo "waybill: exited $?"` suffix.
3. Task: add keyed rules after the verbatim rule, each naming its heading literally:
   - **`ENTER BAY: <path>`**: call `EnterWorktree` with `path: <path>`. If that fails or is denied, show `` ```\ncd <path>\n``` `` and the block below it, say in one line why the switch failed, and stop. Run nothing.
   - **`RUN: <command> [<arg>]`**: only after any ENTER BAY has succeeded. Invoke `<command>` with `<arg>` through Skill (or SlashCommand). Never run `/clear`, `/model` or `/effort`. Don't show the waybill block first. If the command can't be resolved, say so in one line (the bare `/spec:*` commands need the README's user-level symlinks) and don't substitute a similar-looking one. That's new.md's rule.
   - **`NEXT LEG: <leg>`**: say `<token> is not the next leg — <leg> is`, show the block verbatim and stop.
   - **SELECT A DOCKET**, step 3 (`:71`): the re-run's output may begin with `ENTER BAY:`. Show it verbatim and stop; a selection never switches.

**Feedback loop**:

- **Playground**: `tests/commands.test.js` `runBang` (`:322`) and `bangLine` (`:298`).
- **Experiment**: `runBang('next.md', '', cwd)` → today's no-argument output. `runBang('next.md', 'feat/thing/execute', trunk)` → output starts `ENTER BAY: `. `runBang('next.md', "feat/it's", trunk)` → quoting survives (miss message, no shell error).
- **Check command**: `node --test tests/commands.test.js`

### 5. `commands/bay.md`, the help card, and the living spec

Trivial text edits with no feedback loop:

- **help.js:** step 3 keeps `cd <the path bay printed>` for the shell and adds the session form. Step 5 says a `/clear` handover ends in `/waybill:next <branch>/<leg>`, which moves the session in and runs the leg. Don't add lines: `node --test tests/help.test.js` enforces the cap.

- **bay.md:** remove the "the `cd` command is the one instruction … do not run it" paragraph (`:46-48`) and replace it with one line. The handover now ends in `/waybill:next <branch>/<leg>`, which moves the session itself after `/clear`. Then update `:70` and `:95` to match.
- **command-surface spec, "`next` accepts a branch":** add SHALL text for the `<branch>/<leg>` form (whole string first, then trailing known leg id). Add scenarios for "Naming a docket and its next leg" (RUN), "Naming a stale leg" (NEXT LEG, no RUN) and "Naming a branch from outside its bay" (ENTER BAY).
- **"Verbatim rendering, with one keyed exception" → "Verbatim rendering, with keyed exceptions":** SELECT A DOCKET stays. Add ENTER BAY, including the exact fallback (`cd <path>` fence, then the block, then stop), plus RUN and NEXT LEG. Add a scenario saying a selection re-run never switches.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/waybill.test.js` | Route rendering: portable line on transfer legs with a bay, raw command on through legs, keyed lines, no markdown cd fence. New goldens `next-run.md`, `next-branch-only.md` and `next-stale-leg.md` via `assertGolden(name, …, 'md')` |
| `tests/cli.test.js` | `parseTarget` cases, `next` routing (enter only with an argument and outside the bay), `bay --markdown` post-cut golden `bay-cut.md` |
| `tests/commands.test.js` | Bang-line argument routing, `allowed-tools` has the three tools, next.md names `ENTER_BAY`/`RUN`/`NEXT_LEG` literally |

**Key test cases**:

- The in-bay specs render ends in `/waybill:next feat/thing/specs` and has no `ENTER BAY:`.
- The trunk single-docket render has `/clear`, `/model`, `/effort` and the portable line, in order. It has no `cd`, no `ENTER BAY` and no `RUN:`.
- The contract leg (through) with a bay keeps its raw `/ideation:ideation` command.
- The ideate leg (no bay) is byte-identical to today's golden.
- A `cleanup` token gives `RUN: /waybill:cleanup feat/thing` without `ENTER BAY:`.
- `bay-cut.md`: the test replaces the temp bay path with `/repo/.claude/worktrees/waybill-feat-thing` before `assertGolden`, so the golden is byte-stable.
- Plain `trunk-one-docket.txt` is unchanged (regression guard).

### Manual Testing

- [ ] Live, from a bay at the execute leg: run `/waybill:next`, then `/clear`, `/model opus`, `/effort high` and `/waybill:next <branch>/execute`. EnterWorktree should report the bay path, and spec:apply should complete at least one Edit/Write and one non-openspec Bash call inside the bay. (Precondition: the README's `/spec:*` symlinks.)
- [ ] Live fallback: deny the EnterWorktree prompt once. No Skill call should follow, and `cd <bay path>` should be shown.
- [x] Frontmatter spike (Full tier): make a throwaway `probe` command with `model: haiku` / `effort: low` and invoke it through Skill from a command without frontmatter. Record whether the model indicator switched under Open Items below.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| Argument names no bay | The existing miss message and exit 2, naming the branch part |
| EnterWorktree denied or rejected (bay outside `.claude/worktrees` while already in a worktree) | The Task shows a `cd <path>` fence and the block, then stops; the leg doesn't run |
| RUN command not resolvable in this session | One line naming the command, no substitution, stop |
| Stale token | `NEXT LEG:`; the Task shows the block and stops |
| Non-zero CLI exit | Inherited from bang-line-exit-guard's `waybill: exited N` rule |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| parseTarget | Leg suffix taken from a real branch name | Bay on branch `fix/specs` | Would resolve as branch `fix` + leg `specs` | Whole-string match first; test case |
| Rendering | Portable line on a through leg | Checking `route.bay` without also checking `handover` | Contract leg would `/waybill:next` into itself | Table rule; the contract golden keeps its raw command |
| Rendering | RUN loops | RUN carrying the portable line | `/waybill:next` invokes itself | RUN always carries the raw booking command |
| CLI routing | Session moved without being asked | ENTER BAY emitted on no-argument trunk renders | Checking status moves you into a bay | `enter` requires `named`; regression criterion on `trunk-one-docket.md` |
| next.md Task | Leg runs in the wrong tree | Model runs RUN after a failed EnterWorktree | spec:apply edits the trunk | Rule ordering ("only after any ENTER BAY succeeded"); live fallback judgment check |
| next.md Task | Selection switches | SELECT re-run output begins with ENTER BAY | Unasked-for move | Explicit step-3 rule and a living-spec scenario |
| Cleanup | Session sits in a deleted bay | `feat/x/cleanup` token | Broken cwd | No ENTER BAY for the cleanup token |
| Bookings overlay | Bay overrides a leg's command | `.waybill/bookings` in the bay | RUN must reflect the bay's booking | RUN is built from bookings resolved at `docket.path` (already true in `issueWaybill`) |

## Validation Commands

```bash
npm test
node --test tests/waybill.test.js tests/cli.test.js tests/commands.test.js
node /Users/tinetti/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/next-from-anywhere/contract-data.json
```

There's no lint, typecheck or build step in `package.json`.

## Rollout Considerations

- **Feature flag**: none. This is a plugin release: bump the version in `.claude-plugin/plugin.json` and `package.json` in a separate release PR, as `chore/release-0.5.0` did.
- **Rollback plan**: revert the PR. Goldens and the living spec revert with it.

## Open Items

- [x] Frontmatter spike result (Full tier): **no**, run 2026-09-10 on Claude Code 2.1.268. A throwaway user command with `model: haiku` / `effort: low` was invoked through Skill from a command with no frontmatter, in an interactive Opus 5 session. The operator saw no switch on the model indicator, and the probe reported `claude-opus-5` as its system-prompt model. So a Skill invocation doesn't apply command frontmatter routing. This closes the 2-line handover item in Future: the handover keeps its `/model` and `/effort` lines.
