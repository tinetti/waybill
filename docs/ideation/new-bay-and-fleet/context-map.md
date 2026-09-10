# Context Map: new-bay-and-fleet

**Phase**: 4 — `new`: the trunk-side entry point (tasks.md §5)
**Gates**: 5/5 ready
**Verdict**: GO

> Repository root for every path below: `/Users/tinetti/.openclaw/workspaces/rick/projects/waybill/.claude/worktrees/waybill-feat-new-bay-and-fleet`. Paths are repo-relative from here on so this map stays portable.

> This map was started in Phase 1 and is extended, not replaced. Phases 1–3 are retained verbatim below; Phase 4's sections begin at **Phase 4 — `new`**.

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

# Phase 4 — `new`: the trunk-side entry point (tasks.md §5.1–5.6)

Contract phase entry: `contract-data.json → execution.phases[3]`, title "new: the trunk-side entry point", risk **medium**, prereq "The exit contract and trunk dispatch", files `src/cli.js`, `commands/new.md`, `tests/fixtures/no-docket.js`, `tests/waybill.test.js`, `tests/cli.test.js`, `tests/commands.test.js`, `README.md`.

## Gates (Phase 4)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Seven files, each with a concrete change: `src/cli.js` (a `USAGE` row at `:13-27`, a handler beside `status():238`, a `['new', …]` entry in the `COMMANDS` Map at `:345-349`), **new file** `commands/new.md` (frontmatter with `model`/`effort`, the `!` line, a `## Task` that invokes rather than stops), `tests/commands.test.js` (`DECLARED:32-41` gains `'new.md'` before `'next.md'`; a routing pin beside `:171-187`), `tests/cli.test.js` (a `describe('waybill new')` beside `:362`), `tests/waybill.test.js:155-168` (re-point the golden's description/wiring at `new`), `tests/fixtures/no-docket.js:3-13` (its doc comment still describes the golden as what the trunk printed), `README.md:67` and `:96-99`. |
| Pattern familiarity  | ready  | Read all four shipped command files in full (`next.md`, `status.md`, `bay.md`, `cleanup.md`) plus `commands/spec/propose.md:1-6` — the only shipped files that *do* declare `model:`/`effort:`, which is the shape `new.md` follows. Read `src/cli.js` end to end, `tests/commands.test.js` end to end (`DECLARED`, `shipped()`, `problems()`, `scratch()`, the `${CLAUDE_PLUGIN_ROOT}` spelling check `:151-169`, the routing pin `:171-187`), `tests/waybill.test.js:117-191`, `tests/cli.test.js:1-100,160-200,362-460`, `bookings/ideation-ideate.md` in full, and design §§1, 6 (`docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md:76-90,207-238`). |
| Dependency awareness | ready  | `run()`/`COMMANDS` — consumed by `bin/waybill:12`, `tests/cli.test.js:7`, and the four command files' `!` lines. `tests/golden/no-docket.txt` — consumed by `tests/waybill.test.js:156` and `:164-167` **only** (`tests/cli.test.js` reads just `specs.txt:87` and `status.txt:369`). `tests/fixtures/no-docket.js` — consumed by `tests/waybill.test.js:12` only. `DECLARED` — consumed by six cases in `tests/commands.test.js` including `scratch():97-105`. The `waybill new` literal already exists at `src/cli.js:205`, `README.md:130`, `tests/cli.test.js:188`. `USAGE`'s `status` row is additionally pinned by `tests/commands.test.js:303`. `README.md` has no automated consumer. |
| Edge case coverage   | ready  | Twenty concrete items below, several established by running code today rather than by reading: the in-a-bay resolution (`refine`, index 3, `docketOpen: true`), the header a forced leg-1 state produces from a bay (`feat/x · no docket open`), and the byte-exact CLI composition that reproduces the golden. |
| Test strategy        | ready  | Measured on this tree today at `22e30ef`: `node --test tests/commands.test.js` **0.18s**, `node --test tests/waybill.test.js` **2.8s**, `node --test tests/cli.test.js` **13.3s** (it has grown from Phase 3's 5.7s — the tasks.md §0 table is stale), `npm test` **45.8s → 359 pass / 0 fail**, **422 TAP ok** (criterion 0 floor is 372). Phase 4's three acceptance probes (criteria 5, 6, 7) were each executed against this tree and **all three exit 1**; criterion 11 (`no-docket.txt` byte-unchanged) passes today and must still pass after. Criteria 0, 8, 9, 10, 15 all pass today. `verify.mjs` is present at `/Users/tinetti/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs`. |

## Key Patterns (Phase 4)

- `src/cli.js:13-27` — `USAGE`. Verb column is 16 characters wide (`'  bay <branch>    Create…'`, `'  next [<branch>] Where…'`, `'  status          Where…'`); descriptions start at column 19. Criterion 5 counts `grep -cE '^  (new|bay|next|status) '` and demands **4** — it is **3** today, and the regex requires at least one space *after* the verb, so `  new` with its description on the next line fails the gate.
- `src/cli.js:238-262` — `status(cwd, args, io)`, the option-free verb: `if (args.length > 0)` → `waybill: unknown option \`${args[0]}\` for \`status\`` + `USAGE` to **stderr**, exit 2; then `repoRoot`, `resolveBookings`, `resolveLeg`, `checkIgnored`, render, exit 0. The nearest template for `new`.
- `src/cli.js:345-349` — `const COMMANDS = new Map([['bay', bay], ['next', next], ['status', status]])`. `new` is a **JavaScript reserved word**, so the handler function cannot be named `new`; the Map *key* stays the string `'new'`, which is what criterion 6's `grep -q "\['new'" src/cli.js` anchors on.
- `src/cli.js:198-221` — the trunk path `new` reproduces. `resolveLeg(cwd, bookings)` with `docketOpen === false` returns leg 1: `src/inference.js:117` (`done.fill(false)`) forces `leg: 'ideate'`, `index: 1`, `completed: []`, `skipped: []`, and `:138` forces `changeId: null`. **Verified live today**: composing `renderWaybill(resolveLeg(dir, resolveBookings(dir, KNOWN_LEGS)), checkIgnored(dir, paperPaths(bookings)))` over `noDocketFixture()` produced a string **byte-identical** to `tests/golden/no-docket.txt`, with the inspection coming back `{"ignored":[],"warnings":[]}`.
- `src/inference.js:66-76` — the no-repository early return, the one place in the tree that hand-builds a leg-1 `Inference` (`leg: LEGS[0].id, index: 1, completed: [], skipped: [], booking: bookings.get(LEGS[0].id), branch: null, docketOpen: false, changeId: null, warnings`). It is the shape to copy for the in-a-bay case — **copy it into `src/cli.js`, do not export a new helper from `src/inference.js`** (criterion 8 is a zero-diff on that file).
- `commands/status.md` — the no-argument command-file template: `description` + `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)` frontmatter, an HTML comment explaining *why* there is no `model:`/`effort:`, the `!` line, then `## Task`. `commands/new.md` inverts the model comment and the "then stop" instruction, and keeps everything else.
- `commands/spec/propose.md:1-6` — `description`, `model: opus`, `effort: high`, `allowed-tools:`. The frontmatter shape `new.md` follows, and the one already pinned by a routing test.
- The `!` line, shipped in all three node-driven commands verbatim except the verb: `` !`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" <verb>; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi` ``. The spelling is pinned by `tests/commands.test.js:151-169`.
- `tests/commands.test.js:32-41` — `DECLARED`, sorted. `'new.md'` sorts **before** `'next.md'` (`w` < `x`), and `shipped(COMMANDS)` is `deepEqual`'d against it in both directions at `:111`.
- `tests/commands.test.js:171-187` — "keeps the vendored routing commands byte-identical to what they encode": `parseFrontmatter(fs.readFileSync(file))` then `assert.equal(meta.model, …)`. The template for §5.3's pin, with one change: assert `commands/new.md`'s values against `bookings/ideation-ideate.md`'s *parsed* values, not against literals, or a rebooking reds the test for the wrong reason and the spec's "the command now disagrees with the booking" scenario goes untested.
- `bookings/ideation-ideate.md:1-7` — `leg: ideate`, `command: /ideation:brainstorm`, `model: opus`, `effort: high`, `handover: transfer`, `stampCmd: false`. Its body is the prose in `tests/golden/no-docket.txt:8-14`.
- `tests/waybill.test.js:155-168` — the two assertions that hold the golden: `assertGolden('no-docket', renderWaybill(resolve(noDocketFixture().dir), CLEAN))` at `:156`, and the byte-identity with `ideate.txt` at `:164-167`. (tasks.md §5.1 cites `:118` and `:121-129`; those line numbers are stale after Phases 2 and 3 — same two assertions, moved.)
- `tests/cli.test.js:61-78` (`cli(argv, cwd)`) and `:164-167` (`trunkWith(...branches)`) — the harnesses every new CLI case goes through.

## Dependencies (Phase 4)

- `src/cli.js:359` (`run`) / `:345` (`COMMANDS`) — consumed by → `bin/waybill:12`, `tests/cli.test.js:7`, and the `!` lines in `commands/{next,status,bay}.md`. Adding a Map entry breaks nothing; `COMMANDS.get(name)` at `:376` is the only reader.
- `src/cli.js:13` (`USAGE`) — consumed by → every parse-error path in the file, `run():368,373,378`, and **`tests/commands.test.js:302-303`**, which spawns `bin/waybill --help` and matches `/^Usage: waybill <command> \[options\]$/m` and `/^ {2}status +Where this docket stands, without the waybill$/m`. Re-padding the description column is safe (`+` matches any run of spaces); rewording the `status` description is not.
- `tests/golden/no-docket.txt` — consumed by → `tests/waybill.test.js:156` and `:164-167` only. `tests/cli.test.js` reads only `specs.txt` (`:87`) and `status.txt` (`:369`), so a CLI-level assertion against `no-docket.txt` would be the third consumer and the first outside the renderer suite.
- `tests/fixtures/no-docket.js` — consumed by → `tests/waybill.test.js:12` (used at `:156` and `:165`). Nothing else imports it. Its doc comment (`:3-13`) still frames the fixture as "the state that used to report `leg 2 of 7 (bay)`" and names `tests/waybill.test.js` as the place the twin-render identity is asserted — that prose is what "re-point the fixture" means in the contract's file list.
- `tests/commands.test.js:32` (`DECLARED`) — consumed by → `:111` (both-directions equality), `:115` (frontmatter/description check), `:99` (`scratch()` copies each entry), `:159` (the `${CLAUDE_PLUGIN_ROOT}` sweep). Adding `'new.md'` puts the new file under all four automatically.
- `bookings/ideation-ideate.md` — consumed by → `loadBookings(BUILTIN_BOOKINGS)` at runtime (`src/bookings.js`), `tests/inference.test.js`'s shipped-bookings suite, and `tests/golden/{no-docket,ideate}.txt` (its body *is* their prose). Editing it changes two pinned goldens.
- The `waybill new` literal — already at `src/cli.js:205` (the zero-docket pointer), `README.md:130`, `tests/cli.test.js:188` (asserts that exact line). Phase 4 makes the pointer resolvable; none of the three needs editing.
- `README.md:67` (the slash-command list: `/waybill:bay`, `/waybill:next`, `/waybill:status`) and `:96-99` (the Commands table) — **no automated consumer**; tasks.md §5.6 says "verified by review". `README.md:143` ("All three warn…") counts verbs and becomes arguable once there are four, though `new`'s block does carry the same `IGNORED BY GIT:` section.
- `.claude-plugin/plugin.json` — declares **no** `commands` key, and `tests/commands.test.js:205-207` asserts it stays that way. `commands/new.md` is discovered by convention; do not add a key.
- `tests/index.js` — Phase 4 adds no new suite file; no edit needed.

## Conventions (re-verified at `22e30ef`, plus one inversion)

- Unchanged from Phases 1–3 — naming, ESM imports, the three error tiers, JSDoc-only types, `node:test` fixtures, no linter, renderer purity, `io.out` for exit-2 answers about the repository and `io.err` for the CLI's own parse complaints.
- **Inverted for this one file**: every shipped command file declares **no** `model:`/`effort:` and says so in a comment, because its waybill is for the *next* session. `commands/new.md` must declare both, because its waybill is for **this** session and a session cannot switch its own model (design `:243-251`, spec "Requirement: `new` runs at the model and effort its booking names"). The comment block in `new.md` should state that inversion explicitly, the way `next.md:6-9` states the rule it is inverting.
- **Also inverted**: `next.md`, `status.md` and `bay.md` all end with "Then stop." `new.md` shows the block and then *invokes*. Design decision 2 (`:37-40`) is the justification to cite.

## Edge Cases for Phase 4

1. **`new` is a reserved word.** `function new(...)` is a syntax error; `COMMANDS` needs `['new', someOtherName]`. Criterion 6 greps only for `['new'`, so the handler's name is free.
2. **Inside a bay, `resolveLeg(cwd)` answers for the bay, not for leg 1.** Verified today against a fixture bay: `{leg: 'refine', index: 3, branch: 'feat/x', docketOpen: true}`. `new` therefore cannot simply print `resolveLeg`'s output the way `next` does — leg 1 has to be forced.
3. **Forcing leg 1 from inside a bay leaves the bay's branch on the header.** Verified today: the forced state renders `feat/x · no docket open` as its first line, which is false — that branch does carry a docket. Decide deliberately between keeping it (and letting the warning explain), naming the trunk instead, or dropping the branch (which yields the bare `no docket open` and would *not* match the trunk golden). Neither design §6 nor the spec settles this; it is the one genuinely undesigned behaviour in the phase.
4. **The leg-1 construction must not touch `src/inference.js`.** Criterion 8 is `git diff --quiet` on that file and it passes today. Copy the shape of `src/inference.js:66-76` into `src/cli.js`; do not export a `resolveFirstLeg` from the inference module.
5. **The in-a-bay warning belongs on stdout, not stderr.** Phase 3's rule (`src/cli.js:109-118`) exists because the `!` invocation captures stdout only. Routing it through `state.warnings` puts it in the block's own `WARNINGS:` section (`withFindings`, `src/waybill.js:180`), which is both on stdout and testable by a golden-free regex. §5.4 requires exit **0** either way.
6. **`tests/golden/no-docket.txt` must stay byte-identical twice over**: criterion 11 (`git diff --quiet` against merge-base `08d0c6f`, passing today) and `tests/waybill.test.js:164-167`, which asserts it renders identically to `ideate.txt`. `UPDATE_GOLDEN=1` rewrites all fourteen goldens at once — after any regeneration run `git diff --stat tests/golden/` and expect it empty.
7. **Do not edit `bookings/ideation-ideate.md`.** Its body is the golden's prose, its `model`/`effort` is one half of §5.3's pin, and its `handover: transfer` is what produces the `/clear, then run:` line in both pinned goldens.
8. **The block `new` prints says `/clear, then run:` while `/waybill:new` invokes immediately.** That is `handover: transfer` (`src/waybill.js`'s NEXT block) meeting design decision 2 — "there is no previous leg, and a session sitting on the trunk about to ideate is already empty". `commands/new.md`'s Task section has to address it, or a session will either `/clear` (destroying the invocation) or refuse. Changing the booking to `handover: through` to dodge it would rewrite two pinned goldens.
9. **Invoking a slash command may need a permission the restrictive `allowed-tools` line does not carry.** This is precisely the failure mode §6.2 exists to prevent for `AskUserQuestion` on `next.md` (design `:203-205`: "the list is restrictive, so it must be added or the prompt is silently unavailable"). tasks.md §5.2 says nothing about it for `new.md`. Decide what the invocation actually uses and declare it on the `allowed-tools:` **line**.
10. **`commands/new.md`'s `!` line must spell the plugin root exactly `${CLAUDE_PLUGIN_ROOT}`.** `tests/commands.test.js:151-169` sweeps every `DECLARED` file's lines beginning `` !` `` and rejects any other spelling — including the defensive `${CLAUDE_PLUGIN_ROOT:-}`. Copy the shipped guard verbatim from `status.md`.
11. **Do not "fix" the shipped guard's shape.** `if [ -f … ]; then node …; else echo …; fi` does not obviously prefix-match `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)`; that mismatch is a known pre-existing finding (`docs/ideation/pitwall/run-2026-08-24.json:64`) and is out of this change's scope. Match the three shipped files.
12. **`DECLARED` sort position**: `'new.md'` goes between `'cleanup.md'` and `'next.md'`. `shipped()` returns `.sort()`ed paths and `:111` is a `deepEqual`, so a misplaced entry reds immediately.
13. **`tests/commands.test.js:303` pins the `status` usage row.** Adding a `new` row is safe; rewording `status`'s description in `USAGE` is not.
14. **`new` outside a git repository.** Every other verb calls `repoRoot(cwd, io)` first and exits 2 on null, while `resolveLeg` would happily return leg 1 with a `not a git repository` warning. Reusing `repoRoot` unchanged is the safe route — it also keeps criterion 15 (no `is not inside a git repository` string in the `src/cli.js` diff) trivially satisfied, since calling an existing function adds no such line.
15. **A CLI-level golden comparison for `new` is available and byte-exact** — verified today over `noDocketFixture()`, whose inspection is `{ignored: [], warnings: []}`. Keep the renderer-level assertion at `tests/waybill.test.js:156` as well; the two answer different questions ("the renderer still produces this" vs "the verb still routes here").
16. **Add no file under `tests/fixtures/`.** `tests/inference.test.js:70-73` asserts `readdirSync(FIXTURES).length === LEGS.length + 1` and the directory holds exactly 8 files today. The contract lists `tests/fixtures/no-docket.js` as *modified*, not new. Build repositories with `createRepo`/`addWorktree` (`tests/helpers/repo-fixture.js:69,120`).
17. **`new` takes no options, and there is no `new --json`.** `NEXT_FLAGS` (`src/cli.js:33`) is `next`-only, and the "no second machine-readable surface" rule (`src/cli.js:229-231`) argues against adding one. Rejecting every argument the way `status` does is the consistent choice; nothing in the spec requires it, so state the choice in the JSDoc.
18. **`new` on a trunk with bays open still prints leg 1's waybill and exits 0.** Design §1's route table gives `new` the same answer in all four columns. It must not acquire an exit-contract branch of its own — `next`'s exit contract is about issuing a waybill *for a docket*, and `new` has none.
19. **Phase 5 (tasks.md §6) owns `commands/next.md` and `commands/status.md`.** Do not add the `SELECT A DOCKET:` branch or `AskUserQuestion` here; criteria 13 and 14 are Phase 5's gates and are expected to stay red through Phase 4.
20. **`src/inference.js:113`'s stale `/waybill:start` comment stays stale** (decision-log entry 5, tasks.md §2.6). It is inside the file criterion 8 pins to a zero diff.

## Risks (Phase 4)

- **The in-a-bay header is the one undesigned output in this phase** (edge case 3). Whatever is chosen, pin it with a CLI case so the choice is recorded somewhere a future reader will run.
- **The slash command's invocation permission is unstated** (edge case 9). The design names the problem for `next.md` and the contract turns it into criterion 13; nothing does the same for `new.md`, and an undeclared tool fails *silently*. This is the most likely way Phase 4 ships something that passes every check and does not work in a session.
- **Forcing leg 1 tempts a change to `src/inference.js`.** A `resolveFirstLeg(bookings)` export would be the obvious refactor and would red criterion 8 — the check on the whole approach, per design §Decisions and decision-log entries 2 and 5.
- **`UPDATE_GOLDEN=1` is the fastest way to break criterion 11.** The golden must survive this phase byte-for-byte; it passes today, and the CLI composition that reproduces it has been verified, so any diff means the ideate waybill was altered by accident.
- **tasks.md §0's inner-loop table is stale.** `tests/cli.test.js` is **13.3s** on this tree, not 5.4s, and `npm test` is **45.8s**, not 36.5s — Phase 3's cases roughly doubled the CLI suite. `tests/commands.test.js` (0.18s) is the real inner loop for §5.2, §5.3 and §5.6.
- **tasks.md §5.1's line references are stale** (`tests/waybill.test.js:118` and `:121-129`). The assertions are now at `:156` and `:159-168`. Same facts, moved by Phases 2 and 3.
- **No decision-log contradiction found for Phase 4.** All nine entries in `contract-data.json → decisions` were re-checked against the tree at `22e30ef`. Entry 5 is directly load-bearing and still holds: the deliberately stale `/waybill:start` comment is still at `src/inference.js:113` and the zero-diff check passes. Entry 7 (sequential phases because every phase edits `src/cli.js`) holds — Phase 4 edits it again. Entry 4's `fleet-empty.txt` and entry 1's rename-first are both shipped. Entry 8's `dockets` array is intact at `src/cli.js:126-144`.

## Verification (Phase 4)

```bash
# inner loop
node --test tests/commands.test.js         # 0.18s — DECLARED, the routing pin, the plugin-root spelling
node --test tests/waybill.test.js          # 2.8s  — no-docket.txt and its ideate.txt twin
node --test tests/cli.test.js              # 13.3s — the new verb, the in-a-bay warning, usage

# phase acceptance gates — 5, 6 and 7 confirmed FAILING (exit 1) against this tree today
# criterion 5 — the usage block lists exactly the four verbs (3 today)
test "$(node bin/waybill nosuchverb 2>&1 | grep -cE '^  (new|bay|next|status) ')" = 4 && ! node bin/waybill nosuchverb 2>&1 | grep -qE '^  start '
# criterion 6 — the dispatch table registers bay and new, never start
grep -q "\['bay'" src/cli.js && grep -q "\['new'" src/cli.js && ! grep -q "\['start'" src/cli.js
# criterion 7 — the command files match the new surface
test ! -e commands/start.md && test -e commands/bay.md && test -e commands/new.md
# criterion 11 — PASSES today and must still pass after the re-point
git diff --quiet $(git merge-base main HEAD) -- tests/golden/no-docket.txt

# all sixteen checks at once
node ~/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/new-bay-and-fleet/contract-data.json

# section boundary
npm test                                   # 45.8s — expect 359+ pass, 0 fail
node --test --test-reporter=tap tests/ 2>/dev/null | grep -cE '^ *ok '   # >= 372 (422 today)
MB=$(git merge-base main HEAD)             # 08d0c6f today
git diff --quiet $MB -- src/inference.js
git diff --quiet $MB -- src/legs.js src/bookings.js src/frontmatter.js src/inspection.js src/progress.js src/openspec.js
git diff --quiet $MB -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt tests/golden/refine.txt tests/golden/status.txt tests/golden/no-docket.txt
! git diff $MB -- src/cli.js | grep -q 'is not inside a git repository'
git diff --stat tests/golden/              # expect empty — no golden may move in this phase
```

Measured on this tree today at `22e30ef`: `npm test` → **359 pass / 0 fail**, 45.8s, **422 TAP ok**. Every boundary check above passes; criteria 5, 6 and 7 fail, as they should before implementation; criterion 11 passes and is a regression guard rather than a gate to turn green.
