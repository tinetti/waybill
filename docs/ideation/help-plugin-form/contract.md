# Help in plugin form, and a bay you land in Contract

**Created**: 2026-09-30
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

The operator runs waybill only through the Claude Code plugin, as /waybill: commands. The help page is written for a terminal: FROM ZERO and COMMANDS say `waybill new`, `waybill bay feat/x` and `cd <the path bay printed>`, none of which the operator types. Every read of the page means translating it, and two of its five steps carry asides ('a session skips this step', 'in a session its /waybill:next ... moves you') that exist only because the page serves a reader who is not there. The ROUTE table has no column headers, so its three columns are explained only by position.

Separately, /waybill:bay cuts the branch and its worktree but leaves the session in the main checkout. The operator's standing rule is that the main checkout is never written to, and after a brainstorm they skip /clear to keep its conclusion, so the session sits in the wrong tree until a /waybill:next line is pasted. In the session that produced this contract that is exactly what happened.

## Goals

1. `help` prints one page, identical for the CLI verb and /waybill:help, whose FROM ZERO and COMMANDS sections use /waybill: forms only and contain no `waybill <verb>` or `cd` instruction. The target text is docs/ideation/help-plugin-form/help-target.txt.
2. The ROUTE table carries a header row, `#  LEG  CARRIER  STAMP`, whose three named columns line up with the leg rows beneath it, and the page still fits 80 columns and 45 lines.
3. `bay --markdown <branch>` prints an `ENTER BAY: <path>` line whether it cut the bay or found it, except when the session is already inside that bay or the docket's next leg is cleanup; commands/bay.md acts on the line with EnterWorktree, so /waybill:bay leaves the session in the bay.
4. The waybill that bay prints is otherwise unchanged: it still ends in `/waybill:next <branch>/<leg>`, it carries no `RUN:` line, and /waybill:bay still stops without running the next leg.

## Success Criteria

- [ ] The whole suite passes, including regenerated goldens and the reworked help and bay assertions. — check: `node --test tests/` → exits 0
- [ ] COMMANDS lists exactly the five verbs, each in its /waybill: form. — check: `WAYBILL_BOOKINGS_DIR= node src/cli.js help | awk '/^COMMANDS$/{c=1;next} c&&/^$/{c=0} c&&/^  \/waybill:(new|bay|next|status|doctor)/{n++} END{exit n!=5}'` → exits 0 (it exits 1 on main today, where COMMANDS has no /waybill: row)
- [ ] The help page names no terminal form: no `waybill <verb>` and no `cd` step. — check: `! WAYBILL_BOOKINGS_DIR= node src/cli.js help | grep -q -E 'waybill (new|bay|next|status|doctor)|(^| )cd '` → exits 0 (it exits 1 on main today; a crashed `help` is caught by the header-row check below)
- [ ] The line directly under ROUTE is the header row. — check: `WAYBILL_BOOKINGS_DIR= node src/cli.js help | grep -A1 '^ROUTE$' | tail -1 | grep -E '^ +# +LEG +CARRIER +STAMP *$'` → exits 0
- [ ] The header's LEG, CARRIER and STAMP columns start in the same column as the first leg row's. — check: `WAYBILL_BOOKINGS_DIR= GIT_CONFIG_GLOBAL=/dev/null node src/cli.js help | awk '/^ROUTE$/{f=1; getline h; getline r; ok=(index(h,"LEG")>0 && index(h,"LEG")==index(r,"bay") && index(h,"CARRIER")==index(r,"/waybill:bay") && index(h,"STAMP")==index(r,"bay exists"))} END{exit !(f&&ok)}'` → exits 0
- [ ] The page still fits one screen, counted in characters rather than bytes, and is not empty. — check: `WAYBILL_BOOKINGS_DIR= GIT_CONFIG_GLOBAL=/dev/null node src/cli.js help | node -e 'const l=require("fs").readFileSync(0,"utf8").trimEnd().split("\n");process.exit(l.length<20||l.length>45||l.some(x=>[...x].length>80)?1:0)'` → exits 0
- [ ] There is still one rendering: `help` accepts no flag that could select a second one. — check: `! node src/cli.js help --markdown >/dev/null 2>&1` → exits 0
- [ ] Cutting a bay from the trunk prints the keyed line with the bay's path, still hands off through /waybill:next, and carries no RUN line. — check: `r=$PWD; d=$(mktemp -d); git init -q -b main "$d" && git -C "$d" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m init && cd "$d" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > out.txt 2>&1; grep -q -E '^ENTER BAY: /.+feat-x$' out.txt && grep -q -E '^/waybill:next feat/x/' out.txt && ! grep -q '^RUN:' out.txt` → exits 0
- [ ] Run again from the trunk, when the bay already exists, bay still prints the keyed line; this is the path the branch picker's second run takes. — check: `r=$PWD; d=$(mktemp -d); git init -q -b main "$d" && git -C "$d" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m init && cd "$d" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > first.txt 2>&1; WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > second.txt 2>&1; grep -q -E '^ENTER BAY: /.+feat-x$' second.txt` → exits 0
- [ ] Run from inside the bay itself, bay prints its waybill and no keyed line, because there is nowhere to move. — check: `r=$PWD; d=$(mktemp -d); git init -q -b main "$d" && git -C "$d" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m init && cd "$d" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > first.txt 2>&1; b=$(sed -n 's/^ENTER BAY: //p' first.txt); test -d "$b" && cd "$b" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > again.txt 2>&1; grep -q -E '^/waybill:next feat/x/' again.txt && ! grep -q '^ENTER BAY:' again.txt` → exits 0 (the first run must print the line for `test -d` to pass, and the second must print a waybill, so this cannot pass for free)
- [ ] commands/bay.md may call EnterWorktree, names the keyed line it acts on, and still cannot run a leg. — check: `grep -q -E '^allowed-tools:.*EnterWorktree' commands/bay.md && grep -q 'ENTER BAY:' commands/bay.md && grep -q '`/waybill:brief` is the one command you may invoke here' commands/bay.md` → exits 0 (it exits 1 on main today, where bay.md has neither EnterWorktree nor the keyed literal). Amended 2026-10-08 when merging add-next-leg-brief (#41), which put Skill and SlashCommand on bay.md's allowed-tools for the brief prompt; "cannot run a leg" is now held by the Task's one-command rule.
- [ ] In a live session, /waybill:bay <branch> leaves the session inside the new worktree and then stops. — judgment call: The operator runs /waybill:bay on a scratch branch from the trunk and confirms the session's working directory is the bay and that no leg was run.
- [ ] The written requirements match the new behaviour. — judgment call: The PR reviewer reads the OpenSpec deltas for help-card and for command-surface's bay requirements and confirms neither still requires `waybill new`, `cd`, three-column rows, or a bay that does not move the session.

## Scope Boundaries

### In Scope

- Rewrite FROM ZERO (four steps) and COMMANDS in src/help.js to the text in docs/ideation/help-plugin-form/help-target.txt: /waybill: forms, with `/waybill:bay [<branch>]` and `/waybill:next [<branch>]`. — This is the problem as stated: the page names commands the operator never types. `[<branch>]` translates today's shape; the wider `[<branch>[/<leg>]]` would be new content and does not fit 80 columns.
- Add the `#  LEG  CARRIER  STAMP` header to routeLines(), inside the column-width calculation. — Asked for directly; the header names are the page's own WORDS terms, and when bookings fail to resolve every carrier is `—`, narrower than `CARRIER`, so a header outside the calculation would misalign.
- Emit `ENTER BAY: <path>` from `bay --markdown` through the existing keyed-line renderer (pass `enter` at src/cli.js:654), omitted when already inside the bay or when the docket's next leg is cleanup. — The repo keys every exception on an exact string, and `next` already has this one. `next` suppresses the line for cleanup by token (src/cli.js:174-176); bay has no token, so it needs the same rule stated by resolved leg, or it would move a session into a directory about to be removed.
- commands/bay.md: add EnterWorktree to allowed-tools; replace the 'no cd to relay / that line moves the next session' prose (lines 46-56) and the comment at 11-14 with ENTER BAY handling: call EnterWorktree with the printed path, and if it fails or is denied say why in one line, then show the block verbatim and stop. Confirm step 3's 'same terms' sentence (104-106) carries this to the picker's second run rather than describing it twice. — The command file is what acts on the line; a tool left off allowed-tools is unavailable with no error. No `cd` fallback is needed, because bay prints no RUN line and the waybill's /waybill:next line already re-enters.
- Tests: regenerate tests/golden/help.txt from help-target.txt and every golden that `bay --markdown` produces (bay-cut.md at least); rework help.test.js:205-228, commands.test.js:448-455 and :471-477 with its title, and the cli.test.js bay heading assertions at :908-919, :930, :941-945 and :966; add assertions for the header row and for bay's keyed line in the cut, found, inside and cleanup cases. — TDD is the house rule, and these are the assertions the lookups found pinning the old behaviour.
- Archive the finished add-help-card OpenSpec change so openspec/specs/help-card/spec.md exists, then write this effort's change with MODIFIED deltas against help-card (walkthrough literals, 'three things' per row) and command-surface (spec.md:253-256, :191-213, the scenario at :236-239, and :200-202 and :224-226 scoped so 'a selection never switches' applies to next's docket menu only). — Both changes reverse a SHALL. The help-card capability exists only as ADDED requirements in an unarchived change whose tasks are all ticked, so there is no base spec to modify until it is archived.
- Prose that ties ENTER BAY to next alone or says bay does not move the session: openspec/specs/handover/spec.md:122, README.md:193-196, the comments at src/cli.js:650-651 and src/waybill.js:30-37, :49 and :383-384, and a CHANGELOG Unreleased entry. — A recorded learning from next-from-anywhere: behaviour is described outside src/, and task lists that miss those files leave stale text behind.

### Out of Scope

- A second, terminal-form rendering of help behind a flag or mode. — Nobody reads it; it needs a flag on a verb that rejects all arguments, a changed bang line and a second golden.
- A hand-written help page in commands/help.md. — Two copies drift, and ROUTE would stop following the bookings.
- Restructuring the help page: section order, WORDS, the closing lines, or merging FROM ZERO with COMMANDS. — The problem is wording, not layout.
- Adding /waybill:review, /waybill:cleanup or /waybill:spec:* to COMMANDS, or widening /waybill:next to `[<branch>[/<leg>]]`. — Review and cleanup already appear as carriers in ROUTE; widening the list or the argument shape is a separate decision.
- `waybill --help` (the terse usage text), and the bay verb's own heading and `cd` lines without --markdown. — `waybill help` typed in a terminal does change, to the same slash-form page, and that is accepted. These other terminal surfaces stay, as does the CLI itself.
- Any session-versus-terminal detection. — The existing explicit --markdown flag is the only switch, and it is enough.
- Settling or correcting the repo's claim that /clear drops a session back to the main checkout, including the body of bookings/waybill-bay.md that states it and the goldens and guide sample that embed that body. — /wt says the opposite and it cannot be tested from inside a session; keeping the /waybill:next last line is correct either way, and the booking's sentence stays as true as it is today.
- /waybill:bay running the next leg after it enters, or `bay --list` entering anything. — Entering is about where files get written; running a leg is the next session's job and the reason the waybill exists.
- docs/guide/03-reference.md's CLI-table bay row and README.md:127. — Both still describe the behaviour accurately; the reference row is about the terminal verb.

### Future Considerations

- None.

## Decisions Considered and Rejected

- **One slash-form help page for both the CLI verb and /waybill:help.** — rejected: Two renderings, with the terminal keeping the CLI forms.. It needs flag plumbing, a changed bang line and a second golden for a form nobody reads.
- **Keep the page generated by src/help.js.** — rejected: A static, hand-written page in commands/help.md.. The copies would drift and ROUTE is derived from the bookings.
- **Change wording within the existing sections.** — rejected: Restructuring the page, for example merging FROM ZERO and COMMANDS.. The problem is that the forms are wrong, not that the layout is.
- **FROM ZERO becomes four steps, with 'move in' folded into the bay step.** — rejected: Keeping five steps with a reworded 'move in' step.. Once bay enters the bay there is no separate action for the operator to take.
- **bay --markdown prints the keyed `ENTER BAY: <path>` line and bay.md acts on that exact string.** — rejected: bay.md parsing the path out of the 'bay created at <path>' prose heading, with no CLI change.. It is cheaper in tests but has the model reading prose headings, which the repo avoids everywhere else.
- **The waybill bay prints keeps its `/waybill:next <branch>/<leg>` last line, and no new claim about /clear is made.** — rejected: Correcting the /clear prose across next.md, README, the guide and the handover spec, or stating in bay.md that /clear undoes the move.. The repo and /wt disagree and it cannot be tested here; the unchanged line re-enters when needed and is a no-op move when not.
- **Both changes ship in one branch and PR, as separate commits.** — rejected: A separate docket for the bay change.. The operator asked for it to ride along, and the help page's bay step depends on the new behaviour.
- **Persist the approved help page as help-target.txt beside the contract, fitted to 80 columns, and point the help phase at it.** — rejected: Leaving the strawman in the interview conversation and letting the specify leg reword it.. Critic blocker (hidden-dependency): the specify leg starts after /clear and the target existed nowhere on disk. Fitting it to 80 columns shortened three FROM ZERO descriptions and kept `/waybill:next [<branch>]`.
- **The 'names the plugin forms' criterion counts /waybill: rows inside the COMMANDS block and puts the threshold in the exit code.** — rejected: `grep -c` over the whole page with 'prints 5 or more' as the expectation.. Critic blocker (success-criteria): verification judges on exit status only, and the old check already passed on main because ROUTE and step 5 mention /waybill: twice.
- **Archive add-help-card first, then write MODIFIED deltas against the living help-card spec.** — rejected: Editing the unarchived add-help-card change in place.. In-place editing leaves its ticked tasks.md and design.md demanding `waybill new` and `cd`, and makes this branch own a finished change, which feeds change-id discovery for the execute leg.
- **Leave the body of bookings/waybill-bay.md untouched.** — rejected: Rewording it to mention that /waybill:bay moves the session in.. Its sentence is about the handover after /clear, which this change does not alter, and it is embedded in four goldens that the guide must equal byte for byte.
- **bay.md's EnterWorktree failure handling is one line of explanation, then the block verbatim.** — rejected: Mirroring next.md's `cd <path>` fallback.. next.md needs it because a RUN line follows; bay prints none, and the waybill's /waybill:next line already recovers the move.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Archive add-help-card
  ├── Bay entry  (blocked by Archive add-help-card)
  └── Help page in plugin form  (blocked by Archive add-help-card, Bay entry)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/help-plugin-form/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Help in plugin form, and a bay you land in contract (help-plugin-form) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/help-plugin-form/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/help-plugin-form/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=3/3 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Archive add-help-card _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/help-plugin-form/spec-phase-1.md
   ```

2. **Phase 2** — Bay entry _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/help-plugin-form/spec-phase-2.md
   ```

3. **Phase 3** — Help page in plugin form _(blocked by Archive add-help-card, Bay entry)_

   ```bash
   /ideation:execute-spec docs/ideation/help-plugin-form/spec-phase-3.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
