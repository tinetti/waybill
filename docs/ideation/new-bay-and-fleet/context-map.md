# Context Map: new-bay-and-fleet

**Phase**: 2 — Rendering: fleet, selection, and the shared `cd` block (tasks.md §3)
**Gates**: 5/5 ready
**Verdict**: GO

> Repository root for every path below: `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-new-bay-and-fleet`. Paths are repo-relative from here on so this map stays portable.

> This map was started in Phase 1 and is extended, not replaced. Phase 1's sections are retained verbatim below; Phase 2's begin at **Gates (Phase 2)**.

---

# Phase 1 (retained) — The rename: `start` becomes `bay` (tasks.md §2)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `3fe83a5` ("feat: rename the start verb to bay, so the command names the leg it cuts")

> No prior context map existed for this project when Phase 1 ran (`docs/ideation/new-bay-and-fleet/` held only `contract.md`, `contract.html`, `contract-data.json`). `docs/ideation/pitwall/context-map.md` is a different project and was not used as a baseline.

**Phase 1 scope note**: tasks.md §1 (Enumeration) was already implemented and committed as `24d7ed0`, ahead of the OpenSpec change being written. Phase 1 in the contract's Execution Plan (`docs/ideation/new-bay-and-fleet/contract.md:129`) is **The rename**, which is tasks.md §2 (2.1–2.6).

## Gates (Phase 1)

| Gate                 | Status | Evidence                                                                                                                                                                                                                        |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope clarity        | ready  | Every file the rename touches is named with line numbers and read: `commands/start.md`, `src/cli.js:10,17,22,124,136,155,163,173,204`, `src/bay.js:188,209`, `bookings/waybill-bay.md:3`, `tests/commands.test.js:39`, `tests/cli.test.js:198-300`, `tests/inference.test.js:146`, `tests/golden/bay.txt:7`, `commands/status.md:19`, `README.md:67,98,122,129,137,145,146`. |
| Pattern familiarity  | ready  | Read both sibling command files (`commands/start.md`, `commands/status.md`) — identical frontmatter/`!` block/verbatim-Task shape — plus the golden harness `assertGolden` (`tests/waybill.test.js:33-48`) and the CLI harness `cli()` (`tests/cli.test.js:105-...`).                                       |
| Dependency awareness | ready  | `rg` mapped every consumer of the renamed symbols: `startBay` was imported at `src/cli.js:10` and `tests/bay.test.js:7` (≈25 call sites); the `'start'` dispatch key had exactly one consumer (`src/cli.js:233` via `COMMANDS`); `/waybill:start` appeared in exactly two shipped files plus one golden. |
| Edge case coverage   | ready  | `DECLARED` sort-order, `git mv` vs delete/create, `UPDATE_GOLDEN=1` rewriting all goldens, usage-line padding vs the acceptance regex, the missing "`start` is unknown" case, the `src/inference.js` zero-diff trap.                                        |
| Test strategy        | ready  | Scoped commands measured in tasks.md §0 and confirmed. Baseline at the time: **317 pass / 372 TAP ok**. |

## Phase 1 outcome (verified today)

- `commands/bay.md` exists; `commands/start.md` is gone.
- `src/cli.js` dispatches `['bay', bay]` (`:203`); `USAGE` line is `'  bay <branch>    Create the branch and its bay, then hand off the next leg'` (`:16`).
- `src/bay.js`'s export was renamed to **`openBay`** (imported at `src/cli.js:10`, called at `:173`).
- Boundary checks all green against merge-base `08d0c6f`: `src/inference.js` zero-diff, the six untouched modules zero-diff, the eight in-a-bay goldens byte-unchanged, `tests/golden/no-docket.txt` byte-unchanged, and no `is not inside a git repository` string in the `src/cli.js` diff.
- **New baseline**: `npm test` → **318 pass / 0 fail / 373 TAP ok**, 36.1s. Criterion 0 demands ≥372 ok lines, so there is exactly one line of headroom — Phase 2 must add, never remove, assertions.

---

# Phase 2 — Rendering (tasks.md §3.1–3.3)

Contract phase entry: `contract-data.json → execution.phases[1]`, title "Rendering: fleet, selection, and the shared cd block", risk **low**, files `src/waybill.js`, `src/cli.js`, `tests/golden/{fleet,select,trunk-one-docket,fleet-empty}.txt`, `tests/waybill.test.js`, `tests/cli.test.js`.

## Gates (Phase 2)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                   |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Six files, each with a concrete change: `src/waybill.js` (add `renderFleet`/`renderSelect` beside `renderWaybill:184`/`renderPosition:203`; widen `withFindings:151`), `src/cli.js:187-194` (extract the `cd` block), `tests/waybill.test.js` (wire four goldens through `assertGolden:41`), and the four new `tests/golden/*.txt`. `tests/cli.test.js:236` already carries §3.3's verification and may need no edit. |
| Pattern familiarity  | ready  | Read `src/waybill.js` end-to-end (INDENT, `header`, `strip`, section-join-by-`\n\n`, `withFindings`), `tests/waybill.test.js` in full (`assertGolden`, the synthetic `state()` builder, the golden case table at `:80-94`), `src/fleet.js` (the `Docket` typedef), `src/repo.js:71` `listWorktrees` / `:174` `defaultBranch`, and the shipped goldens `no-docket.txt`/`status.txt` for the exact block shape. |
| Dependency awareness | ready  | `withFindings` is module-private with exactly two callers (`src/waybill.js:188`, `:205`). `renderWaybill` is consumed by `src/cli.js:90,197`, `tests/waybill.test.js`, `tests/booking-swap.test.js:87,91`. `renderPosition` by `src/cli.js:119` + `tests/waybill.test.js`. `fleet()` by `tests/fleet.test.js` only. The inline `cd` block is asserted at `tests/cli.test.js:208,224,236,259,267`. |
| Edge case coverage   | ready  | Concrete list below (twelve items), including the byte-stability problem in `trunk-one-docket.txt`, the plural/singular one-character gap between `no docket open` and `no dockets open`, `header()`'s missing progress suffix, and column padding in the fleet/select blocks. |
| Test strategy        | ready  | Inner loop measured on this tree today: `node --test tests/waybill.test.js` **2.7s**, `node --test tests/cli.test.js` **5.5s**, boundary run `npm test` **36.1s / 318 pass / 373 ok**. The phase's acceptance gate is criterion 12, run verbatim: `for g in fleet select trunk-one-docket fleet-empty; do test -s "tests/golden/$g.txt" || exit 1; grep -q "$g" tests/waybill.test.js || exit 1; done` — confirmed **failing** today on the missing `fleet.txt`. |

## Key Patterns (Phase 2)

- `src/waybill.js:151` — `withFindings(sections, state, inspection)`. The single seam every surface shares. It appends `IGNORED BY GIT:` then `WARNINGS:` and returns `sections.join('\n\n') + '\n'`. It reads exactly two things off its arguments: `inspection.ignored`, and `[...state.warnings, ...(inspection.warnings ?? [])]`. Widening it to take a plain warnings list (per tasks.md §3.2) touches only lines 152, 165–168 and the two call sites.
- `src/waybill.js:50-57` — `header(state)` returns `` `${branch} · ${position}` `` where position is `no docket open` / `all N legs complete` / `leg ${index} of ${LEGS.length} (${leg})`. **It carries no progress suffix** — progress lives only in `strip()` at `:76-79`. The fleet/select lines in design §4 need `leg 6 of 7 (execute, 4 of 9 tasks)`, a *third* format. See Risks.
- `src/waybill.js:40` — `const INDENT = '  '` (two spaces). Every sub-line under an all-caps heading uses it, and `src/cli.js:35` declares an identical constant for the CLI's own lines. Golden files make every space load-bearing (`waybillText:95-99` exists solely to avoid trailing whitespace on blank lines).
- `tests/waybill.test.js:41-48` — `assertGolden(name, actual)` resolves `tests/golden/<name>.txt` by name; rewrites only under `UPDATE_GOLDEN=1`.
- `tests/waybill.test.js:56-77` — `state(overrides)`, the synthetic `Inference` builder. Branch `feat/thing`, leg `specs`, index 5, model `placeholder-model`. **This is the route to a byte-stable golden with no temp paths in it.**
- `tests/waybill.test.js:27` — `resolve(dir)` wraps `resolveLeg` in `withPath(pathWithout('openspec'), …)` so the real openspec CLI can never influence a golden. Any new golden rendered from a real fixture must go through it.
- `src/fleet.js:5-9` — `Docket = {branch, path, state}` where `state` is the whole `Inference`. `fleet(cwd, bookings)` returns them in git's order (bay directory name), which §3.2's comment calls out as exactly what makes a golden possible.
- `src/cli.js:187-194` — the block §3.3 extracts. Today: `isInside(result.path, cwd) ? ['already inside the … bay at … — nothing to do'] : ['bay created at …' | 'bay already exists at …', '  cd …']`. Note the ternary bundles the *heading* line with the `cd` line; §3.3 scopes the helper to the `cd` line and its already-inside suppression **only**.
- `src/bay.js:71-80` — `isInside(target, cwd)`, realpath-based, returns true for `cwd === target` too. Reused by the helper unchanged.
- `tests/golden/no-docket.txt:1` — `main · no docket open`. The shape `fleet-empty.txt` must deliberately differ from.

## Dependencies (Phase 2)

- `src/waybill.js:151` (`withFindings`) — consumed by → `src/waybill.js:188` (`renderWaybill`), `src/waybill.js:205` (`renderPosition`). No external consumers; the function is not exported.
- `src/waybill.js:184` (`renderWaybill`) — consumed by → `src/cli.js:90` (`next`), `src/cli.js:197` (`bay`), `tests/waybill.test.js` (throughout), **`tests/booking-swap.test.js:87,91`**. That fourth consumer is easy to miss and is not in any spec's Files table; a signature change to `renderWaybill` would red it.
- `src/waybill.js:203` (`renderPosition`) — consumed by → `src/cli.js:119` (`status`), `tests/waybill.test.js:97,277-320`.
- `src/fleet.js:31` (`fleet`) — consumed by → `tests/fleet.test.js:6` only. Nothing in `src/` imports it yet; Phase 2 is where `src/waybill.js` (or `src/cli.js` in Phase 3) becomes its first production consumer.
- `src/repo.js:71` (`listWorktrees`) — consumed by → `src/fleet.js:1`, `src/bay.js:217`, `tests/repo.test.js`. Read it, do not rebuild it (tasks.md §3.2).
- `src/repo.js:174` (`defaultBranch`) — consumed by → `src/fleet.js:32`, `src/bay.js`, `src/inference.js`, `tests/repo.test.js`.
- `src/cli.js:187-194` (the inline `cd` block) — consumed by → `tests/cli.test.js:208` (`^ {2}cd <target>$`), `:224` (`^ {2}cd /m`), **`:236`** (asserts the line is *absent* inside the bay) and `:237` (`already inside`), `:259`, `:267`. **Not** consumed by `tests/golden/bay.txt` — that is a `renderWaybill` golden (`tests/waybill.test.js:82`) and cannot observe the CLI's success block at all.
- `tests/index.js` — imports all twelve suites explicitly. Phase 2 adds no new suite file, so no edit is needed here.
- `tests/golden/` — nothing asserts the directory's contents or file count (`grep` over `tests/*.test.js` finds only `assertGolden` uses). Adding four files is safe; contrast with `tests/fixtures/`, below.

## Conventions (unchanged from Phase 1, re-verified)

- **Naming**: kebab-case files. Goldens are `tests/golden/<name>.txt` resolved by name. Renderers are `render<Thing>` exported from `src/waybill.js`. Headings inside a block are ALL CAPS with a trailing colon (`NEXT:`, `IGNORED BY GIT:`, `WARNINGS:`, and now `IN BAY:`, `SELECT A DOCKET:`, `DOCKETS:`).
- **Imports**: ESM, relative paths with explicit `.js`, `node:` prefix on builtins, builtins first then locals with a blank line between. Zero dependencies, no build step (asserted at `tests/commands.test.js:269-278`).
- **Error handling**: three tiers documented at `src/bay.js:14-23` — queries return `null`, loaders throw `file:line: message`, `BayError` carries operator-facing failures. Only `src/cli.js` writes to a stream or picks an exit code. Renderers are pure: no filesystem, no subprocess, no clock (`src/waybill.js:176-178` states this explicitly, and it is why `bay` can reuse `renderWaybill`).
- **Types**: JSDoc only. Every exported function carries `@param`/`@returns`, and the prose explains *why* at length, not *what*. New renderers must match that density — the surrounding file sets a high bar.
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, `after(cleanupAll)`. Fixtures build real git repositories via `tests/helpers/repo-fixture.js` (`createRepo`, `addWorktree(repoDir, branch)` at `:120`, `defaultBayPath` at `:103`). Golden regeneration is `UPDATE_GOLDEN=1`.
- **No linter or formatter** is configured; `package.json` declares only `test`.

## Edge Cases for Phase 2

- **`trunk-one-docket.txt` contains an absolute path and therefore cannot be rendered from a real fixture.** Design §4 shows `IN BAY:` / `  cd /Users/…/waybill-feat-session-handover`. Every real fixture lives under a `mkdtemp` root, so a golden built from one would differ on every run. Render it from the synthetic `state()` builder (`tests/waybill.test.js:56`) plus a fixed literal path, exactly as the non-golden `describe` blocks already do.
- **`fleet-empty.txt`'s exact text is not written down in design §4.** §4 gives the *`next`* empty case (`waybill: no dockets open — begin one with \`waybill new\``), which is a different surface and belongs to Phase 3. The `status` empty case appears only in design §1's route table as `main · no dockets open`. tasks.md §3.1 says "matching the blocks in the approved design §4" — for this one golden, §4 has no block. Derive from §1's route table and the spec's "SHALL say so in the plural" (`openspec/changes/new-bay-and-fleet/specs/command-surface/spec.md`, "Nothing in flight" scenario).
- **`no docket open` vs `no dockets open` are one character apart and mean opposite things.** `tests/golden/no-docket.txt:1` is the singular, produced by `header()` when `docketOpen` is false. `fleet-empty.txt` is the plural, produced by the fleet renderer on the trunk. Criterion 11 pins `no-docket.txt` byte-unchanged, so a renderer that accidentally routes the trunk-with-no-bays case through `header()` will still look right and quietly break the distinction.
- **`header()` has no progress suffix, but the fleet and select lines need one inline.** Design §4 shows `fix/stamp-scoping     · leg 6 of 7 (execute, 4 of 9 tasks)` — leg and progress inside one parenthesis. `strip()` renders the same fact as `  ▶ execute (4 of 9 tasks)`. Widening `header()` to append progress would change the first line of `renderWaybill` and break criteria 10 and 11 (eight goldens plus `no-docket.txt`, all pinned byte-unchanged). The fleet line needs its own formatter.
- **Column alignment in the fleet and select blocks is padding to the longest branch name.** Design §4 aligns the `·` across rows. With one docket there is nothing to pad against; with a branch longer than the others the whole column shifts. Both `fleet.txt` and `select.txt` should carry branches of differing widths, or the padding rule is untested.
- **The `SELECT A DOCKET:` section contains an internal blank line.** Design §4 puts `  waybill next <branch>` after a blank line, inside the same section. `withFindings` joins sections with `\n\n`, so this must be one section string containing a literal `\n\n`, not two sections — otherwise the `WARNINGS:` block would sort in between.
- **`withFindings`'s widening must leave both existing callers byte-identical.** Its only use of `state` is `state.warnings` at `:165`. Changing the parameter to a warnings array means `renderWaybill:188` and `renderPosition:205` pass `state.warnings` at the call site. Verified by criteria 10 and 11 plus the eight golden cases in `tests/waybill.test.js:80-94`.
- **`grep -q "$g" tests/waybill.test.js` in criterion 12 is a substring match.** `fleet` matches inside `fleet-empty`, so wiring only `fleet-empty.txt` satisfies the `fleet` grep. The check is weak; wire all four genuinely and confirm with a real run of `node --test tests/waybill.test.js`.
- **Do not add a file under `tests/fixtures/`.** `tests/inference.test.js:70-73` asserts `fs.readdirSync(FIXTURES).length === LEGS.length + 1` (= 8). Goldens live in `tests/golden/`, which nothing counts — but a `tests/fixtures/fleet.js` helper would red an unrelated suite. Multi-docket repositories are built through `tests/helpers/repo-fixture.js` `addWorktree` (`:120`), the route `tests/fleet.test.js` already takes.
- **Model names are banned in `src/`, not in `tests/golden/`.** `tests/waybill.test.js:359-377` scans `filesUnder(SRC)` for `/(opus|sonnet|haiku)/i`. `tests/golden/no-docket.txt` already contains `└ opus · high effort`, so a golden showing a real booking's model is fine — but a renderer with a default model literal is not.
- **`UPDATE_GOLDEN=1` rewrites every golden, now fourteen of them.** After regenerating, run `git diff --stat tests/golden/` and confirm only the four new files appear. Criteria 10 and 11 are the mechanical backstop.
- **§3.3's helper is scoped to the `cd` line only.** `openspec/changes/new-bay-and-fleet/specs/command-surface/spec.md:30-31` freezes `bay`'s success block ("including … the block it prints on success"), while design §4 gives trunk `next` an `IN BAY:` heading `bay` does not have. Pulling the `bay created at …` / `already inside …` heading lines into the helper would put the two surfaces in conflict with the frozen spec.

## Risks (Phase 2)

- **`trunk-one-docket.txt` is a composition the CLI does not build until Phase 3, yet §3.1 requires it wired into `tests/waybill.test.js` "before any renderer is written".** The `IN BAY:` block is `cd`-helper output plus `renderWaybill` output. If the helper lands as a module-private function in `src/cli.js`, the waybill suite cannot import it and the golden cannot be produced at renderer level. Putting the helper in `src/waybill.js` alongside the other renderers — which is where design §4 says `renderFleet` and `renderSelect` go — is the resolution that keeps the golden testable. Decide this first; it determines the shape of the whole phase.
- **Widening `header()` is the trap that breaks the pinned goldens.** The fleet line's inline progress looks like a two-line change to `header()`. It is not: `header()` feeds `renderWaybill:187` and `renderPosition:204`, and criteria 10 and 11 pin nine golden files byte-unchanged against merge-base `08d0c6f`. Add a fleet-specific position formatter instead, and run `git diff --quiet $(git merge-base main HEAD) -- tests/golden/` before committing.
- **`tests/booking-swap.test.js:87,91` is an undocumented consumer of `renderWaybill`.** It appears in no spec's Files table and in no phase's file list. It calls `renderWaybill(state, clean)` with the current two-argument signature. Any signature change ripples there silently until the full suite runs.
- **The design document and the contract still disagree on one golden's name.** Design's testing section names `no-dockets.txt`; tasks.md §3.1, `contract.md:83` and decision-log entry 4 all name it `fleet-empty.txt`, and criterion 12 greps for `fleet-empty` specifically. **The contract supersedes.** (Carried forward from Phase 1, now directly load-bearing.)
- **Baseline headroom on criterion 0 is one line.** `npm test` is 318 pass / **373** TAP ok today; criterion 0 requires `-ge 372`. Phase 2 only adds cases, so this is comfortable — but it means a Phase 2 refactor that *consolidates* two existing assertions into one leaves no margin.
- **Design §4's `next`-empty message is Phase 3 work, not Phase 2.** `waybill: no dockets open — begin one with \`waybill new\`` sits in the same §4 as the four rendered blocks and reads like a fifth one. It is CLI dispatch output (criterion 1, exit 2) and belongs to tasks.md §4.2. Rendering it now would put a `waybill:`-prefixed error string in a renderer, which no other renderer does.
- **No decision-log contradiction found for Phase 2.** All nine entries in `contract-data.json → decisions` were checked against the tree as it stands after `3fe83a5`: entry 1 (rename first) is satisfied, entry 4 (`fleet-empty.txt`) is consistent with tasks.md and criterion 12, entries 5 and 6 (the `src/inference.js` boundary) still hold — the zero-diff check passes today. Phase 1's recorded contradiction (tasks.md §2.4 cited a README assertion that does not exist) was a §2 concern and does not recur here.

## Verification (Phase 2)

```bash
# inner loop
node --test tests/waybill.test.js          # 2.7s — the four goldens
node --test tests/cli.test.js              # 5.5s — the cd helper, esp. tests/cli.test.js:236

# phase acceptance gate (criterion 12), fails today on the missing fleet.txt
for g in fleet select trunk-one-docket fleet-empty; do
  test -s "tests/golden/$g.txt" || exit 1
  grep -q "$g" tests/waybill.test.js || exit 1
done

# section boundary
npm test                                   # 36.1s — expect 318+ pass, 0 fail, >=373 TAP ok
git diff --quiet $(git merge-base main HEAD) -- src/inference.js
git diff --quiet $(git merge-base main HEAD) -- src/legs.js src/bookings.js src/frontmatter.js src/inspection.js src/progress.js src/openspec.js
git diff --quiet $(git merge-base main HEAD) -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt tests/golden/refine.txt tests/golden/status.txt tests/golden/no-docket.txt
git diff --stat tests/golden/              # only the four new files may appear
```

All boundary checks above were run today and pass against merge-base `08d0c6f`.
