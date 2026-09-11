# Context Map: waybill-guide

**Phase**: 1
**Gates**: 5/5 ready
**Verdict**: GO

Worktree root (all paths below are relative to it): `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-waybill-guide`

## Gates

| Gate                 | Status | Evidence |
| -------------------- | ------ | -------- |
| Scope clarity        | ready  | The spec names 5 new files (`tests/guide.test.js`, `docs/guide/{README,01-ride-along,02-glossary,03-reference}.md`) and 7 modified files, each with a line-level change. I checked every cited line against the code: `src/bookings.js:22-23`, `src/help.js:55`, `tests/golden/help.txt:38`, `openspec/changes/add-help-card/specs/help-card/spec.md:20,29,34`, `design.md:222`. `docs/guide/` does not exist yet. |
| Pattern familiarity  | ready  | I read `tests/help.test.js` in full. The helpers to copy are `isolated()` :32-37, `cli()` :44-59, `section()` :72-80 and `usage()` :119-126. I also read `tests/helpers/repo-fixture.js` (`withEnv` :185, `tempRoot` :53, `cleanupAll` :270) and the `tests/index.js` registration pattern. |
| Dependency awareness | ready  | The old pointer text appears in exactly 3 places: `src/help.js:55`, `tests/golden/help.txt:38` and `openspec/changes/add-help-card/design.md:222`. `REQUIRED` and `OPTIONAL` are not exported today, so they have no consumers yet. No existing test scans `docs/`. |
| Edge case coverage   | ready  | Concrete edge cases are listed in Risks: the `/g` flag on the heading regex, the U+00B7 middle dot, no trailing whitespace in goldens, `###` headings in the glossary, code spans in the reference, the `-w` deleted-verb grep, and banned words copied from the README. |
| Test strategy        | ready  | Inner loop: `node --test tests/guide.test.js`. Full suite: `node --test tests/`. Help golden: `UPDATE_GOLDEN=1 node --test tests/help.test.js && node --test tests/help.test.js`. Each contract criterion (contract.md:30-41) also has a grep twin to run. Only Node 22.23.2 is installed (see Risks). |

## Key Patterns

- `tests/help.test.js` sets the pattern for the new test file.
  - **Imports:** node built-ins first (`node:test`, `node:assert/strict`, `node:path`, `node:url`), then `../src/*.js`, then `./helpers/repo-fixture.js`. The file registers `after(cleanupAll)` at the top.
  - **`GOLDEN`:** computed as `path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden')`.
  - **`isolated(fn)`:** wraps `withEnv({GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_SYSTEM:'/dev/null', WAYBILL_BOOKINGS_DIR: undefined}, fn)`.
  - **`section(page, heading, until)`:** finds `\n${heading}\n` and asserts loudly if a heading is missing.
  - **`usage()`:** returns `{commands, options}`, where `options` is the text from `Options:` to the end.
  - **JSDoc:** helpers carry JSDoc type annotations (`@param`, `@returns`). The suite uses one `describe` with plain `it`s.
- `tests/helpers/repo-fixture.js` exports `withEnv`, `tempRoot`, `cleanupAll`, `assertGolden` and more. Importing it has a side effect: it sets `GIT_CONFIG_GLOBAL`/`SYSTEM` to `/dev/null` and deletes `WAYBILL_BAY_DIR` (:14-16).
- `tests/index.js` holds one `import './x.test.js';` per suite, in alphabetical order. The new line goes between `./frontmatter.test.js` and `./help.test.js`.
- `src/bookings.js` style: `export const BUILTIN_BOOKINGS` at :20 shows the export form. `REQUIRED = ['leg','command','model']` is at :22 and `OPTIONAL = ['effort','handover','argument','stampPath','stampCmd']` at :23. `loadBookings(dir, options)` is at :46.
- `src/help.js`: the `OUTRO` array covers :34-56. WORDS runs :36-44 with 8 terms: trunk, docket, bay, leg, stamp, booking, carrier, waybill. The pointer is the last array element at :55. `renderHelp(cwd)` is at :110, and `MAX_LINES = 45`.
- `src/legs.js:26-34`: `LEGS` ids in order are ideate, bay, refine, contract, specs, execute, cleanup.
- Goldens: `tests/golden/<id>.txt` exists for all 7 legs. Line counts: ideate 15, bay 17, refine 13, contract 12, specs 13, execute 13, cleanup 30.
  - **First lines:** `main · no docket open` (ideate), then `feat/thing · leg N of 7 (<id>)` for the others.
  - **Contents:** no golden contains a backtick fence, and none has trailing whitespace. They do contain the characters `·`, `✓`, `▶` and `—`.
  - **`/clear` (transfer handover):** appears in ideate:4, refine:6, specs:6 and execute:6. bay, contract and cleanup use `through`, so they have no `/clear`.
- Built-in bookings (`bookings/*.md`) and their command namespaces: `/ideation:brainstorm` and `/ideation:ideation` give `ideation`; `/waybill:bay` and `/waybill:cleanup` give `waybill`; `/spec:propose` and `/spec:apply` give `spec`. `bookings/ideation-refine.md` is the example booking, 12 lines.
- `commands/`:
  - **Top level:** bay, cleanup, help, new, next, status. These must appear as `/waybill:<n>`.
  - **`commands/spec/`:** apply, archive, explore, propose. These must appear as `spec:<n>`.
  - **Argument hints:** `argument-hint` frontmatter exists only in bay.md, cleanup.md and next.md.
- The `--help` Options block has exactly 5 flags: `--json`, `--markdown`, `--list`, `--bay-dir`, `--help` (help.test.js:265-275).
- README sources for the reference:
  - The `/spec:*` symlink caveat is at :83-88.
  - `### Where bays live` is at :208-228. This is the precedence table for `--bay-dir` > `WAYBILL_BAY_DIR` > `waybill.baydir`.
  - `## Prerequisites` heading is at :230, with its table at :236-241.
  - `### An overlay, rather than an edit` is at :277-320 (`WAYBILL_BOOKINGS_DIR` and `waybill.bookingsdir`).
  - The first `##` heading is `## The route` at :39, so the README link goes before it, after the pitch at :1-38.
- `docs/superpowers/specs/2026-09-04-waybill-rename-design.md`: the metaphor and definitions start around :35. The banned vocabulary registers are at :107-113 (container, manifest, registry, pipeline, artifact).

## Dependencies

- `src/help.js:55` (the pointer line) is consumed by:
  - `tests/golden/help.txt:38`, which must be re-blessed.
  - `tests/help.test.js`: `fits one screen` (80 columns and 45 lines; the new line is 67 columns) and `golden under a neutralised environment`.
  - `openspec/changes/add-help-card/design.md:222`, which is a doc mirror of the rendered page.
  - `renderHelp` is called from `src/cli.js:358` (`waybill help`). `commands/help.md` does not mention the README.
- `src/bookings.js:22-23` (`REQUIRED`/`OPTIONAL`) is used internally only (:63, :89). Adding `export` changes nothing for the current importers: `src/inference.js`, `src/cli.js`, `src/help.js`, `tests/bookings.test.js`, `tests/commands.test.js`, `tests/inference.test.js`, `tests/booking-swap.test.js`, `tests/bookings-overlay.test.js`, `tests/inspection-gitignore.test.js`.
- `tests/index.js` is the entry point for `node --test tests/`. On Node 26 an unregistered suite silently never runs.
- `openspec/changes/add-help-card/specs/help-card/spec.md` is read by no test or source file. It is only checked by contract.md:39's greps. Those greps forbid the strings `One line pointing at the README` and `the README pointer`, and require `docs/guide/`.
- `README.md` has no consumers. The contract's grep `\]\(\.?/?docs/guide/?[^)]*\)` requires a markdown link.
- New `docs/guide/*`: nothing depends on it. No existing test scans `docs/`. `tests/commands.test.js:540-553` asserts zero dependencies and `scripts` exactly `['test']`, so the guide must not add a generator script.

## Conventions

- **Naming**: tests live in `tests/<name>.test.js`. `it` names are literal lower-case phrases. The seven names must match contract.md:30-36 exactly: `rides every leg in order`, `samples match their goldens`, `defines every help-card word`, `every term is translated`, `references the whole surface`, `lists every carrier's prerequisites`, `links resolve`.
- **Imports**: ESM (`"type": "module"`), relative `../src/x.js` with explicit `.js`, and `node:` prefixes for built-ins. There are no barrel files.
- **Error handling in tests**: `assert` from `node:assert/strict` with descriptive messages, e.g. `` `no \`${heading}\` heading` ``. Helpers assert rather than return null.
- **Types**: JSDoc `@param`/`@returns`/`@type` on every helper. There is no TypeScript, lint, typecheck or build step.
- **Testing**: `node:test` (`describe`/`it`/`after`), zero dependencies, Node >=22. Goldens are compared byte-for-byte and re-blessed only with `UPDATE_GOLDEN=1`. There is no CI, so Node 22 and Node 26 are run by hand.
- **Doc voice**: the README uses its own voice, not the Dispatcher's. Say "stamp" and never "tracking". Stay in the freight-paperwork register.
- **Workflow (AGENTS.md)**: TDD, working in this worktree on branch `feat/waybill-guide`. Release PRs own versioning, so don't bump `package.json` (0.7.0).

## Risks

- **Heading regex needs the `g` flag.** The spec writes `/^## Leg (\d) · ([a-z]+)\b/m`. Collecting every heading via `matchAll` needs `/gm`, and without `g` it throws (matchAll) or returns only the first match (exec). The `·` is U+00B7 and must be the same character in the regex and the headings. Goldens use the same dot.
- **Byte-exact goldens.** Paste goldens by script, e.g. `cat tests/golden/<id>.txt`. Goldens have no trailing whitespace, but an editor could still normalise `✓`/`▶`/`—`. A fence body must equal the file content including its final `\n`. Don't trim `cleanup.txt` (30 lines).
- **First-line scan of non-waybill fences.** No `sh` or `text` fence may contain `main · no docket open` or any `feat/thing · leg N of 7 (<id>)` line. Show prompts and commands only in `sh` fences.
- **Fence parser.** Opens on `/^```(\S*)$/` and closes on `/^```$/`, both at column 0. Consider asserting that no fence is left unclosed at EOF, so a missing close fence can't silently swallow the rest of the file. No golden contains a fence today.
- **Glossary headings.** Every `### ` heading in `02-glossary.md` needs a `**Literally:**` line before the next heading, so don't use `###` for anything else there. Terms must be exact lowercase, including `### freight forwarder` with a space. The minimum is 15 headings (8 WORDS plus 7 extra). `handover` must name both `transfer` (`/clear` first) and `through` (no break).
- **Reference keys need code spans.** Booking keys must appear as `` `key` `` code spans. The copied example booking in a fence shows `stampPath:` etc. without backticks, so the table rows must carry the spans. The 4 env/config literals and the 5 flags only need to appear as substrings. `spec:<n>` must appear for all 4 spec commands, including `explore` and `archive`, which no booking uses.
- **Prerequisites slice.** It runs from `## Prerequisites` to the next `\n## `. Put all namespaces in that slice: `ideation`, `spec`, `waybill`, plus `openspec`. `###` subheadings inside it are safe.
- **Deleted-verb grep.** `grep -rqwE 'waybill start|wyb start|/waybill:start' docs/guide/` is a whole-word match. Prose like "the waybill start…" would trip it; "the waybill starts" would not. Avoid putting a bare "start" right after "waybill" or "wyb".
- **Banned vocabulary in copied README text.** README.md:224-227 uses "container directory", and "container" is a banned word (rename design :107-113). Don't copy that wording into `03-reference.md`. README.md:34 also says "tracked", so the guide must say "stamp" instead.
- **Links.** Test 7 checks every `](target)` with no scheme and no leading `#`, strips the fragment, and resolves the target against the file's directory. `../../README.md#where-bays-live` resolves to the repo README. Make sure no `](` sequence lands inside a pasted golden: none contain one today.
- **Commands glob.** Prefer a `fs.readdirSync` filter on `commands/` and `commands/spec/` over `fs.globSync`. The latter is newer and possibly experimental on Node 22, so this keeps parity with `tests/commands.test.js:47-60`. That is an inference; the spec only says "glob".
- **Node 26 unavailable.** Only Node 22.23.2 is installed (`/opt/homebrew/bin/node`, no nvm). The contract's G7 asks for Node 26 to be run by hand, so that part of the manual check can't be done locally. Record it as a caveat in the PR.
- **Test-first failure mode.** Before `src/bookings.js` exports the arrays, importing `REQUIRED`/`OPTIONAL` fails the whole file at link time (SyntaxError: no export named), not seven separate test failures. The spec expects "ENOENT or missing exports", so that is acceptable, but the pasted failure summary will show a module error, not 7 red `it`s.
- **Things to leave alone.** Don't touch `openspec/changes/add-help-card/proposal.md:16` or `tasks.md:95`. `spec.md:5` (the README re-read) stays as it is.
- **Decision log vs. reality.** No contradictions found. `docs/guide/` does not exist, the README has no guide link, `REQUIRED`/`OPTIONAL` are unexported, there is no generator script, and the help pointer still names README.md. All match the logged premises.
