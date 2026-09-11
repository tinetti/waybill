## 0. Inner loop

Measured on this tree (`edec6c8` + the two ideation docs commits). Run the scoped suite while
iterating, and keep `npm test` for section boundaries.

| While working on | Run | Time |
| --- | --- | --- |
| §1, §2 renderer and goldens | `node --test tests/waybill.test.js` | 2.8s |
| §1.2 shape assertions elsewhere | `node --test tests/booking-swap.test.js tests/bookings-overlay.test.js tests/commands.test.js` | 2.3s |
| §3 CLI flags | `node --test tests/cli.test.js` | 14.9s |
| §4 command files | `node --test tests/commands.test.js` | 0.2s |
| every section boundary | `npm test` | 50s |

Acceptance checks live in `docs/ideation/paste-ready-waybills/contract-data.json`. Run them all with
`node ~/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/paste-ready-waybills/contract-data.json`.
Against the pre-implementation tree the run reads `pass=2 fail=8 judgment=1 commits=0/1`. The 8
failures are by design: each one is an acceptance gate. Never edit a check to make it pass.

The exact output shapes, expected strings and file:line anchors are in
`docs/ideation/paste-ready-waybills/spec.md` §1–§5. Each task below quotes the part it needs.

## 1. The handover command list, plain rendering

- [x] 1.1 In `tests/waybill.test.js`'s `next(...)` helper block (~358–420), replace the caption
  assertions (~390, ~395) and the `HANDOVER_LINES` loop (~399–409) with failing tests for the new
  plain NEXT block:
  - `handover: transfer` gives unindented lines `/clear`, `/model <m>`, `/effort <e>`, `<command>`,
    in that order, directly under `NEXT:`
  - `through` and an undeclared handover give no `/clear`
  - `handover: 'hand the laptop to Dave'` gives `  hand the laptop to Dave` (indented) above the
    commands, and no `/clear`
  - no `effort` gives no `/effort` line
  - `model: 'opus[1m]'` gives `/model opus[1m]`
  - `changeId: null` gives the bare command with no trailing space
  - no line matches `└ ` or `then run:`
  - the booking body follows the commands after one blank line, still indented

  Verify: `node --test tests/waybill.test.js` fails on exactly these cases.
- [x] 1.2 Update the hand-written shape assertions in other suites to the unindented form, so they
  fail now:
  - `tests/cli.test.js` ~380 and ~415: `/^\/ideation:brainstorm$/m`
  - `tests/booking-swap.test.js` ~93–95: `/^\/ideation:execute-spec/m` and `/^\/clear$/m`, replacing
    `  /clear, then run:`
  - `tests/bookings-overlay.test.js` ~223: `/^\/mar feat\/thing$/m`
  - `tests/commands.test.js` ~335: `/^superpowers:subagent-driven-development$/m`

  Leave the `cd` assertions in `tests/cli.test.js` (~553–625) indented. Verify: each edited assertion
  fails against the current renderer.
- [x] 1.3 In `src/waybill.js`, extract `handoverCommands(booking, state) → { prose, commands }`,
  keeping the `ARGUMENT_SOURCES` Map lookup and the drop-a-null-argument rule. Rewrite `nextBlock`
  to print `NEXT:`, then the prose (indented, if any), then each command unindented, then
  `waybillText(body)`. Delete `HANDOVER_LINES` and `DEFAULT_HANDOVER`, and update the file's opening
  comment. Leave the complete-state and no-booking branches byte-for-byte as they are. Verify: 1.1
  and 1.2's assertions pass, and `node --test tests/waybill.test.js` reports only golden mismatches.
- [x] 1.4 Run `UPDATE_GOLDEN=1 node --test tests/waybill.test.js`, then read
  `git diff tests/golden` line by line. Only the booked-leg goldens (`ideate bay refine contract
  specs execute cleanup no-docket trunk-one-docket`) may change, and only in their NEXT block.
  Verify: `git diff --exit-code main -- tests/golden/select.txt tests/golden/status.txt
  tests/golden/fleet.txt tests/golden/fleet-empty.txt tests/golden/complete.txt` exits 0, and
  `grep -qx '/model opus' tests/golden/execute.txt && grep -qx '/effort high' tests/golden/execute.txt`
  exits 0.
- [x] 1.5 Section boundary: `npm test` passes. Commit (`feat: list the handover as commands in the
  plain waybill`, body naming `docs/ideation/paste-ready-waybills/spec.md`).

## 2. Markdown renderer

- [x] 2.1 Add a failing test that `cdCommand('/repo/bays/x')` returns `'cd /repo/bays/x'`, next to the
  `cdLines` describe (~260). Then export `cdCommand(target)` from `src/waybill.js` and rewrite
  `cdLines` as `alreadyThere ? [] : [\`${INDENT}${cdCommand(target)}\`]`. Verify: the new test and the
  existing `cdLines` tests pass.
- [x] 2.2 Give `assertGolden` an extension parameter, `assertGolden(name, actual, ext = 'txt')`,
  reading and writing `tests/golden/<name>.<ext>`. Existing call sites stay unchanged. Verify:
  `node --test tests/waybill.test.js` is still green.
- [x] 2.3 Add failing markdown tests to `tests/waybill.test.js`. Every test name must contain
  `markdown`, because a contract check selects them by name.
  - `renders the <id> leg in markdown` inside the existing fixture loop (~128), calling
    `assertGolden(id, renderWaybillMarkdown(resolve(build().dir), CLEAN), 'md')`, plus the same for
    `no-docket`
  - `trunk-one-docket` in markdown with `[cdCommand(BAY)]` as the third argument
  - a findings case with one ignored path and one warning, golden `findings.md`
  - hand-written asserts on hand-built states: every fence body is exactly one line (never two
    commands in one fence); a booking with no effort has no `/effort` fence; custom handover prose is
    a plain paragraph before the first fence; the complete state renders
    `**NEXT** — nothing to hand off — every leg is complete` with no fence; output ends with
    exactly one `\n`

  Verify: the tests fail because `renderWaybillMarkdown` does not exist.
- [x] 2.4 Implement `export function renderWaybillMarkdown(state, inspection, cd = [])` in
  `src/waybill.js`. Keep it pure, and build its commands from `handoverCommands` only. The sections,
  separated by one blank line, are:
  1. ` ```text ` fence holding `header` + `strip`, header only when no docket is open
  2. if `cd` is non-empty, `**IN BAY** — run this in your shell first:` then one fence per cd command
  3. `**NEXT** — paste each block on its own, in order:`, then prose as a paragraph, then one bare
     ``` fence per command
  4. the body, trimmed and unindented
  5. `**IGNORED BY GIT**` / `**WARNINGS**` with `- ⚠ …` bullets, in the same text and order as
     `withFindings`, WARNINGS last

  No-booking reads `**NEXT** — no booking is bound to the <leg> leg — add one under bookings/ to
  give this leg a waybill`. Leave `withFindings` untouched (design decision 3). Verify: 2.3's
  hand-written asserts pass.
- [x] 2.5 Run `UPDATE_GOLDEN=1 node --test tests/waybill.test.js`. Then read every new `.md` golden,
  and check `tests/golden/execute.md` against the exact block in spec.md §2. Verify: no `.txt` golden
  changed (`git status tests/golden` shows only new `.md` files), and the contract's fence-shape check
  exits 0:
  `for c in '/clear' '/model opus' '/effort high' '/spec:apply add-thing'; do [ "$(grep -Fx -B1 -A1 -- "$c" tests/golden/execute.md | grep -cx '```')" -eq 2 ] || exit 1; done`
- [x] 2.6 Section boundary: `npm test` passes, and
  `test -z "$(cat tests/golden/*.txt tests/golden/*.md | grep '└ ')"` exits 0. Commit.

## 3. CLI flags

- [x] 3.1 Add failing tests to `tests/cli.test.js`, with names containing `markdown`:
  - `next --markdown` in a bay prints a ` ```text ` fence and a bare ``` fence around the leg command,
    and exits 0
  - `next --markdown <branch>` from the trunk prints `**IN BAY**` and a fence holding only
    `cd <bay path>`
  - `next --markdown` on the trunk with one docket prints markdown
  - `next --markdown` with several dockets prints output identical to `next` and exits 2
  - `next --json --markdown` exits 2, and stderr contains `cannot be combined` and `--markdown`
  - the same conflict outside a git repository still gives that error, not the repository one
  - `next --markdown --jsonn` is still rejected as ``unknown option `--jsonn` ``
  - `new --markdown` is rejected as an unknown option

  Verify: these fail.
- [x] 3.2 In `src/cli.js` `next()`: add `--markdown` to `NEXT_FLAGS`. Right after the flag loop and
  before `repoRoot`, when both `--json` and `--markdown` are present, write
  ``io.err(`waybill: \`--json\` and \`--markdown\` cannot be combined\n${USAGE}\n`)`` and return 2.
  Thread a `markdown` boolean through `issueWaybill` (markdown uses `renderWaybillMarkdown` with
  `isInside(...) ? [] : [cdCommand(docket.path)]`) and through the in-bay `renderWaybill` call
  (~224). Leave `noWaybill` and `renderSelect` untouched. Add one USAGE Options row,
  `'  --markdown        Fence each handover command for pasting (`next`, `bay`)'`, and do not touch
  the Commands block. Verify: 3.1's tests pass.
- [x] 3.3 Add failing `bay` tests to `tests/cli.test.js`. At least one test name must contain the
  literal `bay --markdown`, because a contract check selects it by that name.
  - `bay --markdown feat/x` from the trunk prints `bay created at <path>` as a paragraph, then
    `**IN BAY** — run this in your shell first:`, a fence holding only `cd <path>`, a blank line,
    and the markdown waybill
  - on a second run, the heading reads `bay already exists at <path>`
  - from inside the bay there is no cd fence, and the heading is the `already inside …` line
  - `bay --markdown` still honours `--bay-dir`

  Verify: these fail with ``unknown option `--markdown` ``.
- [x] 3.4 In `bay()`: accept `--markdown` in the argument loop. In markdown mode, print the heading
  line, then (unless already inside) the IN BAY line and a fence of `cdCommand(result.path)`, then
  `\n` and `renderWaybillMarkdown(state, inspection)`. Plain `bay` output stays unchanged, so the
  existing cd assertions (~553–625) still pass. Verify: 3.3's tests pass, and
  `node --test --test-reporter=spec --test-name-pattern='bay --markdown' tests/ 2>&1 | grep -qE '✔ .*bay --markdown'`
  exits 0.
- [x] 3.5 Section boundary: `npm test` passes, and
  `node src/cli.js next --json --markdown >/dev/null 2>&1; [ $? -eq 2 ]` succeeds. Commit.

## 4. Session command files

- [x] 4.1 Add failing assertions to `tests/commands.test.js`:
  - `commands/next.md` contains `cli.js" next --markdown` and `next --markdown <branch>`
  - `commands/bay.md` contains `cli.js" bay --markdown`
  - `commands/new.md` says to run only the last command line of the NEXT block, and names `/clear`,
    `/model` and `/effort` as not to be run
  - none of `new.md`, `next.md` or `bay.md` contains `then run:`

  The existing `${CLAUDE_PLUGIN_ROOT}` spelling tests must stay green. Verify: the new assertions fail.
- [x] 4.2 Edit `commands/next.md`: the `!` line becomes `… node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown; else …`,
  with the bare `${CLAUDE_PLUGIN_ROOT}` and the else message unchanged. Step 2's command (~60) becomes
  `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown <branch>`. Reword "the handover line says
  whether to `/clear` first" (~40): the first block is `/clear` when the next leg wants a fresh
  session. Add that the markdown is shown as markdown, not wrapped in another fence. Keep the
  verbatim rule and the `SELECT A DOCKET:` exception. Verify: `node --test tests/commands.test.js`
  passes for next.md.
- [x] 4.3 Edit `commands/bay.md`: invoke `… cli.js" bay --markdown "$ARGUMENTS"`, and apply the same
  `/clear` wording fix (~38). Verify: `node --test tests/commands.test.js` passes for bay.md.
- [x] 4.4 Edit `commands/new.md`: replace the "Ignore the `/clear, then run:` line…" paragraph (~51–55)
  with an instruction to run **only the last** unindented command line in the NEXT block (the leg
  command, with its argument), and never `/clear`, `/model` or `/effort`: this session is already the
  fresh one, and its model and effort come from its own frontmatter. Keep the invocation plain, with
  no `--markdown`. Verify: `node --test tests/commands.test.js` passes, and
  `! grep -q 'the[n].run:' commands/new.md commands/next.md commands/bay.md` exits 0.
- [x] 4.5 Section boundary: `npm test` passes. Commit.

## 5. README

- [ ] 5.1 Update `README.md`:
  - rewrite every sample waybill (~12–20, the trunk example and any others) in the new plain form,
    using real output from `node src/cli.js next` where possible
  - document `--markdown` beside `--json`
  - rewrite the `handover` field description (~209): `transfer` → a leading `/clear` command,
    `through` → none, anything else → printed verbatim above the commands
  - remove every `then run:` and every `└ model · effort` caption

  Verify: `! grep -q 'the[n].run:' README.md` exits 0, and `node --test tests/bookings-overlay.test.js`
  passes (it walks the README's own commands).

## 6. Acceptance

- [ ] 6.1 `npm test` passes on the final tree. Delegate the run to `test-runner`, and report pass/fail
  and any failures only.
- [ ] 6.2 Run the contract's verify command (§0). Verify: it reads `fail=0` and `commits=1/1`. If
  COMMITS reads `0/1`, no commit message names `docs/ideation/paste-ready-waybills/spec.md`; amend
  the latest commit on this branch, or add one that does.
- [ ] 6.3 Read `node src/cli.js next` and `node src/cli.js next --markdown` in this worktree by eye.
  Verify: the plain output lists unindented commands, and the markdown output has one fence per
  command with the position inside a `text` fence.
- [ ] 6.4 (Operator) Run `/waybill:next` from a real bay in the Claude desktop app. Verify: each
  command renders as its own code block with a copy button, and pasting them in order hands off
  cleanly. This is the contract's one judgment check, and a session cannot tick it on its own.
