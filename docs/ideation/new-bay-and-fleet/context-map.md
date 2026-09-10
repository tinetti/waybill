# Context Map: new-bay-and-fleet

**Phase**: 5 — The session-facing branch (tasks.md §6)
**Gates**: 5/5 ready
**Verdict**: GO

> Repository root for every path below: `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-new-bay-and-fleet`. Paths are repo-relative from here on so this map stays portable.

> This map was started in Phase 1 and is extended, not replaced. Phases 1–4 are retained verbatim below; Phase 5's sections begin at **Phase 5 — The session-facing branch**.

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

## Phase 1 outcome (verified)

- `commands/bay.md` exists; `commands/start.md` is gone.
- `src/cli.js` dispatches `['bay', bay]`; `USAGE` line is `'  bay <branch>    Create the branch and its bay, then hand off the next leg'`.
- `src/bay.js`'s export was renamed to **`openBay`**.
- Boundary checks all green against merge-base `08d0c6f`: `src/inference.js` zero-diff, the six untouched modules zero-diff, the eight in-a-bay goldens byte-unchanged, `tests/golden/no-docket.txt` byte-unchanged, and no `is not inside a git repository` string in the `src/cli.js` diff.
- **New baseline at the time**: `npm test` → **318 pass / 0 fail / 373 TAP ok**, 36.1s.

---

# Phase 2 (retained) — Rendering (tasks.md §3.1–3.3)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `cd2214a` ("feat: render the fleet, the selection prompt, and one shared cd line")

Contract phase entry: `contract-data.json → execution.phases[1]`, title "Rendering: fleet, selection, and the shared cd block", risk **low**, files `src/waybill.js`, `src/cli.js`, `tests/golden/{fleet,select,trunk-one-docket,fleet-empty}.txt`, `tests/waybill.test.js`, `tests/cli.test.js`.

## Gates (Phase 2)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                   |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Six files, each with a concrete change: `src/waybill.js` (add `renderFleet`/`renderSelect` beside `renderWaybill:184`/`renderPosition:203`; widen `withFindings:151`), `src/cli.js:187-194` (extract the `cd` block), `tests/waybill.test.js` (wire four goldens through `assertGolden:41`), and the four new `tests/golden/*.txt`. |
| Pattern familiarity  | ready  | Read `src/waybill.js` end-to-end (INDENT, `header`, `strip`, section-join-by-`\n\n`, `withFindings`), `tests/waybill.test.js` in full, `src/fleet.js` (the `Docket` typedef), `src/repo.js:71`/`:174`, and the shipped goldens `no-docket.txt`/`status.txt`. |
| Dependency awareness | ready  | `withFindings` is module-private with exactly two callers. `renderWaybill` is consumed by `src/cli.js:90,197`, `tests/waybill.test.js`, `tests/booking-swap.test.js:87,91`. `renderPosition` by `src/cli.js:119`. `fleet()` by `tests/fleet.test.js` only. The inline `cd` block is asserted at `tests/cli.test.js:208,224,236,259,267`. |
| Edge case coverage   | ready  | Twelve items, including the byte-stability problem in `trunk-one-docket.txt`, the plural/singular one-character gap, `header()`'s missing progress suffix, and column padding. |
| Test strategy        | ready  | `node --test tests/waybill.test.js` **2.7s**, `node --test tests/cli.test.js` **5.5s**, `npm test` **36.1s / 318 pass / 373 ok**. Criterion 12 confirmed failing before the work. |

## Key Patterns (Phase 2)

- `src/waybill.js:151` — `withFindings(sections, state, inspection)`. The single seam every surface shares. Appends `IGNORED BY GIT:` then `WARNINGS:` and returns `sections.join('\n\n') + '\n'`.
- `src/waybill.js:50-57` — `header(state)` returns `` `${branch} · ${position}` ``. **It carries no progress suffix**; progress lives only in `strip()`.
- `src/waybill.js:40` — `const INDENT = '  '` (two spaces). Golden files make every space load-bearing.
- `tests/waybill.test.js:41-48` — `assertGolden(name, actual)` resolves `tests/golden/<name>.txt` by name; rewrites only under `UPDATE_GOLDEN=1`.
- `tests/waybill.test.js:56-77` — `state(overrides)`, the synthetic `Inference` builder. **The route to a byte-stable golden with no temp paths in it.**
- `tests/waybill.test.js:27` — `resolve(dir)` wraps `resolveLeg` in `withPath(pathWithout('openspec'), …)` so the real openspec CLI can never influence a golden.
- `src/fleet.js:5-9` — `Docket = {branch, path, state}`; `fleet(cwd, bookings)` returns them in git's order.
- `src/bay.js:71-80` — `isInside(target, cwd)`, realpath-based, true for `cwd === target` too.
- `tests/golden/no-docket.txt:1` — `main · no docket open`. The shape `fleet-empty.txt` must deliberately differ from.

## Dependencies (Phase 2)

- `src/waybill.js` `withFindings` — module-private, two internal callers, no external consumers.
- `renderWaybill` — consumed by → `src/cli.js`, `tests/waybill.test.js`, **`tests/booking-swap.test.js:87,91`** (in no spec's Files table).
- `renderPosition` — consumed by → `src/cli.js` (`status`), `tests/waybill.test.js`.
- `src/fleet.js:31` (`fleet`) — consumed by → `tests/fleet.test.js` only at the time.
- `src/repo.js:71` (`listWorktrees`) — consumed by → `src/fleet.js`, `src/bay.js`, `tests/repo.test.js`.
- `tests/index.js` — imports all twelve suites explicitly; no new suite file was added.
- `tests/golden/` — nothing asserts the directory's contents or file count; contrast with `tests/fixtures/`.

## Conventions (unchanged from Phase 1, re-verified)

- **Naming**: kebab-case files. Goldens are `tests/golden/<name>.txt` resolved by name. Renderers are `render<Thing>` exported from `src/waybill.js`. Headings inside a block are ALL CAPS with a trailing colon (`NEXT:`, `IGNORED BY GIT:`, `WARNINGS:`, `IN BAY:`, `SELECT A DOCKET:`, `DOCKETS:`).
- **Imports**: ESM, relative paths with explicit `.js`, `node:` prefix on builtins, builtins first then locals with a blank line between. Zero dependencies, no build step (asserted at `tests/commands.test.js:269-278`).
- **Error handling**: three tiers documented at `src/bay.js:14-23` — queries return `null`, loaders throw `file:line: message`, `BayError` carries operator-facing failures. Only `src/cli.js` writes to a stream or picks an exit code. Renderers are pure: no filesystem, no subprocess, no clock.
- **Types**: JSDoc only. Every exported function carries `@param`/`@returns`, and the prose explains *why* at length, not *what*.
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, `after(cleanupAll)`. Fixtures build real git repositories via `tests/helpers/repo-fixture.js`. Golden regeneration is `UPDATE_GOLDEN=1`.
- **No linter or formatter** is configured; `package.json` declares only `test`.

## Edge Cases for Phase 2

- **`trunk-one-docket.txt` contains an absolute path** and therefore cannot be rendered from a real fixture — render it from the synthetic `state()` builder plus a fixed literal path.
- **`fleet-empty.txt`'s exact text is not written down in design §4** — derived from §1's route table and the spec's "SHALL say so in the plural".
- **`no docket open` vs `no dockets open` are one character apart and mean opposite things.**
- **`header()` has no progress suffix, but the fleet and select lines need one inline** — a fleet-specific formatter, never a widened `header()`.
- **Column alignment is padding to the longest branch name** — the fixtures carry three widths on purpose.
- **The `SELECT A DOCKET:` section contains an internal blank line** — one section string with a literal `\n\n`, not two sections.
- **`withFindings`'s widening must leave both existing callers byte-identical.**
- **`grep -q "$g" tests/waybill.test.js` in criterion 12 is a substring match** — `fleet` matches inside `fleet-empty`.
- **Do not add a file under `tests/fixtures/`** — `tests/inference.test.js:70-73` counts that directory.
- **Model names are banned in `src/`, not in `tests/golden/`** (`tests/waybill.test.js`, "criterion 2").
- **`UPDATE_GOLDEN=1` rewrites every golden.**
- **§3.3's helper is scoped to the `cd` line only** — `bay`'s success block is frozen by the spec.

## Risks (Phase 2)

- The `cd` helper had to live in `src/waybill.js`, not `src/cli.js`, for `trunk-one-docket.txt` to be producible at renderer level.
- Widening `header()` is the trap that breaks the pinned goldens.
- `tests/booking-swap.test.js:87,91` is an undocumented consumer of `renderWaybill`.
- The design document and the contract disagree on one golden's name (`no-dockets.txt` vs `fleet-empty.txt`). **The contract supersedes.**
- No decision-log contradiction found for Phase 2.

## Phase 2 outcome (verified)

- `src/waybill.js` exports `cdLines(target, alreadyThere)`, `renderFleet(branch, dockets, inspection)` and `renderSelect(branch, dockets, inspection)`, plus module-private `fleetPosition`, `fleetHeader`, `docketBlock`, `fleetWarnings`.
- `withFindings` was widened to `(sections, warnings, inspection)`; both original callers pass `state.warnings` at the call site.
- `renderWaybill` gained a **third parameter** — `cd = []` — and renders `IN BAY:` before `NEXT:` when it is non-empty.
- The four goldens exist and are wired; criterion 12 passes.

---

# Phase 3 (retained) — The exit contract and trunk dispatch (tasks.md §4.1–4.6)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `22e30ef` ("feat: dispatch next and status from the trunk, on one exit contract")

Contract phase entry: `contract-data.json → execution.phases[2]`, title "The exit contract and trunk dispatch", risk **high**, files `src/cli.js`, `src/waybill.js`, `tests/cli.test.js`, `tests/helpers/repo-fixture.js`, `README.md`.

## Gates (Phase 3)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                   |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file named with the concrete change: `src/cli.js` `next()` and `status()`, `tests/cli.test.js` (the §4.1 sweep written first), `README.md:95-131`, `tests/helpers/repo-fixture.js` only if `addWorktree` proved insufficient, `src/waybill.js` likely no edit. |
| Pattern familiarity  | ready  | Read `src/cli.js` end to end, `src/waybill.js` end to end, `src/fleet.js` in full, `tests/cli.test.js` in full, `tests/fleet.test.js`, and design §§1-4. |
| Dependency awareness | ready  | `run()` has exactly two consumers: `bin/waybill:12` and `tests/cli.test.js:7`, plus the `!` lines in `commands/next.md` and `commands/status.md`. Nothing asserts README's command table. |
| Edge case coverage   | ready  | Twenty concrete items, including the two different exit-2 output streams and the bookings/inspection anchor for the issued waybill. |
| Test strategy        | ready  | `node --test tests/cli.test.js` **5.7s**, `npm test` **36.5s → 338 pass**, **397 TAP ok**. All four phase-3 acceptance probes confirmed failing before the work. |

## Key Patterns (Phase 3)

- `src/cli.js` `next(cwd, args, io)` — scan args against `NEXT_FLAGS`, `repoRoot`, `resolveBookings`, `resolveLeg`, `--json` branch, `renderWaybill`. Trunk dispatch inserts after `state` exists, keyed on `state.docketOpen === false`.
- `src/cli.js` `status(cwd, args, io)` — the same shape minus the handover, rejecting **every** argument. Spec freezes that.
- `src/cli.js` `bay()` — re-resolves bookings *and* inference from the new tree, computes `isInside`, builds `cdLines` inside its own frozen success block. **The composition the one-docket branch reproduces.**
- `src/cli.js` `repoRoot(cwd, io)` — the only place the "not inside a git repository" string lives. **Criterion 15 forbids that string appearing in this branch's `src/cli.js` diff.**
- `src/fleet.js:31-55` — `fleet(cwd, bookings)` → `Docket[]`, git's order, four exclusions.
- `tests/cli.test.js:61-78` — `cli(argv, cwd)` drives `run()` with both streams captured, inside `isolated()` and `withPath(pathWithout('openspec'))`.
- `tests/helpers/repo-fixture.js:120` — `addWorktree(repoDir, branch)`, the sanctioned multi-docket route.
- design `:139-142` — the zero-docket line verbatim; design `:86-89` — the missing-bay line verbatim.

## Dependencies (Phase 3)

- `src/cli.js` `next` — consumed by → `bin/waybill:12`, `commands/next.md`'s `!` line, `tests/cli.test.js`.
- `src/cli.js` `status` — consumed by → `bin/waybill:12`, `commands/status.md`'s `!` line, `tests/cli.test.js`.
- `renderFleet`/`renderSelect` — no external consumer breaks if their signatures change, but the four goldens do.
- `renderWaybill` — `src/cli.js`, `tests/waybill.test.js`, **`tests/booking-swap.test.js:87,91`**.
- `README.md:95-131` — **no automated consumer**; verified by review.
- `tests/inference.test.js:70-73` — asserts `readdirSync(tests/fixtures/).length === LEGS.length + 1`.

## Conventions (Phase 3, plus one new rule)

- Unchanged from Phases 1 and 2.
- **New in this phase, and it inverts the file's existing habit**: the zero-docket and many-docket cases write to **`io.out`** and exit 2, because `commands/next.md`'s `!` invocation captures stdout only. Argument parse errors keep stderr.

## Edge Cases for Phase 3

1. Two different exit-2 output channels now coexist.
2. `next --json` must remain an object in both non-zero cases and keep `dockets`.
3. `--json` on the trunk differs in shape from the in-a-bay shape; the in-a-bay case must stay exactly as it is.
4. Trunk detection must be `state.docketOpen === false`, not `inBay(cwd)`.
5. A detached HEAD reads as the trunk under that rule.
6. Bookings anchor for the issued waybill is the *bay*, not the operator's tree.
7. Inspection anchor: the trunk's root for the fleet listing, the docket's path for a one-docket waybill.
8. `cd` suppression when the operator is already in the named bay.
9. `next <branch>` must not locate the bay via `resolveBayPath` — look it up in the enumerated fleet.
10. Trunk's own branch, no worktree, or prunable all land on the same "no bay for X" path.
11. Positional arity for `next`; `--jsonn` must still fail as an unknown option.
12. **`waybill new` does not exist as a verb until Phase 4** — expected, sequential, not a defect.
13. `status` gains no option.
14. `status` inside a bay is unchanged.
15. Warning attribution already lives in the renderer.
16. No new file under `tests/fixtures/`.
17. A repository with zero commits must take the zero-docket path.
18. Submodules: pass the redirected root to `fleet()`.
19. The acceptance probes are weaker than the suite must be.
20. The one-docket header names the docket's branch, not the trunk's.

## Risks (Phase 3)

- The behavioural break: `next` on the trunk flips from exit 0 to exit 2, and the session side does not catch up until Phase 5.
- The stdout-for-exit-2 rule invites the adjacent `repoRoot` fix that criterion 15 exists to catch.
- `src/waybill.js` was on the file list but needed no edit.
- `README.md:110-117` was byte-identical to `tests/golden/no-docket.txt`. **Resolved in this phase**: the README's leg-1 example block is gone (README now carries only the fleet example at `:120-126` and the `no dockets open` pointer at `:130`), and `tests/golden/no-docket.txt` is still byte-unchanged.
- Acceptance criteria 1–4 are environment-sensitive (`git init` without `-b`, no config neutralisation).
- No decision-log contradiction found for Phase 3.

## Phase 3 outcome (verified today at `22e30ef`)

- `src/cli.js` gained `trunkName(state)` (`:71`), `issueWaybill(docket, cwd, json, io)` (`:90`), and `noWaybill(message, dockets, json, io)` (`:126`). `next` is now `:159-223`; `status` is `:238-262`.
- `next` on the trunk: zero dockets → `noWaybill('no dockets open — begin one with \`waybill new\`', …)` on **stdout**, exit 2 (`:205`); one docket → `issueWaybill` (`:207`); many → `renderSelect` on stdout, exit 2 (`:212`), or the `noWaybill` JSON projection under `--json` (`:208-211`). `next <branch>` resolves through `fleet()` (`:188-196`).
- `status` on the trunk renders `renderFleet(trunkName(state), fleet(root, bookings), inspection)` and exits 0 (`:255-258`).
- `README.md:93-146` rewritten: the Commands table (`:96-99`), the fleet example (`:114-122`), the exit-contract prose (`:124-141`).
- Baseline after the phase: `npm test` → **359 pass / 0 fail**, **422 TAP ok**.

---

# Phase 4 (retained) — `new`: the trunk-side entry point (tasks.md §5.1–5.6)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `1ce2528` ("feat: give an effort a trunk-side entry point, and run the leg it names")

Contract phase entry: `contract-data.json → execution.phases[3]`, title "new: the trunk-side entry point", risk **medium**, prereq "The exit contract and trunk dispatch", files `src/cli.js`, `commands/new.md`, `tests/fixtures/no-docket.js`, `tests/waybill.test.js`, `tests/cli.test.js`, `tests/commands.test.js`, `README.md`.

## Gates (Phase 4)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Seven files, each with a concrete change: `src/cli.js` (a `USAGE` row at `:13-27`, a handler beside `status():238`, a `['new', …]` entry in the `COMMANDS` Map at `:345-349`), **new file** `commands/new.md` (frontmatter with `model`/`effort`, the `!` line, a `## Task` that invokes rather than stops), `tests/commands.test.js` (`DECLARED:32-41` gains `'new.md'` before `'next.md'`; a routing pin beside `:171-187`), `tests/cli.test.js` (a `describe('waybill new')` beside `:362`), `tests/waybill.test.js:155-168` (re-point the golden's description/wiring at `new`), `tests/fixtures/no-docket.js:3-13` (its doc comment still describes the golden as what the trunk printed), `README.md:67` and `:96-99`. |
| Pattern familiarity  | ready  | Read all four shipped command files in full (`next.md`, `status.md`, `bay.md`, `cleanup.md`) plus `commands/spec/propose.md:1-6` — the only shipped files that *do* declare `model:`/`effort:`, which is the shape `new.md` follows. Read `src/cli.js` end to end, `tests/commands.test.js` end to end (`DECLARED`, `shipped()`, `problems()`, `scratch()`, the `${CLAUDE_PLUGIN_ROOT}` spelling check `:151-169`, the routing pin `:171-187`), `tests/waybill.test.js:117-191`, `tests/cli.test.js:1-100,160-200,362-460`, `bookings/ideation-ideate.md` in full, and design §§1, 6 (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:76-90,207-238`). |
| Dependency awareness | ready  | `run()`/`COMMANDS` — consumed by `bin/waybill:12`, `tests/cli.test.js:7`, and the four command files' `!` lines. `tests/golden/no-docket.txt` — consumed by `tests/waybill.test.js:156` and `:164-167` **only**. `tests/fixtures/no-docket.js` — consumed by `tests/waybill.test.js:12` only. `DECLARED` — consumed by six cases in `tests/commands.test.js` including `scratch():97-105`. The `waybill new` literal already exists at `src/cli.js:205`, `README.md:130`, `tests/cli.test.js:188`. `USAGE`'s `status` row is additionally pinned by `tests/commands.test.js:303`. `README.md` has no automated consumer. |
| Edge case coverage   | ready  | Twenty concrete items below, several established by running code rather than by reading: the in-a-bay resolution (`refine`, index 3, `docketOpen: true`), the header a forced leg-1 state produces from a bay (`feat/x · no docket open`), and the byte-exact CLI composition that reproduces the golden. |
| Test strategy        | ready  | `node --test tests/commands.test.js` **0.18s**, `node --test tests/waybill.test.js` **2.8s**, `node --test tests/cli.test.js` **13.3s**, `npm test` **45.8s → 359 pass / 0 fail**, **422 TAP ok**. Phase 4's three acceptance probes (criteria 5, 6, 7) each confirmed failing first; criterion 11 passing before and after. |

## Key Patterns (Phase 4)

- `src/cli.js:13-27` — `USAGE`. Verb column is 16 characters wide; descriptions start at column 19. Criterion 5 counts `grep -cE '^  (new|bay|next|status) '` and demands **4**.
- `src/cli.js:238-262` — `status(cwd, args, io)`, the option-free verb, the nearest template for `new`.
- `src/cli.js:345-349` — `const COMMANDS = new Map([...])`. `new` is a **JavaScript reserved word**, so the handler cannot be named `new`; the Map *key* stays the string `'new'`, which is what criterion 6's `grep -q "\['new'" src/cli.js` anchors on.
- `src/cli.js:198-221` — the trunk path `new` reproduces. `resolveLeg(cwd, bookings)` with `docketOpen === false` returns leg 1 (`src/inference.js:117` `done.fill(false)`, `:138` `changeId: null`).
- `src/inference.js:66-76` — the no-repository early return, the one place that hand-builds a leg-1 `Inference`. Copy the shape into `src/cli.js`; **do not export a new helper from `src/inference.js`** (criterion 8 is a zero-diff on that file).
- `commands/status.md` — the no-argument command-file template. `commands/new.md` inverts the model comment and the "then stop" instruction, and keeps everything else.
- `commands/spec/propose.md:1-6` — `description`, `model: opus`, `effort: high`, `allowed-tools:`. The frontmatter shape `new.md` follows.
- The `!` line, shipped in all node-driven commands verbatim except the verb, spelling `${CLAUDE_PLUGIN_ROOT}` bare. Pinned by `tests/commands.test.js:151-169`.
- `tests/commands.test.js:32-41` — `DECLARED`, sorted. `'new.md'` sorts **before** `'next.md'`.
- `tests/commands.test.js:171-187` — the vendored-routing pin, the template for §5.3's pin.
- `bookings/ideation-ideate.md:1-7` — `leg: ideate`, `command: /ideation:brainstorm`, `model: opus`, `effort: high`, `handover: transfer`, `stampCmd: false`.
- `tests/waybill.test.js:155-168` — the two assertions that hold `no-docket.txt`.

## Dependencies (Phase 4)

- `src/cli.js:359` (`run`) / `:345` (`COMMANDS`) — consumed by → `bin/waybill:12`, `tests/cli.test.js:7`, and the `!` lines in `commands/{next,status,bay}.md`.
- `src/cli.js:13` (`USAGE`) — consumed by → every parse-error path, `run()`, and **`tests/commands.test.js:302-303`**, which spawns `bin/waybill --help` and matches `/^ {2}status +Where this docket stands, without the waybill$/m`.
- `tests/golden/no-docket.txt` — consumed by → `tests/waybill.test.js:156` and `:164-167` only.
- `tests/fixtures/no-docket.js` — consumed by → `tests/waybill.test.js:12` only.
- `tests/commands.test.js:32` (`DECLARED`) — consumed by → `:111`, `:115`, `:99`, `:159`.
- `bookings/ideation-ideate.md` — consumed by → `loadBookings` at runtime, `tests/inference.test.js`, and `tests/golden/{no-docket,ideate}.txt` (its body *is* their prose).
- `.claude-plugin/plugin.json` — declares **no** `commands` key, and `tests/commands.test.js:205-207` asserts it stays that way.

## Conventions (re-verified at `22e30ef`, plus one inversion)

- Unchanged from Phases 1–3 — naming, ESM imports, the three error tiers, JSDoc-only types, `node:test` fixtures, no linter, renderer purity, `io.out` for exit-2 answers about the repository and `io.err` for the CLI's own parse complaints.
- **Inverted for `commands/new.md` only**: it declares `model:`/`effort:` because its waybill is for **this** session; every other command refuses them.
- **Also inverted**: `next.md`, `status.md` and `bay.md` all end with "Then stop." `new.md` shows the block and then *invokes*.

## Edge Cases for Phase 4

1. **`new` is a reserved word.** 2. **Inside a bay, `resolveLeg(cwd)` answers for the bay, not for leg 1.** 3. **Forcing leg 1 from inside a bay leaves the bay's branch on the header** — the one undesigned behaviour in the phase. 4. **The leg-1 construction must not touch `src/inference.js`.** 5. **The in-a-bay warning belongs on stdout, not stderr** — route it through `state.warnings`. 6. **`tests/golden/no-docket.txt` must stay byte-identical twice over.** 7. **Do not edit `bookings/ideation-ideate.md`.** 8. **The block says `/clear, then run:` while `/waybill:new` invokes immediately.** 9. **Invoking a slash command may need a permission the restrictive `allowed-tools` line does not carry.** 10. **`commands/new.md`'s `!` line must spell the plugin root exactly `${CLAUDE_PLUGIN_ROOT}`.** 11. **Do not "fix" the shipped guard's `if … fi` shape** — a known pre-existing finding (`docs/ideation/pitwall/run-2026-08-24.json:64`), out of scope. 12. **`DECLARED` sort position.** 13. **`tests/commands.test.js:303` pins the `status` usage row.** 14. **`new` outside a git repository** — reuse `repoRoot`. 15. **A CLI-level golden comparison for `new` is available and byte-exact.** 16. **Add no file under `tests/fixtures/`.** 17. **`new` takes no options, and there is no `new --json`.** 18. **`new` on a trunk with bays open still prints leg 1's waybill and exits 0.** 19. **Phase 5 (tasks.md §6) owns `commands/next.md` and `commands/status.md`.** 20. **`src/inference.js:113`'s stale `/waybill:start` comment stays stale.**

## Risks (Phase 4)

- The in-a-bay header is the one undesigned output in this phase.
- The slash command's invocation permission is unstated; an undeclared tool fails *silently*.
- Forcing leg 1 tempts a change to `src/inference.js` that would red criterion 8.
- `UPDATE_GOLDEN=1` is the fastest way to break criterion 11.
- tasks.md §0's inner-loop table is stale.
- No decision-log contradiction found for Phase 4.

## Phase 4 outcome (verified today at `1ce2528`)

- `commands/new.md` exists (68 lines): `model: opus`, `effort: high`, `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), SlashCommand, Skill` (`:5`), the shipped `!` guard with verb `new` (`:39`), and a `## Task` (`:41-67`) that shows the block verbatim, then runs the command the `NEXT:` block names, explicitly overriding the `/clear, then run:` line (`:51-55`), reporting an unresolvable command (`:57-60`), and relaying `WARNINGS`/`IGNORED BY GIT`.
- `tests/commands.test.js:190-210` — *"runs `new` at the model and effort the ideate booking names, and nothing else at any"*: `new.md`'s `model`/`effort` asserted against `bookings/ideation-ideate.md`'s **parsed** values, plus the inversion sweep over every other declared non-`spec/` file.
- `DECLARED` is nine entries with `'new.md'` between `'cleanup.md'` and `'next.md'` (`tests/commands.test.js:32-42`).
- Criteria 5, 6, 7 now **pass**; criterion 11 still passes; all boundary checks still green.
- Baseline after the phase: `npm test` → **368 pass / 0 fail**, **432 TAP ok**, 46.6s.

---

# Phase 5 — The session-facing branch (tasks.md §6.1–6.3)

Contract phase entry: `contract-data.json → execution.phases[4]`, title "The session-facing branch", risk **medium**, prereq "new: the trunk-side entry point", files `commands/next.md`, `commands/status.md`, `tests/commands.test.js`.

**This is the only phase that does not touch `src/`.** It is entirely command-file text plus the static assertions that hold that text. Nothing it changes can be observed by the CLI suite; the tests are file-content pins.

## Gates (Phase 5)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Three files, each with a concrete change: `commands/next.md:3` (append `, AskUserQuestion` to the `allowed-tools` line) and `:28-38` (the `## Task` section gains the `SELECT A DOCKET:` branch, verbatim staying the default); `commands/status.md:2,14-22,31-33` (the trunk fleet view — description, the "`status` is `next` minus the NEXT block" comment, and the "Then stop / do not infer the next leg" paragraph); `tests/commands.test.js` (a new case beside `:190-210` pinning both the literal and the surviving verbatim rule, and the `allowed-tools` entry). No `src/` file, no golden, no new suite file, no `DECLARED` change. |
| Pattern familiarity  | ready  | Read all five shipped command files in full — `next.md` (38 lines), `status.md` (36), `bay.md`, `new.md` (68, the Phase 4 output and the closest precedent for a Task section that branches), `cleanup.md` (the only shipped file with a numbered, conditional, multi-step Task). Read `tests/commands.test.js` end to end, `src/frontmatter.js:9-90` (why `allowed-tools` must stay one flat line), `src/waybill.js:331-350` (`renderSelect` and its comment naming `commands/next.md` as the consumer of the literal), `tests/waybill.test.js:237-250` (the renderer half of the same pin), design §5 (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:191-205`), and the change's own spec requirement *"Verbatim rendering, with one keyed exception"* (`openspec/changes/new-bay-and-fleet/specs/command-surface/spec.md:142-158`). |
| Dependency awareness | ready  | `commands/next.md` — consumed by → Claude Code's loader by convention, `tests/commands.test.js` `DECLARED:32-42` (which puts it under `shipped()` equality `:112`, `problems()` `:116`, `scratch()` `:99`, the plugin-root sweep `:159-169`, and the no-model sweep `:206-209`), and acceptance criteria 13 and 14. `commands/status.md` — the same five sweeps, plus it is the file `scratch()`'s three negative cases mutate (`:121,137,145`), so its *name* is load-bearing there but its *contents* are not. Nothing in `src/`, `bin/`, or any other suite reads either file. `src/waybill.js:348` owns the `SELECT A DOCKET:` string the branch keys on and `tests/waybill.test.js:238` already pins it — the command file becomes the second half of a two-sided pin. `src/cli.js` `USAGE`'s `status` row is pinned by `tests/commands.test.js:326` and is **not** the same string as `commands/status.md:2`'s `description`; nothing asserts the two agree. |
| Edge case coverage   | ready  | Twenty concrete items below, including the design's own internal contradiction about how the re-run is spelled (verified against the `allowed-tools` line and the pitwall finding), the frontmatter parser's refusal of list syntax, and the exit-2 visibility question that only a live session can answer. |
| Test strategy        | ready  | Measured on this tree today at `1ce2528`: `node --test tests/commands.test.js` **0.19s / 19 pass** (the whole inner loop for this phase — tasks.md §0 already names it), `npm test` **46.6s → 368 pass / 0 fail**, **432 TAP ok** (criterion 0's floor is 372). `verify.mjs` run in full today: **pass=14 fail=2 judgment=1**, and the two failures are exactly criteria 13 and 14 — this phase's gates, confirmed red before the work. Every boundary check (8, 9, 10, 11, 15) passes today and must still pass; none of them can be disturbed by a phase that edits no `src/` file. |

## Key Patterns (Phase 5)

- `commands/next.md:3` — `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)`. One flat comma-separated line. Criterion 13 is `grep -qE '^allowed-tools:.*AskUserQuestion' commands/next.md` — line-anchored, so the tool name must be **on this line**, not in the HTML comment above it.
- `commands/next.md:28-38` — the `## Task` section as it stands: three paragraphs. `:30-31` is the verbatim rule ("Show the block above to me **verbatim** — same lines, same order, same glyphs"). `:33-35` is "Then stop", with the reason (the waybill belongs to the *next* session). `:37-38` is the `IGNORED BY GIT` clause. Design §5's prescribed branch is: *"If the block contains `SELECT A DOCKET:`, ask which docket, then re-run … and show that block verbatim. Otherwise show the block verbatim and stop."*
- `commands/new.md:41-67` — the Phase 4 precedent for a Task section that does more than stop: it states the exception, names the rule it is inverting, and gives the failure path (`:57-60`) in one line. Same register for `next.md`'s branch.
- `commands/cleanup.md` `## Task` — the only shipped file with numbered conditional steps and fenced command blocks the session is expected to run. Note its habit: when the session cannot act, it *prints the command and asks the operator to re-run the slash command* rather than improvising.
- `src/waybill.js:331-350` — `renderSelect`. Its doc comment already names `commands/next.md` as the consumer: *"`SELECT A DOCKET:` is an exact literal rather than prose: `commands/next.md` keys its one exception to the verbatim rule on finding it, so rewording the heading silently turns the selection prompt off."* The heading is built at `:348` via `docketBlock('SELECT A DOCKET:', dockets)`, and the block's last line is `` `${INDENT}waybill next <branch>` ``.
- `tests/golden/select.txt` — the exact block a session will see: header `main · 3 dockets open`, blank line, `SELECT A DOCKET:`, three padded branch lines, blank line, `  waybill next <branch>`.
- `tests/waybill.test.js:237-240` — *"carries the exact literal `commands/next.md` branches on"*. The renderer half. The new commands-suite case is the command-file half; together they are the two-sided pin the contract's criterion 14 greps for.
- `tests/commands.test.js:190-210` — the **shape to copy** for §6.1's test: assert the command file against a *derived* value rather than a second hard-coded literal, so the two sides cannot drift. `tests/commands.test.js:9` already imports from `../src/waybill.js`, so `renderSelect` is importable there and the assertion can be "the heading `renderSelect` actually emits appears in `commands/next.md`" instead of a repeated string.
- `tests/commands.test.js:152-169` — the `${CLAUDE_PLUGIN_ROOT}` sweep. It inspects **only** lines beginning `` !` ``. Prose elsewhere in the file is unpinned by it.
- `src/frontmatter.js:70-90` — the parser throws on an indented line, a `- ` list item, a block scalar, or a duplicate key. `tests/commands.test.js:116` runs it over every declared file. `allowed-tools` therefore **must** stay a single `key: value` line.
- `src/cli.js:240-264` — what `status` actually prints now: on the trunk, `renderFleet(trunkName(state), fleet(root, bookings), inspection)` and exit 0; inside a bay, `renderPosition(state, inspection)`, unchanged. Chosen by where the operator stands, not by a flag.
- `README.md:99` — the wording already shipped for this verb: *"Where this docket stands, or the whole fleet from the trunk"*. `README.md:143-145` — *"`waybill status` takes no options; the fleet view is chosen by where you stand, not by a flag."*

## Dependencies (Phase 5)

- `commands/next.md` — consumed by → the Claude Code loader (by convention; `.claude-plugin/plugin.json` declares no `commands` key and `tests/commands.test.js:228-230` asserts it stays that way), `tests/commands.test.js` `DECLARED` and its five sweeps (`:112`, `:116`, `:99`, `:159-169`, `:206-209`), and acceptance criteria **13** and **14**. No `src/` module, no other suite, and no README line reads it.
- `commands/status.md` — consumed by → the same five sweeps. Additionally, `scratch()`'s three negative cases (`:121`, `:137`, `:145`) rename or overwrite `status.md` inside a throwaway copy: they depend on the file *existing* and being copyable, never on its text. Editing its prose cannot red them.
- `src/waybill.js:348` (`SELECT A DOCKET:`) — consumed by → `tests/waybill.test.js:238`, `tests/cli.test.js:216,231,391`, `tests/golden/select.txt:3`, and (after this phase) `commands/next.md`. Criterion 14 greps `src/` for it as well as the command file, so the renderer side must not be reworded while the command side is written.
- `tests/commands.test.js` — consumed by → `tests/index.js:11` only. No new suite file is added; `tests/index.js` needs no edit.
- `src/cli.js` — **not a dependency of this phase and must not be edited.** Criterion 15 (no `is not inside a git repository` in its diff) and `tests/commands.test.js:326` (the `status` USAGE row, byte-exact) both sit on it, and the contract's file list for this phase excludes it.
- `README.md` — already rewritten in Phase 3 to describe the fleet view and the exit contract (`:93-146`). Nothing in §6 asks for a README change, and no test reads it.

## Conventions (re-verified at `1ce2528`)

- Unchanged from Phases 1–4.
- **Command-file register**: frontmatter → an HTML comment explaining *why* the frontmatter is what it is → `# Waybill: <verb>` → an HTML comment explaining the `!` line → the `!` line → `## Task`. Prose is second person, addressed to the model, with the operator as "me". Every rule states its reason; nothing is asserted without a because.
- **The one rule that outranks the others**: the block is shown verbatim. Both `next.md:30-31` and `status.md:28-29` spell it identically, and `src/waybill.js:335` names it as the thing the exact literal exists to protect. Phase 5 adds the first exception in the tool's history — it stays keyed on a string match, never on judgment.
- **`model:`/`effort:` remain absent** from `next.md` and `status.md`; `tests/commands.test.js:206-209` sweeps every declared non-`spec/`, non-`new.md` file for both.

## Edge Cases for Phase 5

1. **The design contradicts itself about how the re-run is spelled, and this is the phase's central decision.** Design `:197-198` prescribes re-running `waybill next <branch>`; design `:203-204` asserts *"The second invocation needs no new permission — `allowed-tools: Bash(node:*)` already covers it"*. Both cannot hold: `waybill next feat/x` prefix-matches none of `Bash(node:*)`, `Bash(test:*)`, `Bash(echo:*)`, and a marketplace plugin install never runs `npm link` (`README.md:74-76`), so the `waybill` binary may not exist on PATH at all. The permission claim is only true if the re-run is spelled `node "<plugin root>/src/cli.js" next <branch>`. Resolve toward the node spelling; the printed `waybill next <branch>` line stays what the *operator* is told, not what the session runs.
2. **Naming the plugin root in prose is unpinned and may be unsubstituted.** `3d42e07`'s commit message says Claude Code *"rewrites the literal out of a command body"* — a command body, not merely the `!` line — which suggests a `${CLAUDE_PLUGIN_ROOT}` in the Task section does resolve. But `tests/commands.test.js:159-169` only sweeps lines beginning `` !` ``, so a prose `${CLAUDE_PLUGIN_ROOT:-}` would slip through the one test that exists to prevent exactly that bug. Two safe routes: (a) phrase the re-run as "the same command as the `!` line above, with the branch appended", which needs no path literal at all; (b) spell it and widen the sweep to every line containing the token. Do not spell it and leave the sweep narrow.
3. **The whole branch depends on a block from an exit-2 command reaching the session.** `waybill next` on an ambiguous trunk exits 2 (`src/cli.js:212`), and the shipped `if … then node …; else echo …; fi` compound propagates that exit status to the `!` invocation. Whether Claude Code surfaces the stdout of a non-zero `!` line is not observable from this repository — it is the same class of question as §7.2's stderr finding, and it is worth recording alongside it in Phase 6 rather than guessing here.
4. **`allowed-tools` must stay one flat line.** `src/frontmatter.js:70-76` throws on `- ` list items and on indentation, and `tests/commands.test.js:116` parses every declared file. Append `, AskUserQuestion` to `commands/next.md:3`; do not reformat it into a YAML list.
5. **Criterion 13's regex is line-anchored and case-sensitive**: `^allowed-tools:.*AskUserQuestion`. The tool name in an HTML comment does not satisfy it — that is stated in the criterion's own `expect`. Note `commands/new.md:20-23` already discusses `AskUserQuestion` in prose; that file is not what criterion 13 greps and does not make this work done.
6. **Criterion 14 has three parts and one is already green**: `grep -q 'SELECT A DOCKET' commands/next.md` (red today), `grep -rq 'SELECT A DOCKET' src/` (green — `src/waybill.js:334,348`), and `node --test tests/commands.test.js` (green today, must stay green with the new case). Both greps omit the trailing colon; the command file should still carry the full `SELECT A DOCKET:` so it matches what `renderSelect` emits.
7. **Pin the literal by derivation, not by a second hard-coded string.** `tests/commands.test.js:190-210` set the precedent for exactly this problem (`new.md` vs the booking): assert `commands/next.md` contains the heading `renderSelect` actually produces. A repeated literal is a second place to state the same routing, free to drift from the first — and drift is the failure `src/waybill.js:335` warns about.
8. **"The surviving verbatim rule" is half of §6.1's verification.** The new test must assert both that the branch exists *and* that verbatim is still the default — a test that only greps the new literal would pass on a file whose verbatim rule had been deleted.
9. **`next.md:33-35`'s "Then stop" reasoning becomes conditional, not false.** The handover argument still holds for every ordinary waybill; it does not hold for a selection block, which hands off nothing. Rewrite so a reader sees one rule with one keyed exception, not two contradictory rules.
10. **The re-run must show the *second* block verbatim, and only that.** Spec `:156-158`: ask, re-run against that branch, show the result verbatim. A session that summarises the second block, or shows both, has broken the rule the exception was carved out of.
11. **The re-run can itself fail.** `next <branch>` exits 2 with `no bay for <branch> — cut one with \`waybill bay <branch>\`` (`src/cli.js:190-196`) when the named branch has no bay — reachable if a bay is removed between the two invocations, or if the session mistypes the branch. The instruction should say to show that verbatim too, and not to loop back into another prompt.
12. **The options offered must come from the block's own list, never invented.** The branch names are in the printed block; a session that guesses a branch name will hit edge case 11. A fleet larger than one prompt can comfortably present needs a stated fallback (ask in plain text) rather than a truncated list presented as complete.
13. **§6.3's content is not spelled out anywhere.** tasks.md `:137` says only "Update `commands/status.md` for the trunk fleet view". The concrete gaps in the file today: `:2`'s description says "Where this docket stands, without the waybill" (`README.md:99` already words it "or the whole fleet from the trunk"); `:15` says "`status` is `next` minus the NEXT block", which is still true but says nothing about the two answers; `:31-33`'s "Do not infer what the next leg's command would be" now needs to also mean "do not offer to run `next` for a docket in the list".
14. **Do not touch `src/cli.js`'s `USAGE` while aligning the description.** `tests/commands.test.js:326` matches `/^ {2}status +Where this docket stands, without the waybill$/m` against `bin/waybill --help`, and `src/cli.js` is not in this phase's file list. The `.md` description and the `USAGE` row are allowed to differ; nothing asserts they agree.
15. **`status` inside a bay is unchanged** (`src/cli.js:263`, spec `:98-100`). The command file must not read as though the fleet were the only answer — the answer depends on where the operator stands.
16. **Trunk warnings are already branch-prefixed** (`src/waybill.js:306-310`, rendered as `⚠ <branch>: <text>`). If `status.md` says anything about relaying warnings, it should note the branch is already named in the line rather than asking the session to attribute them itself.
17. **Both files' `!` lines are byte-pinned** by `tests/commands.test.js:152-169` and must not be retouched while editing around them — including the `if … fi` shape, which is a known pre-existing finding (`docs/ideation/pitwall/run-2026-08-24.json:64`) and out of this change's scope.
18. **`DECLARED` does not change in this phase.** No command file is added or renamed; `tests/index.js` needs no edit; `tests/fixtures/` is untouched.
19. **`commands/next.md` has no `argument-hint` and its `!` line passes no `$ARGUMENTS`.** Making `/waybill:next feat/x` work directly would change the pinned `!` line and is not in §6 — out of scope.
20. **Phase 6 (tasks.md §7) owns the full-suite verification and the stderr finding.** Criterion 17 is judgment-only and stays uncounted until a human looks; do not attempt to close it here.

## Risks (Phase 5)

- **The re-run spelling is the one genuinely undesigned decision, and getting it wrong fails silently in exactly the way the phase exists to prevent** (edge case 1). If the session is told to run `waybill next <branch>`, it hits either a permission prompt or a missing binary, and the operator sees the selection block followed by nothing. The design asserts both the wrong spelling and the permission claim that only the right spelling satisfies. Whatever is chosen, state the reason in the file the way `new.md:20-23` states its own.
- **Every test this phase can write is a static text assertion.** Nothing in the suite can prove a session actually branches on the literal, asks, and re-runs — the tests prove the *file says so*. The real verification is a live session, which makes this phase's honest boundary the same one §7.2 draws. Say so in the commit rather than implying the pins are behavioural.
- **The verbatim rule gaining a branch is the design's own stated main risk** (`openspec/changes/new-bay-and-fleet/design.md:52-55`). The mitigation is already chosen — an exact string match, verbatim as the default — and the phase's job is to not weaken it while writing the exception.
- **Exit 2 and block visibility** (edge case 3) is unverifiable from here and unaddressed by any criterion. If a non-zero `!` line's stdout is suppressed, both this branch and the already-shipped zero-docket pointer are invisible in a session. Record it alongside the §7.2 finding.
- **Decision-log check against reality**: eight of nine entries hold at `1ce2528`. Entry 6 is load-bearing and verified — `src/inference.js:113` still reads `/waybill:start` and the zero-diff criterion passes. Entry 5's `fleet-empty.txt` exists; entry 9's `dockets` array is intact; entries 2, 3, 4, 7 are all shipped as stated. **One contradiction, and it is inert**: entry 8 rejects parallel phases because *"Every phase edits `src/cli.js`"* — this phase's own file list (`commands/next.md`, `commands/status.md`, `tests/commands.test.js`) contains no `src/` file, and criterion 15's note already concedes "edited by five of six phases". The decision itself still stands (this phase's prereq is shipped, and there is nothing left to parallelise it against), so the mismatch changes no plan — but the stated reason is not universally true, and a reader who trusts it will expect a `src/cli.js` diff that must not appear.

## Verification (Phase 5)

```bash
# inner loop — the whole phase
node --test tests/commands.test.js         # 0.19s / 19 pass today

# phase acceptance gates — both confirmed FAILING (exit 1) against this tree today
# criterion 13 — AskUserQuestion on the allowed-tools line itself
grep -qE '^allowed-tools:.*AskUserQuestion' commands/next.md
# criterion 14 — the literal in both the renderer and the command file, suite green
grep -q 'SELECT A DOCKET' commands/next.md && grep -rq 'SELECT A DOCKET' src/ && node --test tests/commands.test.js

# all seventeen checks at once — pass=14 fail=2 judgment=1 today, the two failures being the above
node ~/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/new-bay-and-fleet/contract-data.json

# section boundary
npm test                                   # 46.6s — expect 368+ pass, 0 fail
node --test --test-reporter=tap tests/ 2>/dev/null | grep -cE '^ *ok '   # >= 372 (432 today)

# boundary checks — all green today, and a phase that edits no src/ file cannot move them
MB=$(git merge-base main HEAD)             # 08d0c6f
git diff --quiet $MB -- src/inference.js
git diff --quiet $MB -- src/legs.js src/bookings.js src/frontmatter.js src/inspection.js src/progress.js src/openspec.js
git diff --quiet $MB -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt tests/golden/refine.txt tests/golden/status.txt tests/golden/no-docket.txt
! git diff $MB -- src/cli.js | grep -q 'is not inside a git repository'
git diff --stat src/ tests/golden/          # expect empty — this phase touches neither
```

Measured on this tree today at `1ce2528`: `npm test` → **368 pass / 0 fail**, 46.6s, **432 TAP ok**. `verify.mjs` → **commits=6/6 pass=14 fail=2 judgment=1**, the two failures being criteria 13 and 14 — this phase's gates, red as they should be before implementation.
