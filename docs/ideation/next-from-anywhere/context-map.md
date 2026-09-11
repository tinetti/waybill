# Context Map: next-from-anywhere

**Phase**: 1 (single spec) · **Gates**: 5/5 ready · **Verdict**: GO · base `5b6145c`

## Re-anchored line refs
- `src/cli.js`: imports :5-14 (add `inBay` to the repo.js import :19); `KNOWN_LEGS` :86; `issueWaybill` :117-134; `named` lookup :224-232; trunk one-docket :243; in-bay render :252-259; `bay --markdown` :530-539 (`move` :533-535)
- `commands/next.md`: allowed-tools :3; bang line :37; "then stop" :47-49 (must yield to RUN); "exactly one exception" :56; SELECT step 3 :81-83
- `commands/bay.md`: cd paragraph :52-54; "no cd command" :61; menu "prints its cd line" :80; "cd left for me" :104-105
- `tests/waybill.test.js`: BAY :71; per-leg loop :119-127; trunk-one-docket.md :194-196; cd-fence case :301-316; bay-before-NEXT :333-338

## Key patterns
- `handoverCommands` (src/waybill.js:127): last command is the raw leg command
- `renderSelect` literal heading plus `tests/commands.test.js:224-246` literal-pin test
- `commands/new.md:5,20-23,55-67`: Skill/SlashCommand, never run /clear /model /effort, and the unresolvable rule
- `commands/bay.md:42` `$ARGUMENTS` routing with the `2>&1 || echo "waybill: exited $?"` wrapper on every node call

## Dependencies / constraints
- `tests/bang-lines.test.js:152-174`: every node call in a bang line is wrapped
- `tests/commands.test.js:218-221`: next.md has no model/effort frontmatter; `:261-266`: keep `next --markdown <branch>` in the Task
- `tests/help.test.js:130-137`: ≤45 lines, ≤80 columns; `:222`: FROM ZERO keeps `cd `
- Fixtures refine+ are linked worktrees (`inBay` true)

## Risks
- Use `inBay(cwd)`, not `docketOpen`, for the in-bay route (a feature branch can sit in the main checkout)
- Token on a completed docket / no booking; cleanup ENTER BAY suppression
- Stale prose: bookings/waybill-bay.md:10, README:160-163
- `openspec/changes/paste-ready-waybills/` unarchived, and its deltas still require the markdown IN BAY fence; flag it in the PR
