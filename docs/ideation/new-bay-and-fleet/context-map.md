# Context Map: new-bay-and-fleet

**Phase**: 6 — Verification and the stderr finding (tasks.md §7)
**Gates**: 5/5 ready
**Verdict**: GO

> Repository root for every path below: `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-new-bay-and-fleet`. Paths are repo-relative from here on so this map stays portable.

> This map was started in Phase 1 and is extended, not replaced. Phases 1–5 are retained verbatim below; Phase 6's sections begin at **Phase 6 — Verification and the stderr finding**.

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

## Phase 3 outcome (verified at `22e30ef`)

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

## Phase 4 outcome (verified at `1ce2528`)

- `commands/new.md` exists (68 lines): `model: opus`, `effort: high`, `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), SlashCommand, Skill` (`:5`), the shipped `!` guard with verb `new` (`:39`), and a `## Task` (`:41-67`) that shows the block verbatim, then runs the command the `NEXT:` block names, explicitly overriding the `/clear, then run:` line (`:51-55`), reporting an unresolvable command (`:57-60`), and relaying `WARNINGS`/`IGNORED BY GIT`.
- `tests/commands.test.js:190-210` — *"runs `new` at the model and effort the ideate booking names, and nothing else at any"*: `new.md`'s `model`/`effort` asserted against `bookings/ideation-ideate.md`'s **parsed** values, plus the inversion sweep over every other declared non-`spec/` file.
- `DECLARED` is nine entries with `'new.md'` between `'cleanup.md'` and `'next.md'` (`tests/commands.test.js:32-42`).
- Criteria 5, 6, 7 now **pass**; criterion 11 still passes; all boundary checks still green.
- Baseline after the phase: `npm test` → **368 pass / 0 fail**, **432 TAP ok**, 46.6s.

---

# Phase 5 (retained) — The session-facing branch (tasks.md §6.1–6.3)

**Gates**: 5/5 ready · **Verdict**: GO · **Shipped as** `405139b` ("feat: give the session a branch to take when the trunk cannot choose")

Contract phase entry: `contract-data.json → execution.phases[4]`, title "The session-facing branch", risk **medium**, prereq "new: the trunk-side entry point", files `commands/next.md`, `commands/status.md`, `tests/commands.test.js`.

**This is the only phase that does not touch `src/`.** It is entirely command-file text plus the static assertions that hold that text. Nothing it changes can be observed by the CLI suite; the tests are file-content pins.

## Gates (Phase 5)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Three files, each with a concrete change: `commands/next.md:3` (append `, AskUserQuestion` to the `allowed-tools` line) and `:28-38` (the `## Task` section gains the `SELECT A DOCKET:` branch, verbatim staying the default); `commands/status.md:2,14-22,31-33` (the trunk fleet view — description, the "`status` is `next` minus the NEXT block" comment, and the "Then stop / do not infer the next leg" paragraph); `tests/commands.test.js` (a new case beside `:190-210` pinning both the literal and the surviving verbatim rule, and the `allowed-tools` entry). No `src/` file, no golden, no new suite file, no `DECLARED` change. |
| Pattern familiarity  | ready  | Read all five shipped command files in full — `next.md` (38 lines), `status.md` (36), `bay.md`, `new.md` (68, the Phase 4 output and the closest precedent for a Task section that branches), `cleanup.md` (the only shipped file with a numbered, conditional, multi-step Task). Read `tests/commands.test.js` end to end, `src/frontmatter.js:9-90` (why `allowed-tools` must stay one flat line), `src/waybill.js:331-350` (`renderSelect` and its comment naming `commands/next.md` as the consumer of the literal), `tests/waybill.test.js:237-250` (the renderer half of the same pin), design §5 (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:191-205`), and the change's own spec requirement *"Verbatim rendering, with one keyed exception"* (`openspec/changes/new-bay-and-fleet/specs/command-surface/spec.md:142-158`). |
| Dependency awareness | ready  | `commands/next.md` — consumed by → Claude Code's loader by convention, `tests/commands.test.js` `DECLARED:32-42` (which puts it under `shipped()` equality `:112`, `problems()` `:116`, `scratch()` `:99`, the plugin-root sweep `:159-169`, and the no-model sweep `:206-209`), and acceptance criteria 13 and 14. `commands/status.md` — the same five sweeps, plus it is the file `scratch()`'s three negative cases mutate (`:121,137,145`), so its *name* is load-bearing there but its *contents* are not. Nothing in `src/`, `bin/`, or any other suite reads either file. `src/waybill.js:348` owns the `SELECT A DOCKET:` string the branch keys on and `tests/waybill.test.js:238` already pins it — the command file becomes the second half of a two-sided pin. `src/cli.js` `USAGE`'s `status` row is pinned by `tests/commands.test.js:326` and is **not** the same string as `commands/status.md:2`'s `description`; nothing asserts the two agree. |
| Edge case coverage   | ready  | Twenty concrete items below, including the design's own internal contradiction about how the re-run is spelled (verified against the `allowed-tools` line and the pitwall finding), the frontmatter parser's refusal of list syntax, and the exit-2 visibility question that only a live session can answer. |
| Test strategy        | ready  | Measured at `1ce2528`: `node --test tests/commands.test.js` **0.19s / 19 pass**, `npm test` **46.6s → 368 pass / 0 fail**, **432 TAP ok**. `verify.mjs`: **pass=14 fail=2 judgment=1**, the two failures being criteria 13 and 14 — this phase's gates, confirmed red before the work. |

## Key Patterns (Phase 5)

- `commands/next.md:3` — `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)`. One flat comma-separated line. Criterion 13 is `grep -qE '^allowed-tools:.*AskUserQuestion' commands/next.md` — line-anchored, so the tool name must be **on this line**, not in the HTML comment above it.
- `commands/next.md:28-38` — the `## Task` section as it stood: three paragraphs. `:30-31` the verbatim rule, `:33-35` "Then stop" with its reason, `:37-38` the `IGNORED BY GIT` clause.
- `commands/new.md:41-67` — the Phase 4 precedent for a Task section that does more than stop: it states the exception, names the rule it is inverting, and gives the failure path in one line.
- `commands/cleanup.md` `## Task` — the only shipped file with numbered conditional steps and fenced command blocks. When the session cannot act, it *prints the command and asks the operator to re-run the slash command* rather than improvising.
- `src/waybill.js:331-350` — `renderSelect`. Its doc comment already names `commands/next.md` as the consumer of the exact literal. The heading is built at `:348` via `docketBlock('SELECT A DOCKET:', dockets)`, and the block's last line is `` `${INDENT}waybill next <branch>` ``.
- `tests/golden/select.txt` — the exact block a session will see.
- `tests/waybill.test.js:237-240` — the renderer half of the two-sided pin.
- `tests/commands.test.js:190-210` — the **shape to copy**: assert the command file against a *derived* value rather than a second hard-coded literal.
- `tests/commands.test.js:152-169` — the `${CLAUDE_PLUGIN_ROOT}` sweep. It inspects **only** lines beginning `` !` ``.
- `src/frontmatter.js:70-90` — the parser throws on an indented line, a `- ` list item, a block scalar, or a duplicate key.
- `README.md:99` / `:143-145` — the wording already shipped for this verb.

## Dependencies (Phase 5)

- `commands/next.md` — consumed by → the Claude Code loader (by convention; `.claude-plugin/plugin.json` declares no `commands` key and `tests/commands.test.js:228-230` asserts it stays that way), `tests/commands.test.js` `DECLARED` and its five sweeps, and acceptance criteria **13** and **14**.
- `commands/status.md` — consumed by → the same five sweeps, plus `scratch()`'s three negative cases (`:121`, `:137`, `:145`), which depend on the file existing, never on its text.
- `src/waybill.js:348` (`SELECT A DOCKET:`) — consumed by → `tests/waybill.test.js:238`, `tests/cli.test.js:216,231,391`, `tests/golden/select.txt:3`, and now `commands/next.md`.
- `tests/commands.test.js` — consumed by → `tests/index.js:11` only.
- `src/cli.js` — **not a dependency of this phase and must not be edited.**

## Conventions (re-verified at `1ce2528`)

- Unchanged from Phases 1–4.
- **Command-file register**: frontmatter → an HTML comment explaining *why* the frontmatter is what it is → `# Waybill: <verb>` → an HTML comment explaining the `!` line → the `!` line → `## Task`. Prose is second person, addressed to the model, with the operator as "me". Every rule states its reason; nothing is asserted without a because.
- **The one rule that outranks the others**: the block is shown verbatim. Phase 5 adds the first exception in the tool's history — keyed on a string match, never on judgment.
- **`model:`/`effort:` remain absent** from `next.md` and `status.md`.

## Edge Cases for Phase 5

1. **The design contradicts itself about how the re-run is spelled** — resolve toward `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next <branch>`; the printed `waybill next <branch>` line stays what the *operator* is told.
2. **Naming the plugin root in prose is unpinned** — the sweep at `tests/commands.test.js:159-169` only inspects `` !` `` lines.
3. **The whole branch depends on a block from an exit-2 command reaching the session.** Not observable from this repository — same class as §7.2's stderr finding; record it alongside in Phase 6.
4. **`allowed-tools` must stay one flat line.**
5. **Criterion 13's regex is line-anchored and case-sensitive.**
6. **Criterion 14 has three parts and one was already green.**
7. **Pin the literal by derivation, not by a second hard-coded string.**
8. **"The surviving verbatim rule" is half of §6.1's verification.**
9. **`next.md`'s "Then stop" reasoning becomes conditional, not false.**
10. **The re-run must show the *second* block verbatim, and only that.**
11. **The re-run can itself fail** (`no bay for <branch>` at `src/cli.js:195`).
12. **The options offered must come from the block's own list, never invented.**
13. **§6.3's content is not spelled out anywhere.**
14. **Do not touch `src/cli.js`'s `USAGE` while aligning the description.**
15. **`status` inside a bay is unchanged.**
16. **Trunk warnings are already branch-prefixed.**
17. **Both files' `!` lines are byte-pinned.**
18. **`DECLARED` does not change in this phase.**
19. **`commands/next.md` has no `argument-hint`.**
20. **Phase 6 (tasks.md §7) owns the full-suite verification and the stderr finding.**

## Risks (Phase 5)

- **The re-run spelling was the one genuinely undesigned decision.** Resolved toward the `node` spelling, with the reason stated in the file.
- **Every test this phase could write is a static text assertion.**
- **The verbatim rule gaining a branch is the design's own stated main risk** (`openspec/changes/new-bay-and-fleet/design.md:52-55`).
- **Exit 2 and block visibility** (edge case 3) is unverifiable from here — carried into Phase 6.
- **Decision-log check**: entry 8's stated reason ("Every phase edits `src/cli.js`") is not universally true — Phase 5's file list contains no `src/` file. Inert, but flagged.

## Phase 5 outcome (verified at `405139b`)

- `commands/next.md` is now **81 lines**. `:3` reads `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion`. `:10-14` is a new HTML-comment paragraph explaining why the tool must be on the line. `:43-78` is the exception: keyed on `**If the block contains the literal \`SELECT A DOCKET:\`**` (`:45`), three numbered steps (`:50`, `:56`, `:68`), the fenced re-run spelled `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next <branch>` (`:59-61`) with the "Not `waybill next <branch>`" reason (`:63-66`), the `no bay for <branch>` failure path (`:72-74`), and the will-not-run fallback (`:76-78`). Verbatim stays the default at `:36-37`.
- `commands/status.md` is now **53 lines**. `:2`'s description is `"Where this docket stands, or the whole fleet from the trunk"`. `:19-22` explains the two answers chosen by where the operator stands. `:36-39` forbids re-sorting/condensing the fleet listing. `:41-45` extends "Then stop" to "do not offer to run `next` for a docket in the listing". `:47-50` notes trunk warnings already name their branch.
- Criteria 13 and 14 now **pass**.
- Baseline after the phase: `npm test` → **370 pass / 0 fail**, **434 TAP ok**.

---

# Phase 6 — Verification and the stderr finding (tasks.md §7.1–7.2)

Contract phase entry: `contract-data.json → execution.phases[5]`, title "Verification and the stderr finding", risk **low**, prereq "The session-facing branch", files **`openspec/changes/new-bay-and-fleet/design.md`** and **`openspec/changes/new-bay-and-fleet/tasks.md`** — and nothing else.

**This is the only phase that touches neither `src/` nor `tests/` nor `commands/`.** §7.1 is a verification run whose result is already known and green; §7.2 is a live-session investigation whose *answer* is the deliverable. The whole diff is markdown inside the OpenSpec change.

## Gates (Phase 6)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Two files, each with a concrete change, both named by the contract: `openspec/changes/new-bay-and-fleet/tasks.md:141-150` — the only two unticked boxes out of 28 — tick 7.1 and 7.2 and write the finding into 7.2's body; `openspec/changes/new-bay-and-fleet/design.md:61-64` — the Risks bullet whose text still says *"→ Verify during implementation and record the finding"*, plus `:73-77` Open Questions, which already promises the answer lands "as a task output". No `src/`, no `tests/`, no `commands/`, no golden, no README. |
| Pattern familiarity  | ready  | Read `design.md` (77 lines), `proposal.md` (52), `tasks.md` (150) end to end; the approved design's origin of the question (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:107-111`) and its Out-of-scope entry (`:289-290`); the contract's in-scope entry (`contract.md:57`), out-of-scope entry (`:71`) and future consideration (`:72`); the requirement whose stated *reason* is the claim under test (`specs/command-surface/spec.md:42-48`); the three shipped restatements of that reason (`src/cli.js:112-125`, `README.md:142-143`, `spec.md:47-48`). Both file registers are clear: design bullets are **bold claim → prose → `→` mitigation**; tasks are `- [x] N.N <imperative> — verified by <the artifact that proves it>`. |
| Dependency awareness | ready  | `tasks.md` is read at runtime by `src/progress.js:67` (`openspec/changes/<id>/tasks.md`, checkbox regex `:12`, counted `:48-58`) and by the real `openspec` CLI (`/opt/homebrew/bin/openspec`, present) via `src/openspec.js`; ticking the last two boxes takes this change from 26/28 to 28/28 and changes what `waybill next` reports for this very docket. **No test reads the real file** — `tests/bookings.test.js:128-166` and `tests/inspection-gitignore.test.js:141-148` build their own, and every suite neutralises the CLI with `withPath(pathWithout('openspec'))`. `verify.mjs:426-432` matches a commit whose *body* contains the phase's `specPath`; already **6/6 ok**. `design.md` has no mechanical consumer at all. `openspec validate new-bay-and-fleet --strict` exits **0** today and is the one command that reads both files. |
| Edge case coverage   | ready  | Sixteen concrete items below, several established by running code rather than reading it: the exact non-git stream split (stdout empty, stderr one line, exit 2), the fact that waybill **0.3.1 is installed user-scope** so a live probe needs no install of this branch, and the three out-of-scope files that restate the reason the finding could contradict. |
| Test strategy        | ready  | Measured on this tree today at `405139b`: `npm test` **47.2s → 370 pass / 0 fail**; `node --test --test-reporter=tap tests/ 2>/dev/null \| grep -cE '^ *ok '` → **434** (criterion 0's floor is 372); `openspec validate new-bay-and-fleet --strict` → *"Change 'new-bay-and-fleet' is valid"*, exit 0; `verify.mjs` → **commits=6/6 pass=16 fail=0 judgment=1**, the single judgment being criterion 17, this phase's deliverable. All four `git diff --quiet` boundary checks green. Nothing here is red-first, and that is honest: this phase writes no code, so there is no failing test to make pass. |

## Key Patterns (Phase 6)

- `openspec/changes/new-bay-and-fleet/design.md:50-64` — **Risks / Trade-offs**. Four bullets, each `**bold claim.**` then prose then `→ mitigation`. `:61-64` is the stderr bullet and the natural home of the finding: *"**Stdout versus stderr for the non-zero cases is asserted, not verified.** … → Verify during implementation and record the finding; the pre-existing bug is fixed separately, not folded in here."* Once the answer exists, that `→` clause is what changes.
- `openspec/changes/new-bay-and-fleet/design.md:73-77` — **Open Questions**: *"None. … the one investigation it defers (stderr capture, above) is recorded as a task output rather than a question, because its answer changes neither the specs nor the approach."* Already written to accommodate the answer; it needs no restructuring, only consistency with whatever the finding says.
- `openspec/changes/new-bay-and-fleet/tasks.md:141-150` — the two remaining boxes, and the only unticked ones in the file (28 checkboxes total, 26 `[x]`). §7.2 already carries the **procedure** verbatim: *"run a waybill command from a non-git directory inside a session via the `` ! `` invocation and record whether `repoRoot`'s `is not inside a git repository` text reaches the transcript."*
- The task-line register the previous 26 established: `- [x] N.N <imperative sentence> — verified by <the artifact that proves it>`, with multi-line prose indented two spaces. §7.2 is already the longest entry in the file and is the right place for the recorded answer.
- `docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:107-111` — the origin: *"Both non-zero cases print to **stdout** … because the `` ! `` invocation in `commands/next.md` is the primary consumer and stderr capture there is unverified. Verify this during implementation: if stderr is not captured, `repoRoot`'s existing 'not a git repository' error (`src/cli.js:50-56`) is already invisible inside a session."*
- **The observable, measured today (read-only)**: from a non-git directory, `node <root>/src/cli.js next` prints **nothing** on stdout and exactly one line on stderr — `waybill: <cwd> is not inside a git repository — run waybill from a repository checkout` — and exits **2**. So the session-side result is binary and unambiguous: the `!` expansion is either that line or empty.
- **A live probe does not require installing this branch.** `~/.claude/plugins/installed_plugins.json` lists `waybill@tinetti` **0.3.1**, user scope, at `~/.claude/plugins/cache/tinetti/waybill/0.3.1`. Its `commands/next.md:3` carries the same restrictive `allowed-tools` line, its `:26` the same `if [ -f … ]; then node …; else echo …; fi` `!` line, and its `src/cli.js:54` the identical error string. Whatever that install does is the answer for the shipped tool.
- `src/cli.js:451-453` — the main-module guard, so `node src/cli.js next` (the `!` line's exact spelling, not `bin/waybill`) does self-execute and reproduces the above.
- `docs/ideation/pitwall/run-2026-08-24.json:64` — the adjacent, already-recorded finding about the same `!` line: nothing in `Bash(node:*), Bash(test:*), Bash(echo:*)` prefix-matches a command whose first word is `if`, so *"the operator gets a permission prompt (or, non-interactively, no block at all)"*. A probe that sees **nothing** cannot distinguish "stderr not captured" from "the `!` line was never permitted to run" — the two failure modes look identical and must be separated in the write-up.

## Dependencies (Phase 6)

- `openspec/changes/new-bay-and-fleet/tasks.md` — consumed by → `src/progress.js:63-70` (reads it directly and counts checkboxes) and `src/openspec.js` via the real `openspec` CLI, both of which feed this repository's own `waybill next`/`status` progress line; `verify.mjs:426-432`'s COMMITS check (matches a commit body containing the path — already satisfied 6/6); `openspec validate --strict`. **No test in `tests/` reads it.**
- `openspec/changes/new-bay-and-fleet/design.md` — consumed by → `openspec validate --strict` only. No test, no `src/` module, no README line.
- **The claim the finding may contradict is restated in three files that are NOT in this phase's list**: `src/cli.js:115-116` (`noWaybill`'s doc comment — *"The primary consumer is the `` ! `` invocation in `commands/next.md`, which captures stdout only"*), `openspec/changes/new-bay-and-fleet/specs/command-surface/spec.md:47-48` (*"Non-zero cases SHALL print to standard output rather than standard error, because the primary consumer captures stdout only"*), and `README.md:142-143`.
- `docs/ideation/new-bay-and-fleet/context-map.md` is **tracked on this branch** (added in the Phase-1..5 diff, 379 lines). Persisting this extended map is a real, committed change and shows up in the phase's diffstat.
- `commands/` is untouched — and must be: `tests/commands.test.js:99-115` asserts `shipped(commands/)` equals `DECLARED` exactly, so any probe command file dropped in there reds the suite.

## Conventions (re-verified at `405139b`)

- Unchanged from Phases 1–5.
- **The change's documents never restate the approved design** (`design.md:1-13` says so explicitly, and decision-log entry 1 is that decision). The finding belongs in the change as a *result*, not as a re-derivation of the question.
- **Every claim in these documents carries its reason.** A recorded finding should say what was run, where, what was observed, and what it implies for the deferred fix — not just "captured" or "not captured".
- **The deferred fix stays deferred.** `contract.md:71` (out of scope) and `:72` (future consideration) both say so, and criterion 15 mechanically enforces it.

## Edge Cases for Phase 6

1. **§7.1 is already satisfied and the honest move is to run it, not assume it.** `npm test` → 370 pass / 0 fail; TAP ok = 434 ≥ 372; `git diff --quiet <merge-base> -- tests/golden/{ideate,contract,specs,execute,cleanup,complete,refine,status}.txt` and `-- tests/golden/no-docket.txt` both exit 0. The only golden with a diff against `08d0c6f` is `tests/golden/bay.txt` (one line, the `/waybill:start` → `/waybill:bay` rename from §2.5) — that is expected and is deliberately excluded from criterion 10's list.
2. **The `!`-invocation probe cannot be run from this session's cwd unaided.** The session's cwd is a git worktree, `repoRoot` reads `process.cwd()`, and the `!` line takes no directory argument. A faithful probe must either change the session's cwd or wrap the invocation (`(cd <non-git dir> && node …)`) inside a purpose-built command file.
3. **A purpose-built probe command must not go in `commands/`.** `tests/commands.test.js` `DECLARED` is an exact-equality check. `.claude/commands/` in this worktree is untracked (`git status` shows `?? .claude/`) and already holds `opsx/`, so it is the safe home — but `.gitignore` only lists `node_modules/` and `.claude/worktrees/`, so an untracked probe file is **one `git add -A` away from being committed**. Delete it before committing, and never stage with `-A`.
4. **A probe that sees nothing is ambiguous.** Per the pitwall finding, an unpermitted `if …` `!` line also produces no block. Run a control — the same `!` line writing to **both** streams (`sh -c 'echo OUT; echo ERR 1>&2'`) — so "the mechanism ran" and "stderr survived it" are separated. Record the control alongside the result.
5. **Exit status is a second confound.** The non-git case exits **2**, and the shipped `if … fi` compound propagates it. If the transcript shows nothing, it may be the non-zero exit suppressing the expansion rather than the stream. This is Phase 5's edge case 3, still open, and §7.2's write-up is the place it finally gets recorded.
6. **If the answer is "stderr IS captured", three out-of-scope files now carry a false *reason*.** `spec.md:47-48`, `src/cli.js:115-116`, `README.md:142-143`. The *requirement* survives either way (stdout is correct regardless), but the stated because does not. Do not edit them in this phase — `src/cli.js` is excluded by the contract's file list and guarded by criterion 15 and `tests/commands.test.js:326`; `spec.md` is not in the file list and `openspec validate --strict` currently passes. Record the discrepancy in `design.md` and, if warranted, add it to the change's future considerations.
7. **If the answer is "stderr is NOT captured", the pre-existing `repoRoot` bug is confirmed real** — and it still must not be fixed here. Criterion 15 (`! git diff <merge-base> -- src/cli.js | grep -q 'is not inside a git repository'`) is exactly the tripwire for that temptation, and it passes today.
8. **Criterion 17 is judgment-only and stays uncounted.** `verify.mjs` prints it and never scores it (`verify.mjs:377-384`). A green `verify.mjs` run does **not** mean §7.2 is done; a human confirms it. Do not treat `pass=16 fail=0` as completion.
9. **Ticking the boxes changes this repository's own waybill output.** `src/progress.js` parses `tasks.md`; 26/28 becomes 28/28, and the `execute` leg reads as complete. Expected, not a defect — but it means running `waybill next` here after the edit gives a different answer than before it.
10. **`src/progress.js:14-42` strips fenced code blocks before counting.** Any example checkbox written inside a fence in §7.2's write-up is correctly ignored; an *unclosed* fence swallows the rest of the file and undercounts. Close every fence.
11. **`openspec validate new-bay-and-fleet --strict` must still exit 0 after the edits.** It is the only mechanical check on these two files and it passes today.
12. **`verify.mjs`'s COMMITS check matches on commit *body*, not path.** All six phases share one `specPath`, so it is already 6/6 — but keeping the convention (naming `openspec/changes/new-bay-and-fleet/tasks.md` in the commit body) costs nothing and preserves the signal.
13. **Do not regenerate goldens.** `UPDATE_GOLDEN=1` is still the fastest way to red criteria 10 and 11, and this phase has no reason to invoke it at all.
14. **`design.md:73-77` says "Open Questions: None".** After the finding, that stays true — the answer was always meant to be a task output. Do not open a new question section; do not leave `:61-64`'s "Verify during implementation" imperative standing next to a recorded answer.
15. **The context map itself is tracked.** Persisting this extended Phase-6 map writes `docs/ideation/new-bay-and-fleet/context-map.md`, which will appear in the phase diff alongside the two OpenSpec files. Expected.
16. **The last-phase temptation is scope creep.** README polish, the `if … fi` guard rewrite (pitwall `:64`), the stale `src/inference.js:113` comment (decision-log entry 6, criterion 8) and the `repoRoot` fix are all explicitly out of scope and each has a criterion or a decision-log entry saying so.

## Risks (Phase 6)

- **§7.2's answer may not be obtainable, and the honest output then is a recorded limitation rather than a guess.** The probe needs a live Claude Code session whose cwd is a non-git directory, invoking a slash command whose `!` line runs the CLI. That is available in principle — waybill 0.3.1 is installed user-scope with the same `!` line and the same error string — but it needs either a cwd change or an untracked probe command file, and a null result is ambiguous (edge cases 4 and 5). Criterion 17's `judgment` text demands the answer be *"established by running the command from a non-git directory in a live session"*; if that cannot be done, say so plainly in `design.md` and `tasks.md` and leave 7.2 unticked rather than ticking it on inference. A false "recorded" here is exactly the kind of claim the criterion exists to catch.
- **The finding can falsify a rationale shipped in three files this phase may not edit** (edge case 6). Record the discrepancy; do not chase it.
- **Everything in §7.1 is already green, which makes this the easiest phase to fake.** Run the four `git diff --quiet` checks, `npm test`, the TAP count and `verify.mjs` and paste real numbers into the commit body; the `- [x] … — verified by` convention is worth nothing if the "verified by" was not executed.
- **Nothing mechanical guards `design.md`.** `openspec validate --strict` checks structure, not prose. A finding written badly — or written into the wrong file — will pass every check and still fail the reviewer.
- **Decision-log check against reality (all nine entries, at `405139b`)**: entries 1, 2, 3, 4, 5, 6, 7 and 9 all hold and are verified — `src/inference.js:113` still reads `/waybill:start` and criterion 8 is green (entry 6); `tests/golden/bay.txt` is the only changed golden (entry 2); `fleet-empty.txt` exists (entry 5); `next --json`'s `dockets` array is intact at `src/cli.js:129-140` (entry 9); the boundary criteria all use `git diff --quiet` (entry 3) and all four behavioural probes pass (entry 4). **One contradiction, carried forward from Phase 5 and now stronger**: entry 8 rejects parallel phases because *"Every phase edits `src/cli.js`."* Phase 5 edited no `src/` file, and Phase 6 edits no `src/`, `tests/` or `commands/` file at all — its entire diff is markdown. Two of six phases contradict the stated reason. The decision itself remains inert (the sequence is finished and there is nothing left to parallelise), but a reader who trusts that reason will expect a `src/cli.js` diff from this phase that must not appear, and criterion 15's note *"src/cli.js is edited by five of six phases, so this is not vacuous"* is now off by one on the other side too. Worth a line in the write-up.

## Verification (Phase 6)

```bash
# §7.1 — the full suite and the golden boundary
npm test                                                                   # 47.2s → 370 pass / 0 fail today
node --test --test-reporter=tap tests/ 2>/dev/null | grep -cE '^ *ok '     # 434 today; criterion 0's floor is 372

MB=$(git merge-base main HEAD)                                             # 08d0c6f
git diff --quiet $MB -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt \
  tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt \
  tests/golden/refine.txt tests/golden/status.txt                          # criterion 10
git diff --quiet $MB -- tests/golden/no-docket.txt                         # criterion 11
git diff --quiet $MB -- src/inference.js                                   # criterion 8
git diff --quiet $MB -- src/legs.js src/bookings.js src/frontmatter.js \
  src/inspection.js src/progress.js src/openspec.js                        # criterion 9
! git diff $MB -- src/cli.js | grep -q 'is not inside a git repository'    # criterion 15 — the fix must not ride along
git diff --stat $MB -- src/ tests/ commands/                               # expect UNCHANGED from the pre-phase state

# §7.2 — the CLI half, already measured (read-only, non-git cwd)
#   stdout: empty       stderr: waybill: <cwd> is not inside a git repository — run waybill …       exit: 2
# The session half needs a live Claude Code session; run a control writing to BOTH streams from the
# same `!` mechanism so "not captured" and "never ran" (pitwall run-2026-08-24.json:64) are distinguishable.

# the change's own documents
openspec validate new-bay-and-fleet --strict                                # "Change 'new-bay-and-fleet' is valid" today

# all seventeen checks at once
node ~/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/new-bay-and-fleet/contract-data.json
#   today: commits=6/6 pass=16 fail=0 judgment=1 — the judgment is criterion 17, this phase's deliverable, and
#   verify.mjs never scores it. Green here does NOT mean §7.2 is done.
```

Measured on this tree today at `405139b`: `npm test` → **370 pass / 0 fail**, 47.2s, **434 TAP ok**. (This is the pre-phase run; `tasks.md` §7.1 records the phase's own separate run of the same suite at the same commit — same 370 / 0 / 434, 46.5s. Two runs, differing only in wall time.) `openspec validate --strict` → valid. `verify.mjs` → **commits=6/6 pass=16 fail=0 judgment=1**. Every mechanical criterion in the contract is green before this phase starts; the only thing left in the whole change is the recorded stderr finding.
