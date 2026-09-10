# Context Map: new-bay-and-fleet

**Phase**: 3 — The exit contract and trunk dispatch (tasks.md §4)
**Gates**: 5/5 ready
**Verdict**: GO

> Repository root for every path below: `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-new-bay-and-fleet`. Paths are repo-relative from here on so this map stays portable.

> This map was started in Phase 1 and is extended, not replaced. Phase 1's and Phase 2's sections are retained verbatim below; Phase 3's begin at **Gates (Phase 3)**.

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

# Phase 2 (retained) — Rendering (tasks.md §3.1–3.3)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `cd2214a` ("feat: render the fleet, the selection prompt, and one shared cd line")

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
- **No decision-log contradiction found for Phase 2.** All nine entries in `contract-data.json → decisions` were checked against the tree as it stands after `3fe83a5`.

## Phase 2 outcome (verified today)

- `src/waybill.js` now exports `cdLines(target, alreadyThere)` (`:217`), `renderFleet(branch, dockets, inspection)` (`:324`) and `renderSelect(branch, dockets, inspection)` (`:347`), plus module-private `fleetPosition` (`:69`), `fleetHeader` (`:274`), `docketBlock` (`:287`) and `fleetWarnings` (`:306`).
- `withFindings` (`:180`) was widened to `(sections, warnings, inspection)` exactly as §3.2 required; both original callers now pass `state.warnings` at the call site (`:242`, `:259`).
- `renderWaybill` gained a **third parameter** — `cd = []` (`:235`) — and renders `IN BAY:` before `NEXT:` when it is non-empty (`:241`). `src/cli.js:192` now calls `cdLines(result.path, alreadyThere)` inside `bay()`'s own success block.
- The four goldens exist and are wired at `tests/waybill.test.js:171-190`; criterion 12 passes.

---

# Phase 3 — The exit contract and trunk dispatch (tasks.md §4.1–4.6)

Contract phase entry: `contract-data.json → execution.phases[2]`, title "The exit contract and trunk dispatch", risk **high** (the only high-risk phase — "it is the behaviour change the whole effort exists for"), prereq "Rendering: fleet, selection, and the shared cd block", files `src/cli.js`, `src/waybill.js`, `tests/cli.test.js`, `tests/helpers/repo-fixture.js`, `README.md`.

## Gates (Phase 3)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                   |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file is named with the concrete change: `src/cli.js` `next()` (`:69-89` — trunk dispatch keyed on `state.docketOpen`, an optional positional in the option loop, the two exit-2-on-stdout cases, the `--json` non-zero shape) and `status()` (`:103-118` — trunk fleet view, still option-free); `tests/cli.test.js` (the §4.1 sweep, written first, beside the existing `describe('waybill next')` at `:78`); `README.md:95-99` table + `:101-105`/`:107-122` prose + `:128-131`; `tests/helpers/repo-fixture.js` only if `addWorktree(:120)` proves insufficient; `src/waybill.js` likely needs **no** edit — see Risks. |
| Pattern familiarity  | ready  | Read `src/cli.js` end to end (dispatch Map `:201`, `repoRoot` `:47`, `bay()`'s positional-vs-flag loop `:138-162`, and `bay()`'s cd+waybill composition `:179-197` — the exact precedent the one-docket branch reproduces), `src/waybill.js` end to end (`renderFleet:324`, `renderSelect:347`, `cdLines:217`, `renderWaybill:235`'s third parameter), `src/fleet.js` in full, `tests/cli.test.js` in full (the `cli()` harness `:59-76`, `isolated()` `:33-45`, and the "one shape the renderer builds" case `:242-253`), `tests/fleet.test.js` (the multi-worktree fixture route), and design §§1-4 (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:72-190`). |
| Dependency awareness | ready  | `run()` has exactly two consumers: `bin/waybill:12` and `tests/cli.test.js:7`. `next`/`status` are additionally invoked as `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next|status` from `commands/next.md` and `commands/status.md`. `renderFleet`/`renderSelect` have **no** production consumer yet (`tests/waybill.test.js:8` only) — this phase makes `src/cli.js` their first. `fleet()` is consumed only by `tests/fleet.test.js:6`. `cdLines` by `src/cli.js:192`, `tests/cli.test.js:8,252`, `tests/waybill.test.js`. `renderWaybill` by `src/cli.js:87,196`, `tests/waybill.test.js`, and the undocumented `tests/booking-swap.test.js:87,91`. Nothing asserts README's command table (`tests/commands.test.js` mentions README only in a comment at `:228`). |
| Edge case coverage   | ready  | Twenty concrete items below, including the two different exit-2 output streams, the bookings/inspection anchor for the issued waybill, `next <branch>` against a bay outside the configured container (which criteria 2 and 3 actually create), and the fact that `waybill new` does not exist as a verb until Phase 4. |
| Test strategy        | ready  | Measured on this tree today: `node --test tests/cli.test.js` **5.7s**, `node --test tests/fleet.test.js` <1s, `node --test tests/waybill.test.js` **2.7s**, `npm test` **36.5s → 338 pass / 0 fail**, TAP ok count **397** (criterion 0 floor is 372). The phase's four acceptance probes (`successCriteria[1..4]`) were each executed against this tree and **all four exit 1** — they are genuinely failing gates, not descriptions. Every boundary criterion (8, 9, 10, 11, 15) passes today at `cd2214a`. |

## Key Patterns (Phase 3)

- `src/cli.js:69-89` — `next(cwd, args, io)` as it stands: scan args against `NEXT_FLAGS` (`:32`) and reject any non-member as an unknown option; `repoRoot`; `resolveBookings(cwd, …)`; `resolveLeg(cwd, bookings)`; the `--json` branch dumps the whole `Inference` and exits 0; otherwise `renderWaybill(state, checkIgnored(root, paperPaths(bookings)))` and exit 0. The trunk dispatch inserts after `state` exists, keyed on `state.docketOpen === false`.
- `src/cli.js:103-118` — `status(cwd, args, io)`, the same shape minus the handover, rejecting **every** argument (`args.length > 0`, `:105`). Spec `:84` freezes that: "`status` SHALL remain free of options".
- `src/cli.js:179-197` — **the composition the one-docket branch reproduces.** `bay()` re-resolves bookings *and* inference from the new tree (`resolveBookings(result.path, …)`, `resolveLeg(result.path, …)`), computes `isInside(result.path, cwd)` (`:185`), builds `cdLines(result.path, alreadyThere)` (`:192`) inside its own frozen success block, and inspects against the bay: `checkIgnored(result.path, paperPaths(bookings))` (`:196`). Trunk `next` differs in one way only: the `cd` goes through `renderWaybill`'s **third argument** (`src/waybill.js:235`, `IN BAY:` at `:241`), not a preceding block — that is what `tests/waybill.test.js:189` pins as `trunk-one-docket.txt`.
- `src/cli.js:138-162` — `bay()`'s argument loop: flags detected by `arg.startsWith('-')`, positionals collected, then an arity check emitting `waybill: \`bay\` takes exactly one branch name` + `USAGE` to **stderr** with exit 2. The template for `next [<branch>]`.
- `src/cli.js:47-56` — `repoRoot(cwd, io)`, the only place the "not inside a git repository" string lives. **Criterion 15 forbids that string appearing in this branch's `src/cli.js` diff** — leave it exactly as is.
- `src/fleet.js:31-55` — `fleet(cwd, bookings)` → `Docket[]` (`{branch, path, state}`), git's order, four exclusions applied (main checkout, detached HEAD, default branch, prunable). Verified live today against a scratch repo with two sibling worktrees: it returns both, resolved from their own directories (`leg: refine, index: 3, docketOpen: true`).
- `src/waybill.js:324` `renderFleet(branch, dockets, inspection)` and `:347` `renderSelect(branch, dockets, inspection)` — both already take the trunk's own branch name for the header (`fleetHeader:274`) and already attribute warnings per docket (`fleetWarnings:306`). The CLI supplies `branch`, `dockets`, `inspection` and nothing else.
- `tests/cli.test.js:59-76` — `cli(argv, cwd)`: drives `run()` with both streams captured, inside `isolated()` (neutralises `GIT_CONFIG_GLOBAL`/`SYSTEM`) and `withPath(pathWithout('openspec'))`. Every new case goes through it.
- `tests/cli.test.js:242-253` — the case that compares output against `cdLines(target)[0]` rather than a regex. This is the model for the trunk-one-docket CLI assertion, which cannot use `trunk-one-docket.txt` (that golden carries the literal `/repo/.claude/worktrees/…` path, and a real fixture lives under `mkdtemp`).
- `tests/helpers/repo-fixture.js:120` — `addWorktree(repoDir, branch)`: `resolveBayPath` + `git worktree add --no-track -b` + `ensureBayIgnored`. The sanctioned multi-docket route (`tests/fleet.test.js:32,62,99` already use it) and the one tasks.md §4.1 names.
- `tests/fleet.test.js:23-105` — one `it` per exclusion, each building its repository inline. The shape the exit-contract sweep should follow.
- `docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:91-111` (§2) — the exit contract, the stdout rule, and the non-zero `--json` shape: `{ "error": "...", "dockets": [{ "branch": "...", "path": "...", "leg": "...", "index": 5 }] }`. Note this is a **projection** of `Docket`, not the whole `Inference`.
- design `:139-142` (§4) — the zero-docket line, verbatim: ``waybill: no dockets open — begin one with `waybill new` ``.
- design `:86-89` (§1) — the missing-bay line, verbatim: ``waybill: no bay for feat/x — cut one with `waybill bay feat/x` ``.

## Dependencies (Phase 3)

- `src/cli.js:69` (`next`) — consumed by → `bin/waybill:12` (via `run`), `commands/next.md`'s `!` line (`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next`), `tests/cli.test.js:78-150`. The session-facing branch that handles `SELECT A DOCKET:` is **Phase 5** (tasks.md §6.1), not this phase.
- `src/cli.js:103` (`status`) — consumed by → `bin/waybill:12`, `commands/status.md`'s `!` line, `tests/cli.test.js:152-197`. `commands/status.md`'s prose update is tasks.md §6.3 (Phase 5).
- `src/waybill.js:324,347` (`renderFleet`, `renderSelect`) — consumed by → `tests/waybill.test.js:8` only. **No external consumer breaks if their signatures change**, but the four goldens do.
- `src/waybill.js:217` (`cdLines`) — consumed by → `src/cli.js:192`, `tests/cli.test.js:8,252`, `tests/waybill.test.js:189,259-275`.
- `src/waybill.js:235` (`renderWaybill`) — consumed by → `src/cli.js:87,196`, `tests/waybill.test.js`, **`tests/booking-swap.test.js:87,91`** (still undocumented, still calls the two-argument form; the third parameter is optional so it stays green).
- `src/fleet.js:31` (`fleet`) — consumed by → `tests/fleet.test.js:6`. Phase 3 makes `src/cli.js` its first production consumer.
- `src/repo.js:174` (`defaultBranch`), `:71` (`listWorktrees`) — reached only through `fleet()` from the CLI; do not call them directly.
- `src/bay.js:71` (`isInside`) — consumed by → `src/cli.js:185`, `tests/bay.test.js:7`. The one-docket and `next <branch>` branches reuse it for `cd` suppression.
- `README.md:95-99` (command table), `:101-105` ("the docket is the branch"), `:107-122` ("all three commands say so and stop", plus the trunk example block), `:124-126` (`next --json` / option-free `status`), `:128-131` ("All three warn…") — **no automated consumer**; tasks.md §4.6 says "verified by review". `tests/commands.test.js` references README only in a comment (`:228`).
- `tests/index.js` — Phase 3 adds no new suite file; no edit needed.
- `tests/inference.test.js:70-73` — asserts `readdirSync(tests/fixtures/).length === LEGS.length + 1` (currently 8 files). Constrains §4.1: build multi-docket repos with `addWorktree`, add nothing under `tests/fixtures/`.

## Conventions (re-verified at `cd2214a`, plus one new rule)

- Unchanged from Phases 1 and 2 — see the Phase 2 Conventions section above (naming, ESM imports, the three error tiers, JSDoc-only types, `node:test` fixtures, no linter).
- **New in this phase, and it inverts the file's existing habit**: every exit-2 path in `src/cli.js` today writes to `io.err` and asserts `result.out === ''` in the suite. The zero-docket and many-docket cases must write to **`io.out`** and exit 2 (spec `:47-48`; design §2 `:107-111`), because `commands/next.md`'s `` ! `` invocation is the primary consumer and stderr capture there is unverified (that question is tasks.md §7.2, deliberately not answered by code). Parse errors keep stderr.

## Edge Cases for Phase 3

1. **Two different exit-2 output channels now coexist.** `tests/cli.test.js:142-149` and `:189-196` assert `result.out === ''` for option errors; the new docket cases must assert the opposite (`result.err === ''`, content on `out`). A blanket "exit 2 ⇒ stderr" helper breaks one half or the other.
2. **`next --json` must remain an object in both non-zero cases and keep `dockets`** (decision-log entry 8, tasks.md §4.5). Design `:104` fixes the shape as `{error, dockets:[{branch, path, leg, index}]}` — a projection, not the raw `Inference`. Zero dockets means `dockets: []`, not an omitted key. The projection belongs in `src/cli.js`: `src/fleet.js` is not on this phase's file list.
3. **`--json` on the trunk currently prints the full `Inference` and exits 0** (`src/cli.js:82-85`). After this phase the trunk shape differs from the in-a-bay shape. The in-a-bay case (`tests/cli.test.js:118-130`, asserting `state.leg`, `index`, `branch`, `completed`, `booking.command`) must stay exactly as it is.
4. **Trunk detection must be `state.docketOpen === false`, not `inBay(cwd)`.** `inBay` (`src/repo.js:218`) answers "is this a linked worktree", a different question: `tests/fixtures/bay.js` checks a feature branch out in the *main* checkout, where `inBay` is false but a docket is genuinely open. `docketOpen` is already computed at `src/inference.js:84` as `Boolean(branch) && branch !== base`.
5. **A detached HEAD reads as the trunk** under that rule (`currentBranch` → null → `docketOpen` false), and `renderFleet(state.branch, …)` would then interpolate `null` into `null · no dockets open`. Decide: fall back to `defaultBranch`, or accept. `tests/repo.test.js:180` already builds a detached-HEAD repo.
6. **Bookings anchor for the issued waybill.** `resolveBookings` is anchored on the tree the operator is standing in (`src/bookings.js:143-146` — "in a bay, `.waybill/bookings` is the branch's own answer"). `bay()` re-resolves from the new tree before rendering (`src/cli.js:179`). The trunk one-docket branch issues a waybill *for a bay the operator is not in*; resolving bookings from the trunk silently ignores that bay's own overlay. `fleet(cwd, bookings)` takes a single map for the listing, which is fine for positions but not for the handover.
7. **Inspection anchor.** `checkIgnored(root, paperPaths(bookings))` — for the fleet listing the trunk's own root is the honest answer; for the one-docket waybill `bay()`'s precedent is the docket's own path. Pick deliberately; `tests/cli.test.js:98-111` proves the inspection's anchor is load-bearing.
8. **`cd` suppression when the operator is already in the named bay.** `next feat/x` run from inside feat/x's bay must pass `cdLines(docket.path, isInside(docket.path, cwd))` → `[]` → `renderWaybill` leaves `IN BAY:` out entirely (`src/waybill.js:241`). `tests/cli.test.js:229-240` is the existing shape of that assertion for `bay`.
9. **`next <branch>` must not locate the bay via `resolveBayPath`.** Acceptance criteria 2 and 3 create worktrees at `$d/../one` — *outside* `.claude/worktrees` — so an existence check on the derived path finds nothing while `fleet()` finds both. Look the branch up in the enumerated fleet.
10. **`next <branch>` naming the trunk's own branch, a branch with no worktree, or a prunable one** all land on the same "no bay for X" path, because `fleet()` has already excluded them (`src/fleet.js:41-46`).
11. **Positional arity for `next`.** Today every non-flag argument is rejected as an unknown option (`src/cli.js:70`). After §4.3 a *second* positional needs its own rejection, and `next --jsonn` must still fail as an unknown **option** (`tests/cli.test.js:142-149`) rather than being read as a branch name.
12. **`waybill new` does not exist as a verb until Phase 4.** The zero-docket message names it (design `:142`) and criterion 5 (usage lists exactly four verbs) is Phase 4's gate. Between the two phases the CLI points at a verb it rejects — expected, sequential, and not a defect to "fix" by adding the verb early.
13. **`status` gains no option.** Spec `:84` and `tests/cli.test.js:189-196` (`status --json` exits 2, `out` empty) pin it. The fleet view is chosen by where you stand, never by a flag.
14. **`status` inside a bay is unchanged** (spec `:98-100`): `tests/golden/status.txt` is pinned byte-unchanged by criterion 10 and compared at `tests/cli.test.js:153-160`.
15. **Warning attribution already lives in the renderer** (`fleetWarnings`, `src/waybill.js:306-310`, `branch: text`). The CLI must hand `renderFleet` the raw dockets — pre-prefixing produces `feat/x: feat/x: …`.
16. **No new file under `tests/fixtures/`** — `tests/inference.test.js:70-73` counts that directory (8 today). Use `addWorktree` (`tests/helpers/repo-fixture.js:120`), or update the count in the same task, as §4.1 states.
17. **A repository with zero commits** (`createRepo({commit: false})`): `listWorktrees` still returns the main checkout, `fleet` returns `[]`, so `next` must take the zero-docket path rather than throwing. `tests/cli.test.js:310-318` shows how that repo shape is built.
18. **Submodules.** `repoRoot` redirects to the superproject (`src/cli.js:48`), but `fleet(cwd, …)` handed the raw `cwd` would enumerate the *submodule's* worktrees. Pass the redirected root so the enumeration and the resolution answer for one repository — `resolveLeg` already warns about the redirect (`src/inference.js:59`).
19. **The acceptance probes are weaker than the suite must be.** Criteria 1 and 2 check the exit code only; criterion 3 greps `2>&1` (both streams merged) for the branch name. The §4.1 sweep must additionally assert *which stream* carried the output, or the stdout rule is untested.
20. **The one-docket header names the docket's branch, not the trunk's.** Criterion 3 greps for `feat/one`; `renderWaybill` uses the docket's own `state.branch` (`header`, `src/waybill.js:79-81`), which comes from `fleet()`'s per-tree `resolveLeg` — confirmed live today.

## Risks (Phase 3)

- **This is the high-risk phase, and the risk is behavioural, not mechanical.** `next` on the trunk flips from exit 0 with a waybill to exit 2 with either a pointer or a list. Anything scripted against today's behaviour breaks — intended (`**BREAKING**` is stated in the spec for the rename; the exit contract is the same class of change) — but note the *session* side does not catch up until Phase 5 (§6.1 adds the `SELECT A DOCKET:` branch to `commands/next.md`, §6.2 adds `AskUserQuestion`). In between, `/waybill:next` on a many-docket trunk shows the selection block verbatim and stops, with no prompt. That is the design's intended sequencing, not a regression to fix here.
- **The stdout-for-exit-2 rule invites a tempting adjacent fix.** While moving output between streams it is natural to also route `repoRoot`'s error to stdout — which is exactly what **criterion 15** exists to catch (`! git diff $(git merge-base main HEAD) -- src/cli.js | grep -q 'is not inside a git repository'`). That question is tasks.md §7.2 and must stay unfixed in this branch. The check passes today; re-run it before committing.
- **`src/waybill.js` is on this phase's file list but probably needs no edit.** `renderFleet`, `renderSelect`, `cdLines` and `renderWaybill`'s `cd` parameter all shipped in `cd2214a`. If a `waybill: …`-prefixed string lands in a renderer it contradicts the renderer-purity contract (`src/waybill.js:222-227`) and the Phase 2 decision that CLI-prefixed strings stay in the CLI. Prefer an empty diff there over an invented seam.
- **`README.md:110-117` is byte-identical to `tests/golden/no-docket.txt`, which criterion 11 pins.** Editing the README is free; regenerating that golden is not. Phase 4 re-points it at `new` and it must still pass unchanged — do not delete or rewrite it here.
- **The README prose §4.6 falsifies runs past the cited range.** tasks.md §4.6 says `README.md:95-107`; in the current tree the falsified text actually spans `:95-122` (the table at `:95-99`, "the docket is the branch" at `:101`, "all three commands say so and stop" at `:107`, and the trunk example block at `:110-117` which the trunk no longer prints). `:124-126` and `:128-131` stay true. The fourth verb's table row is Phase 4 (§5.6), not this phase.
- **Acceptance criteria 1–4 are environment-sensitive.** They run `git init` without `-b` and do **not** neutralise the developer's git config, so the probe repository inherits `init.defaultBranch` (verified `main` on this machine). On a machine defaulting to a name outside `BASE_CANDIDATES` (`main`, `master`, `trunk` — `src/repo.js:160`), the probe's branch would differ from `defaultBranch()`, `docketOpen` would be true, and criterion 1 would fail for an environment reason rather than a code one. If a probe reds unexpectedly, check `git config --get init.defaultBranch` before touching code.
- **Criterion 0's headroom is no longer tight.** Phase 2's "one line of headroom" note is stale: the tree now yields **397** TAP ok lines against a floor of 372. Consolidating assertions is still discouraged, but the margin is 25 lines, not 1.
- **No decision-log contradiction found for Phase 3.** All nine entries in `contract-data.json → decisions` were re-checked against the tree at `cd2214a`. Entry 8 (`next --json` keeps its `dockets` array) is directly load-bearing for §4.5, and its stated reason still holds verbatim in the tree: `src/cli.js:94-96` still refuses a second machine surface and `README.md:124-126` still says so. Entries 2 and 5 (the `src/inference.js` boundary) hold — the zero-diff check passes today. Entry 1 (rename first) and entry 4 (`fleet-empty.txt`) are satisfied by the two shipped phases.

## Verification (Phase 3)

```bash
# inner loop
node --test tests/cli.test.js              # 5.7s — the §4.1 sweep, dispatch, the positional
node --test tests/fleet.test.js            # <1s  — enumeration, if a docket case moves
node --test tests/waybill.test.js          # 2.7s — the four goldens must stay green

# phase acceptance gates — all four confirmed FAILING (exit 1) against this tree today
# criterion 1 — zero dockets exits 2
R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; (cd "$d" && node "$R/bin/waybill" next >/dev/null 2>&1); test $? -eq 2
# criterion 2 — two bays exits 2
R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; git -C "$d" worktree add -q -b feat/two "$d/../two"; (cd "$d" && node "$R/bin/waybill" next >/dev/null 2>&1); test $? -eq 2
# criterion 3 — one bay issues that docket's waybill, naming its branch
R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; (cd "$d" && node "$R/bin/waybill" next 2>&1) | grep -q 'feat/one'
# criterion 4 — status on a two-bay trunk names both branches
R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; git -C "$d" worktree add -q -b feat/two "$d/../two"; test "$( (cd "$d" && node "$R/bin/waybill" status 2>&1) | grep -cE 'feat/(one|two)' )" -eq 2

# section boundary
npm test                                   # 36.5s — expect 338+ pass, 0 fail
node --test --test-reporter=tap tests/ 2>/dev/null | grep -cE '^ *ok '   # >= 372 (397 today)
MB=$(git merge-base main HEAD)             # 08d0c6f today
git diff --quiet $MB -- src/inference.js
git diff --quiet $MB -- src/legs.js src/bookings.js src/frontmatter.js src/inspection.js src/progress.js src/openspec.js
git diff --quiet $MB -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt tests/golden/refine.txt tests/golden/status.txt tests/golden/no-docket.txt
! git diff $MB -- src/cli.js | grep -q 'is not inside a git repository'
```

Measured on this tree today at `cd2214a`: `npm test` → **338 pass / 0 fail**, 36.5s, **397 TAP ok**. Every boundary check above passes; all four phase-3 acceptance probes fail, as they should before implementation.
