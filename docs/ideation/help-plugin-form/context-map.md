# Context Map: Help in plugin form, and a bay you land in (help-plugin-form)

**Phase**: 3 (Help page in plugin form). Phase 1 (Archive add-help-card) is done in 3b4069b. Phase 2 (Bay entry) is done in f05da53.
**Gates**: 5/5 ready
**Verdict**: GO

## Gates (Phase 3)

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | `src/help.js` changes in three places: INTRO :30-34 (five steps become four), OUTRO :52-56 (five COMMANDS rows), and `routeLines()` :78-103 (a HEADER row goes into the width calculation, and the doc comment is updated). `tests/golden/help.txt` is regenerated. `tests/help.test.js` changes :205-213 and :215-229 and gains header/alignment tests. A new `openspec/changes/help-plugin-form/specs/help-card/spec.md` holds 3 MODIFIED reqs. `CHANGELOG.md` `## Unreleased` gets one entry. The change dir `help-plugin-form` already exists from phase 2, which resolves the spec's Open Item. |
| Pattern familiarity | ready | Read `routeLines()` at `src/help.js:85-103`. It builds a `rows` map, then `width(key)` with code-point length, then `pad`, then `padStart` for the index. Also read the help-card living spec format, the phase-2 delta files in `openspec/changes/help-plugin-form/specs/*/spec.md` (`## MODIFIED Requirements`), and the CHANGELOG `### <headline>` + paragraph style. |
| Dependency awareness | ready | `renderHelp` is consumed only by `src/cli.js:373` (the `help` verb, which `commands/help.md`'s bang line runs), `tests/help.test.js` and `tests/guide.test.js:168-178` (WORDS terms only, unchanged). `routeLines` is private. Its only other mention is a prose comment at `src/doctor.js:643`, which needs no change. Nothing outside src/tests quotes the help page's old text. README/guide `waybill new`/`waybill bay` hits are the terminal CLI tables and the ride-along, and they stay. |
| Edge case coverage | ready | Cases: bookings resolved (carrier column 18 wide, set by `/ideation:ideation`); bookings unreadable (every carrier is `—`, so CARRIER sets width 7 and the note prints once after the last leg row); a long overlay carrier; the header must not match `^ +N +id ` in `row()` / `lists every leg`; no trailing space on the header (STAMP is the unpadded last column, which the regex `/^ +# +LEG +CARRIER +STAMP$/` requires); the `leg's` apostrophe needs `\'`; the widest target line is exactly 80 columns; the target is 38 lines. The /mar overlay mismatch is under Risks. |
| Test strategy | ready | Inner loop: `node --test tests/help.test.js tests/guide.test.js`. Full: `node --test tests/` (about 74s, allow 120s+). Golden regen: `UPDATE_GOLDEN=1 node --test tests/help.test.js`, then check `git diff --stat tests/golden` shows only help.txt. Target diff (machine env, expect empty): `WAYBILL_BOOKINGS_DIR= node src/cli.js help \| diff - docs/ideation/help-plugin-form/help-target.txt`. Also run the contract checks from the spec's Validation Commands and `openspec validate help-plugin-form`. |

## Key Patterns (Phase 3)

- `src/help.js:85-103` (`routeLines`) is the spec's pattern. Rename the per-leg map to `legs`, then `rows = [HEADER, ...legs]`. `width`, `pad`, the `[index, id, carrier]` destructure and the template at :99-102 stay as they are and run over `rows`. `index.padStart(1)` on `'#'` aligns the header over the single-digit indices.
- `src/help.js:128-133` (`renderHelp`): the order is INTRO, then routeLines, then the optional `bookings could not be read:` line, then OUTRO. Once the header is the first row returned by routeLines, the note still follows the last leg row with no change here.
- `openspec/changes/help-plugin-form/specs/handover/spec.md` is the delta file layout to copy: `## MODIFIED Requirements`, then `### Requirement: <exact name>`. Each MODIFIED req must reproduce the whole requirement and all its scenarios. Source text is `openspec/specs/help-card/spec.md`: "The walkthrough gets an operator from the trunk into a bay" :41-54 (it currently names `waybill new`, `waybill bay`, `cd`), "The route is generated from the leg model and the bookings in force" :56-85, and "The page teaches the current verbs and no others" :119-133.
- `CHANGELOG.md:7-14`: under `## Unreleased`, a `### <sentence headline>` and one prose paragraph. It names no version. Phase 2's entry is at the top.
- `tests/help.test.js`: `isolated()` :32-37 neutralises GIT_CONFIG_GLOBAL/SYSTEM and WAYBILL_BOOKINGS_DIR. `section(page, heading, until)` :72-80. `row(page, id)` :89-96. `overlay()`/`renderWithOverlay()` :104-112. The malformed-overlay recipe is at :186-199 (an execute.md with no `command`). The tests use `assert/strict` and `it('<behaviour phrase>')`.

## Dependencies (Phase 3)

- `src/help.js` `renderHelp` is consumed by:
  - `src/cli.js:20,373`, which `commands/help.md` runs through its bang line. The command file needs no change.
  - `tests/help.test.js`: all of `describe('renderHelp')` and `describe('waybill help')`.
  - `tests/guide.test.js:168-178`: the WORDS terms against `docs/guide/02-glossary.md`.
- `tests/golden/help.txt` is used only by `tests/help.test.js:202` (`assertGolden(GOLDEN, 'help', ...)`).
- `usage()` tokens in `tests/help.test.js:205-213` come from the `--help` Commands rows: new, bay, next, status, doctor, help. Every target COMMANDS row contains `/waybill:<token>`, including `/waybill:bay [<branch>]`.
- `openspec/changes/help-plugin-form/proposal.md` lists only command-surface and handover under "Modified Capabilities" and in its Impact section. Add `help-card` and the help.js/test/golden files to keep the proposal honest.
- Contract checks (contract-data.json :58, :65, :72, :79, :86, :93) run against `node src/cli.js help`. Those at :58/:65/:72 do not neutralise git config, so they run with the operator's overlay. They are carrier-agnostic.

## Conventions

- **Naming**: keyed literals are exported constants (`ENTER_BAY`, `RUN`, `NEXT_LEG` at `src/waybill.js:38-40`). help.js module constants are UPPER_SNAKE (`INTRO`, `OUTRO`, `NONE`, `STAMP_LABELS`), so `HEADER` fits. Tests use `it('<behaviour sentence>')` inside a `describe` block.
- **Imports**: ESM with relative imports. Tests import fixtures from `./fixtures/*.js` and helpers from `./helpers/repo-fixture.js`.
- **Error handling**: bay errors are `BayError`, go to stderr and exit 2. help never throws over bookings (see `renderHelp`'s try/catch). Nothing new here.
- **Types**: JSDoc only (`Route` typedef at `src/waybill.js:43-53`). There is no lint or typecheck script. `package.json` scripts are only `"test": "node --test tests/"`.
- **Testing**: `node:test` with `assert/strict`. Goldens are regenerated with `UPDATE_GOLDEN=1` (`tests/helpers/repo-fixture.js:274-281`). Widths are counted by code point (`[...s].length`) because of the em dashes.
- **Commits**: conventional prefixes (`feat:`, `test:`, `chore:`). One commit per phase on branch `feat/help-plugin-form`. The body cites `Spec: docs/ideation/help-plugin-form/spec-phase-N.md` and the test results.
- **Comments**: long "why" comments in prose, matching the existing style in `commands/*.md` HTML comments and the src docblocks.

## Risks (Phase 3)

- **help-target.txt was captured with this machine's bookings overlay. It does not match the neutralised page.** Target line 16 reads `  6  cleanup  /mar                merged, bay gone`. `/mar` comes from `~/.gitconfig` `waybill.bookingsdir=/Users/tinetti/.config/waybill/bookings`. The golden test renders under `isolated()` (stock bookings), where the row is `  6  cleanup  /waybill:cleanup    merged, bay gone`, the same as current golden line 16. The spec says to copy the target over the golden verbatim and claims the target diff is empty under `GIT_CONFIG_GLOBAL=/dev/null`. Both are wrong for that one line.
  - Copy the target, then restore line 16 to the stock `/waybill:cleanup` row. Both carriers pad to width 18, so alignment and the 80-column budget are unaffected.
  - Better: generate the golden with `UPDATE_GOLDEN=1` after the code change and confirm that it differs from the target only on line 16.
  - This contradicts the decision-log entry "Persist the approved help page as help-target.txt ... fitted to 80 columns": the persisted page is not the stock page. Do not edit help-target.txt to suit the code. If anything, note the discrepancy in the commit/PR.
- **The harness refuses Bash commands that set `GIT_CONFIG_GLOBAL`.** It reports that this "injects git configuration" in a worktree-isolated session. So the spec's playground/check diff command and the contract checks at :79/:86 cannot be run verbatim from this session.
  - Use `WAYBILL_BOOKINGS_DIR= node src/cli.js help | diff - docs/ideation/help-plugin-form/help-target.txt` (machine overlay in force, expect an empty diff). Verified: today's machine-env output already shows `/mar`.
  - The neutralised cases are covered by `tests/help.test.js` (`isolated()` sets the env in-process).
  - The :79 check compares header offsets with the `bay` row, which is stock in both environments. It passes either way.
- **Header must not break `row()` / `lists every leg`.** Those match `^ +N +id ` with a digit, and the header starts with `#`, so it is safe. The malformed-overlay regex `/ {2}— {2,}—$/` (:194) still matches with CARRIER setting width 7.
- **Rewrite the `names all four sections` test (:215-229).** Assert that FROM ZERO contains `/waybill:new`, `/waybill:bay`, `/waybill:next` and does not contain `cd `. Keep the start assertions.
- **Rewrite the `covers every subcommand` test (:205-213).** Assert `` `/waybill:${token}` ``.
- **Add the header and alignment tests in both states.** Resolved: `isolated(() => renderHelp(tempRoot()))`. Unreadable: `renderWithOverlay(dir)` with the malformed execute.md. In each, the line after `ROUTE` matches the header regex, and `indexOf('LEG')`/`'CARRIER'`/`'STAMP'` equal the offsets of the first leg row's id, carrier and stamp.
- **The help-card delta replaces the `cd` walkthrough requirement.** Its scenario "The walkthrough names its three steps" now names `/waybill:new`, `/waybill:bay`, `/waybill:next` and no `cd`. The "A cold read" scenario should say they land in the bay via /waybill:bay. Run `openspec validate help-plugin-form` (CLI at /opt/homebrew/bin/openspec).
- **Changing the requirement name is a RENAME, not a MODIFIED.** "...gets an operator from the trunk into a bay" stays accurate, so keep the name exactly.
- **INTRO step 4's label ("Paste what it prints:") is wider than the others in the target.** Copy the strings from the target. Do not try to realign them.
- **Golden regeneration scope.** Run `UPDATE_GOLDEN=1` on `tests/help.test.js` only, then check that `git diff --stat tests/golden` shows only help.txt.
- **Test runtime.** About 74s for the full suite. Allow at least 120s.
- **Decision log vs reality.** Apart from the /mar point above, no contradictions were found.
  - The page is still generated by `src/help.js`, and `commands/help.md` still runs the CLI verb.
  - `help` rejects arguments (help.test.js :247-256).
  - Phase 1 did archive add-help-card, and `openspec/specs/help-card/spec.md` exists.
  - Phase 2 landed bay entry, so "and move in" is now true.

---

## Phase 2 (Bay entry), kept for reference: 5/5 ready, GO, done in f05da53

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | Files and changes: `src/cli.js:648-656` adds `enter` to the bay markdown route and rewrites the comment at 650-651. `src/waybill.js:30-37`, `:49` and `:383-384` get doc comments. `commands/bay.md` changes at frontmatter :4, comment :11-14, Task :46-58 and step 3 :104-106. Also `tests/cli.test.js:907-970`, `tests/golden/bay-cut.md`, `tests/commands.test.js:471-477` plus new asserts, `README.md:186-198`, `CHANGELOG.md` and two OpenSpec deltas. |
| Pattern familiarity | ready | Three patterns read. `issueWaybill` at `src/cli.js:157-179` computes `enter`. `commands/next.md:71-97` handles `ENTER BAY:`. `keyedLines` at `src/waybill.js:364-365` emits it. |
| Dependency awareness | ready | `bay()` markdown output is read by `commands/bay.md`, `tests/cli.test.js:907-970`, `tests/commands.test.js:448-455` and `tests/golden/bay-cut.md`. |
| Edge case coverage | ready | Five cases: cut, found, inside, next leg is cleanup, and `state.leg === null`. Also no RUN/NEXT LEG, `--bay-dir`, `--list --markdown`, a denied `EnterWorktree` and a non-zero exit. |
| Test strategy | ready | Inner loop: `node --test tests/cli.test.js tests/commands.test.js tests/waybill.test.js tests/bang-lines.test.js`. Full: `node --test tests/`. Regen goldens with `UPDATE_GOLDEN=1 node --test tests/cli.test.js`. |

Phase 2 key patterns and dependencies:
- `src/cli.js:157-179` (`issueWaybill`) computes `enter = Boolean(target.named) && !alreadyThere && token !== 'cleanup'`. bay guards on `state.leg !== 'cleanup'`.
- `src/cli.js:640-660` (`bay`): the markdown block writes the heading plus `\n\n`, then `renderWaybillMarkdown(state, inspection, { bay, enter })`.
- `src/waybill.js:364-365` (`keyedLines`) emits `ENTER BAY: <bay>` when `route.enter && route.bay`.
- `commands/next.md:71-85` acts on the keyed exact strings and calls `EnterWorktree` with the path as printed. `:125` is next's "selection never switches" rule.
- `tests/golden/bay-cut.md` is used only by `tests/cli.test.js:918`. `bay.md`, `bay.txt` and `no-docket.*` are other goldens. Do not touch them.
- Living specs modified by phase 2 (in `openspec/changes/help-plugin-form/specs/`):
  - command-surface: "Verbatim rendering, with keyed exceptions" and "`next` and `bay` offer a paste-ready markdown form".
  - handover: "Markdown document shape".
- Prose mentioning `/clear` that stays as it is: `bookings/waybill-bay.md:11`, `docs/guide/01-ride-along.md:83`, `README.md:31`, `README.md:127`.

Phase 2 risks (historical):
- The cleanup case needs `forgePath('open')`. The `cli()` helper at `tests/cli.test.js:75` hardcodes `forgePath()`.
- The change dir did not exist yet. It now exists as `openspec/changes/help-plugin-form/`. A change dir in the branch diff moves docket inference (`src/progress.js:100-131`).
- Living-spec reversal of the `cd` fallback for bay, and of the "never switches" scope.
- Inside-case `startsWith` assertions must not gain ENTER BAY.
- Keep `Skill`/`SlashCommand` off bay.md's allowed-tools.

---

## Phase 1 (Archive add-help-card), kept for reference: 5/5 ready, GO, done in 3b4069b

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | Only `openspec/` paths changed. New: `openspec/specs/help-card/spec.md` and `openspec/changes/archive/<date>-add-help-card/`. Modified: `openspec/specs/command-surface/spec.md`. Deleted: `openspec/changes/add-help-card/`. |
| Pattern familiarity | ready | `openspec/changes/archive/2026-09-10-paste-ready-waybills/` and `openspec/specs/fleet/spec.md` show the layout after an archive. |
| Dependency awareness | ready | No src or tests read `openspec/changes/add-help-card`. `src/progress.js:100-131` skips `archive`. |
| Edge case coverage | ready | The carrier might be unavailable; Purpose placeholder; strict-validation warnings; line shifts; a leg change. |
| Test strategy | ready | `node --test tests/` (624 pass, about 74s) plus the manual `test -f` / `test ! -d` checks and `node src/cli.js next`. |

Phase 1 key facts:
- Archive dirs are named `YYYY-MM-DD-<change-id>`; the archive now holds `2026-10-07-add-help-card/`.
- The living spec format is `# <cap> Specification`, then `## Purpose`, then `## Requirements`, with `### Requirement:` blocks and `#### Scenario:` under them.
- The `openspec archive <id> -y` CLI is the carrier behind `/spec:archive`.
- `src/progress.js:9` (`ARCHIVE = 'archive'`) and `:100-131`: change-id discovery is filtered to the branch diff and excludes archive. `src/inference.js:50` treats an archived change as "no active change".
- Specs for later phases cite requirements by name, not by line number.
