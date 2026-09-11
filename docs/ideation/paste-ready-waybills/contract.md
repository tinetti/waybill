# Paste-Ready Waybills Contract

**Created**: 2026-09-10
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Express — single consolidated confirmation, no per-artifact review
**Supersedes**: None

## Problem Statement

Waybill's whole job is to hand the next session its orders, but the NEXT block hands them over as prose. The model and effort arrive as a caption — `└ opus · high effort` — that the operator has to translate into `/model opus` and `/effort high` by hand, and `/clear, then run:` fuses an instruction to a sentence. Every leg of every docket pays that translation at the exact moment the operator is switching context.

The obvious fix — one block holding `/model`, `/effort` and the command, as the request sketched it — does not work: Claude Code submits a multi-line paste as one input, so `/model` receives the following lines as its argument. The user's live test returned `Model 'haiku     /effort low' not found`. Each slash command therefore has to be its own paste, which makes one copy button per command the thing worth building.

## Goals

1. Every command a handover needs — `/clear` (transfer legs), `/model`, `/effort` (when booked), the leg command, and `cd` (when present) — arrives as its own fenced block in /waybill:next and /waybill:bay: 0 commands retyped per handover, down from 2.
2. Plain `waybill next` (and `new`, `bay`) prints the NEXT commands one per line, unindented, and the `└ model · effort` caption and `/clear, then run:` line are gone.
3. No regressions: the SELECT A DOCKET, status, fleet and complete goldens are byte-identical to main, and `--json` is untouched because the change is render-only.

## Success Criteria

- [ ] The full suite passes, including new `.md` goldens for every booked leg. — check: `node --test tests/` → exits 0
- [ ] Markdown-mode tests exist and run. — check: `node --test --test-reporter=spec --test-name-pattern=markdown tests/ 2>&1 | grep -qE 'pass [1-9]'` → exits 0 (at least one matching test passed)
- [ ] In the execute markdown golden, every handover command sits alone between bare fences — `/model` and `/effort` never share a block. — check: `for c in '/clear' '/model opus' '/effort high' '/spec:apply add-thing'; do [ "$(grep -Fx -B1 -A1 -- "$c" tests/golden/execute.md | grep -cx '```')" -eq 2 ] || exit 1; done` → exits 0
- [ ] Plain output lists the NEXT commands unindented, one per line, with no `then run:` line left in any golden. — check: `grep -qx '/model opus' tests/golden/execute.txt && grep -qx '/effort high' tests/golden/execute.txt && grep -qx '/spec:apply add-thing' tests/golden/execute.txt && ! grep -q 'the[n].run:' tests/golden/*.txt` → exits 0
- [ ] No golden carries the `└ model · effort` caption. — check: `! grep -l '└ ' tests/golden/*.txt tests/golden/*.md` → exits 0 (grep lists no file)
- [ ] The select, status, fleet and complete goldens are unchanged from main. — check: `git diff --exit-code main -- tests/golden/select.txt tests/golden/status.txt tests/golden/fleet.txt tests/golden/fleet-empty.txt tests/golden/complete.txt` → exits 0
- [ ] `--json` with `--markdown` is rejected with exit 2 and an error naming the conflict. — check: `node src/cli.js next --json --markdown >/dev/null 2>&1; [ $? -eq 2 ] && node src/cli.js next --json --markdown 2>&1 | grep -q -- '--markdown'` → exits 0
- [ ] Both handover slash commands ask the CLI for the markdown form, including the `next <branch>` re-run in /waybill:next's SELECT A DOCKET step. — check: `grep -q 'cli.js" next --markdown' commands/next.md && grep -q 'next --markdown <branch>' commands/next.md && grep -q 'cli.js" bay --markdown' commands/bay.md` → exits 0
- [ ] `waybill bay --markdown` puts its `cd` line in a fence of its own. — check: `node --test --test-reporter=spec --test-name-pattern='bay --markdown' tests/ 2>&1 | grep -qE 'pass [1-9]'` → exits 0 (the bay markdown CLI test ran and passed)
- [ ] No command file still points the model at the removed `/clear, then run:` handover line. — check: `! grep -q 'the[n].run:' commands/new.md commands/next.md commands/bay.md README.md` → exits 0
- [ ] In a real session the blocks are usable as intended. — judgment call: The operator runs /waybill:next from a real bay in the Claude desktop app and confirms each command renders as its own code block with a copy button, and that pasting them in order hands off cleanly.

## Scope Boundaries

### In Scope

- Plain renderer: NEXT lists `/clear` (transfer only), `/model <model>`, `/effort <effort>` (when booked) and the leg command one per line, unindented; the `└` caption and the `/clear, then run:` / `run:` lines are removed; an unrecognised `handover` string is kept as an indented prose line above the commands; the booking body stays indented below; the plain `IN BAY:` cd line is unchanged. — The commands become the handover itself rather than a caption to translate — goal 2.
- `waybill next --markdown`: position block in a ```text fence, a **NEXT** line, a custom handover string as a paragraph, one ``` fence per command in order, `IN BAY:` cd as its own fence, body as unindented prose, IGNORED BY GIT / WARNINGS as bullets. — One copy button per command is the only shape that survives the paste test — goal 1.
- `waybill bay --markdown`: bay renders its own `bay created at …` heading and its cd line in markdown (cd in its own fence) in src/cli.js, using a bare-command form of `cdLines`, then the markdown waybill. — `bay` prints the cd via its own heading, not the renderer's IN BAY section, so goal 1's fenced cd needs its own path.
- commands/next.md and commands/bay.md invoke the CLI with `--markdown`, including next.md's step-2 `next <branch>` re-run; their 'the handover line says whether to /clear' wording points at the `/clear` block instead; the verbatim-echo rule stays. — Two output modes asked for at once is a caller error, and the CLI already rejects rather than ignores.
- commands/next.md and commands/bay.md invoke the CLI with `--markdown`, including next.md's step-2 `next <branch>` re-run, and keep the verbatim-echo rule. — The model's job stays echo-verbatim; the fences are produced by code a golden can pin.
- commands/new.md: of the NEXT block's command lines, run only the last (the leg command) — never `/clear`, `/model` or `/effort`; a commands.test.js assertion pins it. — new.md's 'ignore the `/clear, then run:` line' instruction targets a line this change removes; left alone, the session could run /clear or /model.
- Tests: `assertGolden` gains an extension parameter; every booked-leg `.txt` golden regenerated; a `.md` golden per booked leg plus IN BAY and IGNORED/WARNINGS cases; the hand-written shape assertions in tests/waybill.test.js, booking-swap, bookings-overlay, cli.test.js and commands.test.js updated; markdown tests live in existing suites (or are registered in tests/index.js); README examples updated. — Golden files are how this repo pins every byte of output.

### Out of Scope

- Stopping `/model` and `/effort` from saving as the default for new sessions. — That is Claude Code's behaviour (observed in the user's paste test), not Waybill's; noted, not addressed.
- `--markdown` for `/waybill:new`. — It runs its command in the current session, so there is nothing to paste — though its plain output does change under goal 2, which is why commands/new.md is in MVP.
- The SELECT A DOCKET menu and `waybill status`. — Neither carries a command for the next session.
- Placeholders for arguments Waybill cannot supply (e.g. the bay leg's branch name). — A pasted placeholder submits literally; the bare command plus the booking prose is safer.
- A booking field for context window (e.g. `[1m]`). — `/model opus[1m]` is the documented alias; a booking overlay can say `model: opus[1m]` and it passes through verbatim.
- The version bump. — This repo releases in its own `chore: release` PR.

### Future Considerations

- None.

## Decisions Considered and Rejected

- **One fenced block per slash command.** — rejected: One block holding `/model`, `/effort` and the leg command together, as the request sketched it.. The user's live paste test showed Claude Code submits a multi-line paste as one input: `/model haiku` + newline + `/effort low` returned "Model 'haiku     /effort low' not found".
- **Fences only in the slash surface; the plain CLI prints bare, unindented command lines.** — rejected: Emitting ``` fences in the plain CLI output too.. A plain terminal would show literal backticks around every command.
- **A `--markdown` flag on `next` (and `bay`) produces the fenced form; the slash command echoes it verbatim.** — rejected: Having the model wrap each unindented `/` line in a fence per instructions in commands/next.md.. Model-side transformation cannot be pinned by a golden and drifts between runs.
- **Commands with an argument Waybill cannot supply are fenced bare.** — rejected: A placeholder in the fence, e.g. `/waybill:bay feat/<name>`.. Paste-and-Enter would submit the literal placeholder as a branch name.
- **/waybill:next and /waybill:bay switch to markdown; /waybill:new stays plain.** — rejected: Markdown on all three waybill-printing commands.. /waybill:new runs its command in the current session, so its fences would never be clicked.
- **The booking's `model` value is passed to `/model` verbatim.** — rejected: A new booking field for context window to produce forms like `opus5[1m]`.. Claude Code's documented 1M alias is `opus[1m]`, which a booking can already hold as its `model` value.
- **The position block (header + leg strip) goes inside a ```text fence in markdown mode.** — rejected: Leaving it as bare markdown lines.. Markdown collapses the leg strip's single newlines into one paragraph.
- **commands/new.md is updated to run only the leg command.** — rejected: Leaving /waybill:new entirely out of scope (the pre-critic plan).. Scope-creep and hidden-dependency critics: new.md's skip instruction names the `/clear, then run:` line this change deletes, and the session could run /clear or /model.
- **`bay --markdown` renders its own heading and fenced cd in src/cli.js.** — rejected: Relying on the renderer's IN BAY section (the pre-critic plan).. Hidden-dependency critic: `bay` never passes cd to renderWaybill and prints `bay created at …` itself, so the renderer's fence could not reach /waybill:bay.
- **An unrecognised `handover` string stays as a prose line above the commands; `through` renders nothing, `transfer` renders the `/clear` command.** — rejected: Dropping the handover line for every value.. Hidden-dependency critic: custom handovers are printed verbatim on purpose (tests/waybill.test.js 'hand the laptop to Dave', README) and dropping them silently loses a booking's instruction.
- **The plain `IN BAY:` / bay cd line keeps its current indented form.** — rejected: Unindenting cd in plain mode too.. cd is a shell command, not a slash command; the fenced form in markdown mode covers copying, and cli.test.js already pins the indent.
- **Success criteria check fence shape, unindented plain lines, unchanged non-waybill goldens and the flag conflict directly.** — rejected: Relying on goldens generated by the same PR plus a single name-pattern test (the pre-critic criteria).. Success-criteria critic: UPDATE_GOLDEN rewrites whatever the code prints, so a merged /model+/effort fence would have passed every command check.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Paste-ready NEXT block in plain and markdown modes
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/paste-ready-waybills/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Paste-Ready Waybills contract (paste-ready-waybills) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/paste-ready-waybills/contract.md`. All commits belong on branch ideation/paste-ready-waybills — switch to it before any run.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/paste-ready-waybills/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Paste-ready NEXT block in plain and markdown modes _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/paste-ready-waybills/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
