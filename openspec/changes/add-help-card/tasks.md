## 1. Gate and test harness

- [x] 1.1 Confirm the prerequisite gate still holds before anything else. Run
  `node bin/waybill --help | grep -qE '^  new' && node bin/waybill --help | grep -qE '^  bay'`.
  It must exit 0; if it does not, stop and report the gate as unmet.
- [x] 1.2 Record a green baseline: `node --test tests/` passes on the branch before any edit.
  Note the pass count.
- [x] 1.3 Promote `assertGolden` from `tests/waybill.test.js:41-48` into
  `tests/helpers/repo-fixture.js` as `export function assertGolden(dir, name, actual)`, with the body
  and the `UPDATE_GOLDEN=1` behavior unchanged. Switch `tests/waybill.test.js` to import it
  (passing its `GOLDEN` dir) and delete the private copy. Verify: `node --test tests/waybill.test.js`
  passes with no golden file changed (`git status tests/golden` is clean).

## 2. Failing tests first (red)

- [x] 2.1 Create `tests/help.test.js`. It imports `renderHelp` and `MAX_LINES` from
  `../src/help.js`, `run` from `../src/cli.js`, `LEGS`, and `assertGolden`, `withEnv`, `tempRoot`,
  `writeFile` and `cleanupAll` from the helper, with `after(cleanupAll)`. Add a local `isolated(fn)`
  wrapper: `withEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  WAYBILL_BOOKINGS_DIR: undefined }, fn)`. Verify: the file exists and parses. Running it fails only
  because `src/help.js` does not exist yet.
- [x] 2.2 Register the suite: add `import './help.test.js';` to `tests/index.js` in alphabetical
  position, between `frontmatter` and `inference`. Verify: `grep -q 'help.test.js' tests/index.js`.
- [x] 2.3 Add the test named verbatim `fits one screen`. Under `isolated`, rendering from `tempRoot()`
  gives at most `MAX_LINES` lines, counted as `page.split('\n').length - 1` because of the trailing
  newline. `MAX_LINES === 45`, and every line is at most 80 columns
  (`[...line].length`, so the em-dash counts as one). Verify: `grep -q 'fits one screen' tests/help.test.js`.
- [x] 2.4 Add the test named verbatim `lists every leg`. Every `LEGS` id appears in the ROUTE section
  (the text between the `ROUTE` and `WORDS` headings), at strictly increasing offsets, each on a line
  prefixed by its 1-based index. Verify: `grep -q 'lists every leg' tests/help.test.js`.
- [x] 2.5 Add a test named `names the stamp for each shipped leg`. It asserts the seven stamp phrases
  from the spec's "Stamp phrases for the shipped route" scenario, each on its own leg's row. Verify:
  the name is present in the file.
- [x] 2.6 Add the test named verbatim `reflects a rebooked carrier`. In a temp overlay dir, write a
  complete `execute` booking whose `command` is `/overlay:apply-somewhere-else` (with `leg`, `model`
  and `stampPath`). Render under `isolated` with `WAYBILL_BOOKINGS_DIR` set to that dir. Assert that
  the `execute` row contains the overlay command and not `/spec:apply`, and that the page still fits
  `MAX_LINES`. Verify: `grep -q 'reflects a rebooked carrier' tests/help.test.js`.
- [x] 2.7 Add a test named `survives a malformed overlay`. Point the overlay at a dir holding a booking
  with no `command`. Assert that `renderHelp` does not throw, that every ROUTE row shows `—` in both
  columns, that exactly one line starts with `bookings could not be read:`, and that the page fits
  `MAX_LINES`. Verify: the name is present in the file.
- [x] 2.8 Add the test named verbatim `golden under a neutralised environment`. Under `isolated`,
  render from `tempRoot()` and call `assertGolden(GOLDEN, 'help', page)`. Verify:
  `grep -q 'golden under a neutralised environment' tests/help.test.js`.
- [x] 2.9 Add the test named verbatim `covers every subcommand`. Capture `run(['--help'], { out })`
  and take the first token of each non-blank line between `Commands:` and `Options:`. Assert that
  every token except `help` appears as `waybill <token>` in the COMMANDS section. Also assert that the
  token list includes `help`, so the usage row is proven to exist. Verify:
  `grep -q 'covers every subcommand' tests/help.test.js`.
- [x] 2.10 Add the test named verbatim `names all four sections`. The headings `FROM ZERO`, `ROUTE`,
  `WORDS` and `COMMANDS` appear in that order. The FROM ZERO section contains `waybill new`,
  `waybill bay` and `cd `. The page contains neither `waybill start` nor `/waybill:start`. Verify:
  `grep -q 'names all four sections' tests/help.test.js`.
- [x] 2.11 Add the test named verbatim `outside a repository`. Call `run(['help'], { cwd: tempRoot(),
  out, err })` under `isolated`. It returns 0, `out` equals `renderHelp` for the same cwd, and `err`
  is empty. Verify: `grep -q 'outside a repository' tests/help.test.js`.
- [x] 2.12 Add a test named `same page on the trunk and in a bay`. Build a repo with `createRepo()`
  and a bay with `addWorktree(repo, 'feat/x')`. Assert that `renderHelp(repo) === renderHelp(bay)`
  under `isolated`. Verify: the name is present in the file.
- [x] 2.13 Add a test named `rejects arguments`. `run(['help', 'bay'])` returns 2 with `out === ''` and
  `err` matching ``/`help` takes no arguments/``. `run(['help', '--help'])` returns 0 and prints
  `Usage: waybill`. Verify: the name is present in the file.
- [x] 2.14 Add the test named verbatim `--help stays terse`. Keep a literal copy of the current usage's
  four Commands rows and its Options block in the test. Assert that the Commands block from
  `run(['--help'])` equals those four rows plus exactly one row starting `  help `, with that row
  last, and that the Options block is byte-identical. Verify:
  `grep -q -- '--help stays terse' tests/help.test.js`.
- [x] 2.15 In `tests/commands.test.js`, add `'help.md'` to `DECLARED` after `'cleanup.md'`. In the
  `criterion 7` describe, add a test named verbatim `exactly one script` that asserts
  `Object.keys(pkg.scripts ?? {})` deep-equals `['test']`. Verify: `grep -q "'help.md'"
  tests/commands.test.js && grep -q 'exactly one script' tests/commands.test.js`.
- [x] 2.16 Confirm red. `node --test tests/help.test.js` fails because `src/help.js` is missing, and
  `node --test tests/commands.test.js` fails only on the shipped command set, because
  `commands/help.md` is missing. Both failures are the expected ones and there are no others.

## 3. Renderer: `src/help.js` (green)

- [x] 3.1 Create `src/help.js` with `export const MAX_LINES = 45` and
  `export function renderHelp(cwd)`. Resolve bookings with
  `resolveBookings(cwd, { knownLegs: LEGS.map((l) => l.id) })` inside `try/catch`. On error, use an
  empty `Map` and keep the first line of `error.message` for the D3 line. Read no branch, worktree or
  diff. Verify: `node -e "import('./src/help.js').then(m => process.stdout.write(m.renderHelp(process.cwd())))"`
  prints a string.
- [x] 3.2 Build the route rows from `LEGS`, one per leg, as `{ index, id, carrier, stamp }`.
  - `carrier` is `booking?.command ?? '—'`.
  - `stamp` follows the four ordered rules in design D2: the wrapper phrase keyed on the id; then
    `all tasks ticked` when `progress`; then the basename of `stampPath`; then `repo state`.
  - A leg with no booking gets `—` for both columns.
  - Column widths are computed from the rows.

  Verify: `lists every leg`, `names the stamp for each shipped leg` and
  `reflects a rebooked carrier` pass.
- [x] 3.3 Assemble the page in the spec's fixed order: title, `FROM ZERO`, `ROUTE` (plus the D3 line
  only on error), `WORDS`, `COMMANDS`, the two-line `Why:` footer, and the README pointer. End with
  exactly one trailing newline. Use design.md's draft page as the starting text, keep every line at
  most 80 columns, and describe each verb consistently with its `USAGE` row. Verify: `fits one screen`,
  `names all four sections` and `survives a malformed overlay` pass.

## 4. CLI wiring: `src/cli.js`

- [x] 4.1 Import `renderHelp` from `./help.js` and add the `help(cwd, args, io)` handler from design
  D6 after `status`. On any argument it writes ``waybill: `help` takes no arguments\n${USAGE}\n`` to
  stderr and returns 2. It calls no `repoRoot`. Verify: `rejects arguments` and
  `outside a repository` pass.
- [x] 4.2 Add `['help', help]` as the last `COMMANDS` entry, and add exactly one last row to the
  `USAGE` Commands block: `'  help            This page: the route, the words, and the four verbs',`.
  Leave the route-order comment, the existing rows and the Options block untouched. Verify:
  `--help stays terse` and `covers every subcommand` pass, and
  `node bin/waybill help >/dev/null && ! node bin/waybill help extra 2>/dev/null` exits 0.

## 5. Slash command: `commands/help.md`

- [x] 5.1 Create `commands/help.md` by copying the shape of `commands/status.md`.
  - Frontmatter: `description: "Waybill — the route, the words, and the four verbs"` and
    `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)`, with no `model:` and no `effort:`.
  - An HTML comment explaining why no model is declared and why there is no `:-` fallback on
    `CLAUDE_PLUGIN_ROOT`.
  - A `# Waybill: help` heading.
  - The guarded `` ! `` block, running `help` instead of `status`, with the same explanatory `echo`
    fallback.
  - A `## Task` section that says to show the block **verbatim** and stop, with no
    next-leg-inference clause and no `IGNORED BY GIT` clause.

  Verify: `node --test tests/commands.test.js` passes in full, including the no-model/no-effort
  assertion and `exactly one script`.

## 6. Golden and README

- [x] 6.1 Mint the golden: `UPDATE_GOLDEN=1 node --test --test-name-pattern="golden under a neutralised environment" tests/help.test.js`.
  Then read `tests/golden/help.txt` in full before moving on:
  - it matches the spec;
  - it has at most 45 lines and no line over 80 columns;
  - it contains no local paths and no overlay carriers.

  Verify: `node --test tests/help.test.js` passes without `UPDATE_GOLDEN`, and
  `! grep -q 'waybill start' tests/golden/help.txt && ! grep -q '/waybill:start' tests/golden/help.txt`
  exits 0.
- [x] 6.2 In `README.md`, add a row to the command table after the `waybill status` row:
  ``| `waybill help` | `/waybill:help` | The route, the words, and the four verbs on one screen |``.
  Add `/waybill:help` to the installed-commands sentence at `README.md:67`. Touch nothing else.
  Verify: `grep -c '/waybill:help' README.md` reports 2.

## 7. Verification

- [x] 7.1 Run the full suite, `node --test tests/`. It passes, and the count is the task 1.2 baseline
  plus the new tests. Run it through the `test-runner` agent and record the pass/fail summary.
- [x] 7.2 Run every contract success-criterion check from
  `docs/ideation/waybill-help/contract.md` lines 27-38, including each `--test-name-pattern` command
  and its `grep` twin. Each exits 0. List any that do not.
- [x] 7.3 Manual check: `node bin/waybill help` in an 80×45 terminal. The columns align and the page
  fits without scrolling or wrapping. Then read it cold on the trunk and confirm you can get from the
  trunk into a bay without opening the README (contract criterion 13, the judgment check).
- [x] 7.4 Validate the change: `openspec validate add-help-card --strict` passes.
