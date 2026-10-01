Each task names its own check. Tests are written first and seen to fail before the code that
satisfies them (groups 2–5 each open red). `design.md` holds the decisions; the numbers in brackets
point at them.

## 1. Baseline

- [x] 1.1 Record a green baseline before any edit: `npm test` passes on the branch. Note the pass
  count; every later "suite passes" is measured against it.
- [x] 1.2 Confirm the three anchors this change builds on still hold:
  `grep -q "id: 'ideate'" src/legs.js && grep -q "id: 'specify'" src/legs.js && test -f bookings/ideation-ideate.md && test -f bookings/openspec-specify.md`
  exits 0. If it does not, stop and report — the route has moved again and `design.md` is stale.

## 2. Booking `brief:` key

- [x] 2.1 In `tests/bookings.test.js`, add failing tests: a booking with `brief: some guidance`
  loads with `booking.brief === 'some guidance'`; a booking without it has `brief` undefined; an
  empty `brief:` is treated as absent. Verify: `node --test tests/bookings.test.js` fails on the
  new cases only.
- [x] 2.2 In `tests/bookings-overlay.test.js`, add failing tests: an overlay rebooking `ideate`
  without `brief` yields no `brief` (whole-booking replacement); an overlay adding `brief` to
  `execute` yields it. Verify: the new cases fail.
- [x] 2.3 Add `'brief'` to `OPTIONAL` and to the `Booking` typedef in `src/bookings.js` [8]. Verify:
  `node --test tests/bookings.test.js tests/bookings-overlay.test.js` passes.
- [x] 2.4 Add the `brief:` line to `bookings/ideation-ideate.md` and `bookings/openspec-specify.md`,
  with the exact text in `design.md` decision 8, each on one line. Add a test that the built-in
  `ideate` and `specify` bookings carry a non-empty `brief` and that `bay`, `execute`, `review`,
  `cleanup` and `brainstorm` do not. Verify: `node --test tests/bookings.test.js` passes and
  `grep -c '^brief:' bookings/*.md` reports exactly two files with a count of 1.

## 3. `src/brief.js`

- [x] 3.1 Create `tests/brief.test.js` with `after(cleanupAll)` and failing tests for `briefTarget`:
  returns `state.leg` when `state.booking.brief` is set; `null` when the booking has no `brief`,
  when `state.docketOpen` is false, when `state.leg` is `null`, and when `state.booking` is
  undefined. Add `import './brief.test.js';` to `tests/index.js` in alphabetical position. Verify:
  `grep -q 'brief.test.js' tests/index.js` and the file fails only because `src/brief.js` is
  missing.
- [x] 3.2 Add failing tests for `briefPath` (`<bay>/.waybill/handoff/<leg>.html`), `briefExists`
  (false before a file is written, true after), and `ensureHandoff`: creates the directory and a
  `.gitignore` whose content is exactly `*\n`, returns the brief's path, and is safe to call twice
  (one `.gitignore`, content unchanged, an existing brief file untouched). Use `tempRoot()`.
- [x] 3.3 Add failing tests for `briefContext(bay, state)`: `null` when `briefTarget` is `null`;
  otherwise `leg`, `path`, `exists`, `bay`, `skipped` (from `state.skipped`), `after` (the first
  leg after `state.leg` not in `state.completed`; `null` at the end of the route), and
  `ideationDir` (the directory of the single changed file matching `docs/ideation/*/contract.md`;
  `null` for none and for more than one) [6].
- [x] 3.4 Implement `src/brief.js` with `HANDOFF_DIR`, `briefTarget`, `briefPath`, `briefExists`,
  `ensureHandoff` and `briefContext` [5], reusing the `stampPath` glob matcher from
  `src/bookings.js` for `ideationDir` rather than adding a second one. Verify:
  `node --test tests/brief.test.js` passes.

## 4. Renderer: `BRIEF:` line and `RUN:` suffix

- [x] 4.1 In `tests/waybill.test.js`, beside the `renderWaybillMarkdown keyed lines` cases, add
  three failing golden tests built from an ideate-leg and a specify-leg state with a hand-built
  `route.context`: `ideate-brief` (token `ideate`, `exists: true`), `ideate-no-brief` (token
  `ideate`, `exists: false`), `specify-brief` (token `specify`, `exists: true`, an `ideationDir`).
  Record them with `UPDATE_GOLDEN=1` only after 4.4 is implemented. Verify: the three cases fail.
- [x] 4.2 Add failing assertions, no golden needed: a display run (no token) with
  `context.exists === false` carries a paragraph `BRIEF: <leg> <path>` above the position fence and
  after any `ENTER BAY:`; with `exists === true` it carries none; a route with no `context` carries
  none; a stale token (`NEXT LEG:`) carries none; a run-mode document never carries `BRIEF:`.
- [x] 4.3 Add failing assertions on the suffix: the `RUN:` line contains no newline; fields appear in
  the order `Brief:`, `branch`, `bay`, `ideation`, `skipped`, `next after this session:`, joined by
  ` · `; `ideation`, `skipped` and `next after this session:` are each omitted when empty; the
  `→ runs` annotation carries no `Brief:` text.
- [x] 4.4 In `src/waybill.js`: export `BRIEF = 'BRIEF:'`, add `context` to the `Route` typedef and
  the `BriefContext` typedef, and extend `keyedLines` per decision 5 and 7. Extend the doc comment
  above the keyed-line exports to name `BRIEF`. Verify: `node --test tests/waybill.test.js` passes
  after recording the three goldens with `UPDATE_GOLDEN=1`, and
  `grep -q '.waybill/handoff/ideate.html (read first)' tests/golden/ideate-brief.md && grep -q '.waybill/handoff/specify.html (read first)' tests/golden/specify-brief.md && ! grep -q 'handoff/ideate.html' tests/golden/ideate-no-brief.md && grep -q 'Brief: none written' tests/golden/ideate-no-brief.md`
  exits 0.
- [x] 4.5 Confirm nothing else moved: `git diff --quiet main -- tests/golden/next-run.md` exits 0,
  and `git status --short tests/golden` lists only the three new files.

## 5. CLI: the `brief` verb and context assembly

- [x] 5.1 In `tests/cli.test.js`, add `describe('waybill brief')` with failing tests, using
  `createRepo`/`addWorktree`: from the trunk with a branch argument whose next leg is `ideate`,
  stdout is `BRIEF FOR: ideate`, `WRITE TO: <bay>/.waybill/handoff/ideate.html` and a `GUIDANCE:`
  line, exit 0; `.waybill/handoff/.gitignore` contains `*`; after writing a file at the `WRITE TO:`
  path, `git status --porcelain` in the bay is empty. Verify:
  `grep -q "describe('waybill brief'" tests/cli.test.js` and the cases fail.
- [x] 5.2 Add failing tests for the remaining answers: inside the bay with no argument; a
  `<branch>/<leg>` argument whose leg is ignored; `NOTHING TO BRIEF: execute takes no brief` with
  exit 0 and no `.waybill/handoff/` created; `NOTHING TO BRIEF: every leg is complete` with exit 0;
  no bay for the branch (one line naming `bay <branch>`, exit 2, on stdout); no dockets (exit 2);
  three dockets and none named (one line naming `brief <branch>`, no `SELECT A DOCKET:`, exit 2);
  an unknown option and a second positional (exit 2); running twice prints the same lines.
- [x] 5.3 Add `it('removes a bay holding a brief')`: run `brief`, write a brief file, then
  `git worktree remove <bay>` with no `--force` exits 0. Verify:
  `grep -q "it('removes a bay holding a brief'" tests/cli.test.js`.
- [x] 5.4 Add failing CLI-level tests for the markdown call sites: `bay --markdown feat/x` on a fresh
  bay carries `BRIEF: ideate <path>`; `next --markdown` inside a bay at `specify` carries
  `BRIEF: specify <path>` and stops carrying it once the file exists; `next --markdown` at
  `execute` and on a feature branch in the main checkout carry none; `next --markdown feat/x/ideate`
  carries the suffixed `RUN:` with `Brief: none written`, then with the path once the file exists;
  `next --json` output is unchanged by a brief's presence.
- [x] 5.5 Implement the `brief` verb in `src/cli.js` [9]: resolve bookings and leg from the bay as
  `issueWaybill` does, call `ensureHandoff` only when there is a target, print the three lines.
  Register it in `COMMANDS` and add a `brief [<branch>]` row to `USAGE` after `status`. Verify:
  `node --test --test-name-pattern='waybill brief' tests/cli.test.js` passes with a non-zero test
  count, and `--test-name-pattern='removes a bay holding a brief'` likewise.
- [x] 5.6 Pass `context: briefContext(bay, state)` at the three `renderWaybillMarkdown` call sites
  (`issueWaybill`, the in-bay branch of `next` — only when `inBay(cwd)` — and `bay --markdown`).
  Verify: `node --test tests/cli.test.js` passes, including 5.4.
- [x] 5.7 Add one row to the COMMANDS block of `src/help.js`,
  `  waybill brief [<branch>] where the next leg's brief goes, and what it should say`, kept to 80
  columns, and re-record `tests/golden/help.txt` with `UPDATE_GOLDEN=1`. Update any assertion in
  `tests/help.test.js` that enumerates the verbs. Verify: `node --test tests/help.test.js` passes
  (the `fits one screen` test holds the 45-line and 80-column budget).
- [x] 5.8 Phase gate: `npm test` passes, and
  `git diff --quiet main -- tests/golden/next-run.md && node --test --test-name-pattern='keyed lines' tests/waybill.test.js`
  exits 0. No command file or doc has changed yet.

## 6. `/waybill:brief`

- [x] 6.1 In `tests/commands.test.js`, add `'brief.md'` to `DECLARED` in its sorted position and add
  failing tests: `brief.md`'s `allowed-tools` contains `Write`; it declares no `model` or `effort`;
  its body names the literals `WRITE TO:`, `GUIDANCE:` and `NOTHING TO BRIEF:`; its bang line uses
  bare `${CLAUDE_PLUGIN_ROOT}` and passes `"$ARGUMENTS"` only when non-empty. Verify: the suite
  fails because `commands/brief.md` does not exist.
- [x] 6.2 In `tests/bang-lines.test.js`, add a failing case that runs `brief.md`'s bang line with a
  branch argument against a fixture bay and with no argument outside a repository, asserting the
  `WRITE TO:` line and the `waybill: exited 2` marker respectively.
- [x] 6.3 Create `commands/brief.md` [12]: description `Waybill — write the brief the next leg's
  session will read`; an `argument-hint` for the optional branch; `allowed-tools: Bash(node:*),
  Bash(test:*), Bash(echo:*), Write`; the house comment blocks explaining each tool and the bang
  line; a Task section keyed on the verb's literals — on `NOTHING TO BRIEF:` relay and stop; on
  `waybill: exited N` relay verbatim and stop; on `WRITE TO:` write one self-contained HTML page
  there following `GUIDANCE:`, drawing only on this conversation, leaving out any section with
  nothing behind it and saying why; then confirm in one line. Verify:
  `test -f commands/brief.md && grep -qE '^allowed-tools:.*\bWrite\b' commands/brief.md` and
  `node --test tests/commands.test.js tests/bang-lines.test.js` passes.

## 7. Triggers in `next.md` and `bay.md`

- [x] 7.1 In `tests/commands.test.js`, add failing tests: `next.md` and `bay.md` each contain the
  literal `BRIEF:`; `next.md` contains `/waybill:brief`; `bay.md` contains `/waybill:brief`; update
  the pinned `bay.md` tool list to `Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion,
  Skill, SlashCommand` and assert `Skill` and `SlashCommand` by name. Verify: the new cases fail.
- [x] 7.2 Edit `commands/next.md` [10]: add a `BRIEF: <leg> <path>` subsection — ask with
  `AskUserQuestion` ("Write the brief for `<leg>` before you /clear?"; options "Yes — write it now
  (Recommended)" and "Skip") *before* showing the block, invoke `/waybill:brief <branch>` on yes,
  then show the block verbatim and stop; state that the question is asked when the line is present
  and never otherwise. Under `RUN:`, add that once the invoked command has finished — and never
  before — the session invokes `/waybill:brief <branch>` and follows it, and that
  `NOTHING TO BRIEF:` there is an ordinary answer. Note that everything after the command on a
  `RUN:` line is its argument. No `allowed-tools` change. Verify:
  `grep -q 'waybill:brief' commands/next.md && grep -q 'BRIEF:' commands/next.md`.
- [x] 7.3 Edit `commands/bay.md` [11]: the same `BRIEF:` subsection; add `Skill, SlashCommand` to
  `allowed-tools`; extend the top comment block with one sentence saying why each was added;
  reconcile the "Then stop" paragraphs so the prompt is the one thing that precedes the block.
  Verify: `grep -q 'BRIEF:' commands/bay.md && grep -qE '^allowed-tools:.*\bSkill\b' commands/bay.md`
  and `node --test tests/commands.test.js` passes.
- [x] 7.4 Mention `/waybill:brief` in `commands/help.md` where it lists the session commands.
  Verify: `grep -q 'waybill:brief' commands/help.md` and `node --test tests/commands.test.js` passes.

## 8. Documentation

- [x] 8.1 `README.md`: document the brief — what it is, that it lives at
  `<bay>/.waybill/handoff/<leg>.html` and is ignored by git, when it is asked for, and the `brief:`
  booking key. Verify: `grep -q 'waybill:brief' README.md`.
- [x] 8.2 `docs/guide/02-glossary.md`: define "brief". `docs/guide/03-reference.md`: add
  `waybill brief [<branch>]` with its output lines and exit codes, `/waybill:brief`, the `brief:`
  key, the `BRIEF:` keyed line, the `RUN:` suffix fields, and the handoff path. Verify:
  `grep -q 'waybill:brief' docs/guide/02-glossary.md docs/guide/03-reference.md` matches both.
- [x] 8.3 `docs/guide/01-ride-along.md`: show the prompt at the `/waybill:bay` handoff and at the
  ideate → specify handoff, and the suffixed `RUN:` line the next session receives. Verify:
  `grep -q 'BRIEF:' docs/guide/01-ride-along.md` and `node --test tests/guide.test.js` passes.

## 9. Verification

- [x] 9.1 Full suite and the contract's translated checks, all exiting 0: `npm test`;
  `test -f tests/golden/ideate-brief.md && test -f tests/golden/ideate-no-brief.md && test -f tests/golden/specify-brief.md`;
  `git diff --quiet main -- tests/golden/next-run.md`;
  `for f in README.md docs/guide/02-glossary.md docs/guide/03-reference.md commands/next.md commands/bay.md commands/help.md; do grep -q 'waybill:brief' "$f" || exit 1; done`.
- [x] 9.2 Run the repo's lint and format check as CI does (the scripts in `package.json`), and
  `openspec validate add-next-leg-brief --strict`. Both exit 0.
- [ ] 9.3 Manual, by the repo owner: run one real effort through `/waybill:new` → `/waybill:bay` →
  answer yes to the brief prompt → `/clear` → paste the handover. Confirm that `git status` in the
  bay is clean, that `RUN:` carries `Brief: … (read first)`, and that ideation's intake prints
  `Carrying brainstorm conclusion…` from the brief. Record the outcome in the PR description; if the
  intake ignores the brief, stop and report rather than adjusting the mechanism.
