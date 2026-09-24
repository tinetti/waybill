# Context Map: waybill-work-laptop

**Phase**: 3
**Gates**: 5/5 ready
**Verdict**: GO

---

## Phase 3 (current)

Explored inline rather than by the `ideation:scout` subagent: this phase executed inside a subagent,
where no `Agent` tool is available. The skill's "scout unregistered" fallback was followed — the
spec's pattern paths and every Modified File were read, analogues read for the new files, and the
blast radius of each modified file grepped.

### Gates

| Gate                 | Status | Evidence                                                                                                                                                                                                 |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Three new files and nine modified, each with a concrete edit. Every line citation in the spec was checked against the tree; all were accurate except `src/cli.js:588` (the `COMMANDS` map, correct) and the omission noted under Risks. |
| Pattern familiarity  | ready  | Read `src/help.js` whole (the padded-column construction at `:89-96` is what the renderer copies), `src/cli.js:352-360` (`help`, the handler shape doctor follows because it calls no `repoRoot`), `commands/status.md` (byte-for-byte the guard and wrapper shape), `src/openspec.js:12-19` (the `spawnSync` options and timeout), `src/signals.js:124-141` (`HOME` from `env`, never `os.homedir()`). |
| Dependency awareness | ready  | Three pinned lists gate a new command, not the two the spec names — see Risks. `configuredBookingsDir` gains `src/doctor.js` as its second consumer beside `resolveBookings`. `src/cli.js` gains one import; nothing imports `src/doctor.js` but the CLI. |
| Edge case coverage   | ready  | `spec-phase-3.md:703-737` enumerates nine error scenarios and sixteen failure modes; all are covered by the 31 cases in `tests/doctor.test.js`, plus one invariant case the spec does not list (every `fail`/`warn` carries a `fix`; `ok`/`info` carry none). |
| Test strategy        | ready  | `package.json:15` declares one script (`node --test tests/`); no justfile, no ESLint config, no tsconfig — tests are the whole gate, as the spec states at `:743`. Inner loop `node --test tests/doctor.test.js` (~18s); forced surfaces `tests/commands.test.js tests/bang-lines.test.js tests/help.test.js tests/guide.test.js`. |

### Key Patterns (Phase 3)

- `src/help.js:89-96` — `width`/`pad` over `[...text].length`, computed from the rows. `renderDoctor` copies this exactly; the details carry em dashes, so the code-point count matters.
- `src/help.js:115-120` — the `renderHelp` precedent for catching a malformed overlay and reporting `error.message.split('\n')[0]` rather than aborting. Check 6 does the same.
- `src/cli.js:352-360` (`help`) — the handler shape for a verb that calls no `repoRoot`: reject every argument with exit 2 and the usage banner on stderr, then print. `status` at `:314-338` is the wrong model here, because it resolves a repository first.
- `src/openspec.js:12-17` — `{ cwd, encoding: 'utf8', timeout, windowsHide: true }`, the spawn options every doctor probe reuses. `:18` is where ENOENT and a non-zero exit are collapsed into one `false` — the conflation check 5 exists to avoid, and the reason doctor does not import `openspecAvailable`.
- `tests/helpers/repo-fixture.js` — `tempRoot()` :53, `stubBin(name, script)` :149, `withPath` :166, `withEnv` :185 (an `undefined` value unsets), `pathWithout(name)` :210, `writeFile` :224. `withEnv`/`withPath` mutate the live `process.env`, so a probe reading `process.env` at call time sees the override — which is why `runChecks(cwd, env = process.env)` must not snapshot at module load.
- `tests/commands.test.js:32-43` (`DECLARED`) and `:112` — `assert.deepEqual(shipped(COMMANDS), DECLARED)` fails in both directions, so neither half of shipping a command can be forgotten.
- `tests/commands.test.js:20-31` — the measured reason `.claude-plugin/plugin.json` must not gain a `commands` key: with a file-path array, nested commands stop resolving and all four `commands/spec/*.md` silently unregister. Confirmed unchanged by this phase.

### Dependencies (Phase 3)

- `src/bookings.js:116` (`configuredBookingsDir`) — was module-private; now exported. Consumed by → `resolveBookings` :145 and `src/doctor.js` (check 6).
- `src/doctor.js` — consumed by → `src/cli.js` only (`runChecks`, `renderDoctor`).
- `src/cli.js` `USAGE` — consumed by → `tests/help.test.js:119-126` and `tests/guide.test.js:82` (both parse the Commands block), and `tests/guide.test.js:200` (every `--flag` in Options must appear in the reference page). Doctor adds no flag, so only the Commands rows moved.
- `src/help.js` `OUTRO` COMMANDS block — consumed by → `tests/help.test.js:203-211`, which asserts every USAGE token has a row. Adding the USAGE row without the COMMANDS row fails.
- `commands/doctor.md` — consumed by → `tests/commands.test.js` (`DECLARED`, the description assertion, the `${CLAUDE_PLUGIN_ROOT}` spelling sweep, the no-`model:`/`effort:` inversion), `tests/bang-lines.test.js` (the pinned `invoking` list and the wrapper sweep), and `tests/guide.test.js:191` (`/waybill:doctor` must appear in `docs/guide/03-reference.md`).

### Risks (Phase 3)

- **A third pinned list the spec does not name.** `tests/help.test.js:256-283` pins the usage banner by row *count* (`before.length + 1`), not only by content. The spec names `DECLARED` and `invoking` as the two forced edits; this is a third, and it fails before any doctor test runs. Handled — see `implementation-notes-phase-3.html`.
- **The spec's last manual check expects the wrong exit code.** `CLAUDE_CONFIG_DIR=/tmp/nope node bin/waybill doctor` exits 1, not 0, because check 4 reads the four `/spec:*` commands out of the *same* config directory. The code is right and the expectation overlooked the shared input; recorded in the notes rather than softened.
- **`node bin/waybill doctor` on this laptop is not `all clear`.** It reports one `WARN`: the `waybill` on PATH resolves inside the plugin cache rather than the working tree (`npm link` not in force here). Exit 0, so the acceptance check passes, and the row is doctor correctly reporting the gap phase 1 left open.
- **Phase 5 lands second and re-blesses `tests/golden/help.txt` against this phase's page.** The golden now carries the `waybill doctor` COMMANDS row and `the verbs` in `INTRO[0]`. Phase 5's golden diff will show both already present — expected, not a regression. `MAX_LINES = 45` still has room: the page is 42 lines.
- **Checks 3 and 4 assume the stock route**, as the spec states at `:328-335`. Phase 7's work overlay rebooks legs 5 and 6 onto `/ideation:*`, and a machine running only that overlay needs neither `openspec` nor `~/.claude/commands/spec/`. This laptop keeps both, so both pass honestly here. If doctor ever grows overlay awareness, these two checks are the first it should govern.

---

## Phase 2 (retained from the prior map)

### Gates

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                              |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Four files, each with a concrete edit: `src/bookings.js` (:114, :259-270, :299-329), `src/repo.js` (:30-32, :134), `tests/bookings.test.js` (:195 rewritten + new cases), `tests/repo.test.js` (`describe('resolveBayPath is configurable')` at :102-166). Every line citation in the spec was checked against the tree and is accurate. |
| Pattern familiarity  | ready  | Read `src/repo.js:19-32` (`configPath` and its "git owns the expansion" rationale), `src/bookings.js:299-329` (`evaluateBooking`'s warnings shape), `src/inference.js:21,28-29` (collected-in-place `warnings`), `src/waybill.js:242-247` (the `WARNINGS:` sink), and the git-tier tilde precedent at `tests/bookings-overlay.test.js:155-169`. |
| Dependency awareness | ready  | Full blast radius mapped below and one spec claim sharpened: `stampedByCmd` has **zero** `src/` consumers today — only `tests/bookings.test.js:186-204`. `evaluateBooking` has exactly one (`src/inference.js:28`). `configuredBayDir` reaches the test fixture via `resolveBayPath`. |
| Edge case coverage   | ready  | `spec-phase-2.md:310-331` enumerates six error scenarios and seven failure modes; five further cases found during exploration are listed under Risks (stale wording in `tests/waybill.test.js`, trim-after-expand ordering, `WAYBILL_BOOKINGS_DIR` not neutralised by the fixture, the `signals.js` citation, Phase 5 overlap). |
| Test strategy        | ready  | `package.json:15` declares one script (`node --test tests/`); no `justfile`, no ESLint config, no `tsconfig.json` (glob returned nothing), confirming "no lint, typecheck or build" at `spec-phase-2.md:335`. Inner loop `node --test tests/bookings.test.js tests/repo.test.js`; regression guards `tests/bookings-overlay.test.js tests/bay.test.js tests/inference.test.js`. |

### Key Patterns (Phase 2)

- `src/repo.js:19-32` — `configPath(cwd, key)` → `tryGit(cwd, ['config','--type=path','--get',key])`, returning `null` on any git failure. The JSDoc at :22-24 states the rule Fix B reuses: git owns `~` expansion so Waybill does not grow "a second, worse opinion about what a home directory is." Routing `waybill.baydir` here is a one-line substitution for `tryGit(cwd, ['config','--get','waybill.baydir'])` at :134.
- `src/repo.js:13-17` — `tryGit` spawns git with **no `env` override**, so it inherits `process.env`. Confirmed: a test's `withEnv({ HOME: tempRoot() })` does reach git's `--type=path` expansion, and the fixture's module-level `GIT_CONFIG_GLOBAL=/dev/null` (`tests/helpers/repo-fixture.js:14-16`) still applies. The spec's assumption at :242-243 holds.
- `src/bookings.js:299-329` — `evaluateBooking`. `label = booking.path ?? '<leg>'` (:302); the inline message to replace is `const reason = …` / `warnings.push(...)` at :320-321. Note `checked && done` at :328 — a booking with neither stamp is not-done.
- `src/bookings.js:246-257` — `runStamp` already returns the three-way `{ran, notFound, status}`. `status === null` (spawn error **or** timeout) collapses to `{ran:false, notFound:false}` at :254; exit 127 to `{ran:false, notFound:true}` at :255.
- `src/inference.js:21,28-29` — `legIsDone(leg, state, bookings, warnings, progress)`; `warnings.push(...result.warnings)`. This is the collected-in-place convention the new `stampedByCmd(command, cwd, warnings = [])` mirrors.
- `src/waybill.js:244-247` — `[...warnings, ...inspection.warnings]` rendered as `WARNINGS:` + `⚠ ${text}`, "never suppressed."
- `tests/helpers/repo-fixture.js` — the playground. `tempRoot()` :53 (realpath-resolved), `createRepo()` :70, `git()` :38, `stubBin(name, script)` :149, `withPath(value, fn)` :166, `withEnv(vars, fn)` :185 (a value of `undefined` unsets), `pathWithout(name)` :210, `writeFile` :224.
- `tests/bookings-overlay.test.js:37-42` — the `isolated()` wrapper. It re-pins `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` to `/dev/null` and unsets `WAYBILL_BOOKINGS_DIR` per-case, because the fixture module only neutralises `WAYBILL_BAY_DIR`. Copy this shape for the new `WAYBILL_BOOKINGS_DIR` test in `tests/bookings.test.js`.
- `tests/bookings-overlay.test.js:155-169` — the existing git-tier tilde test. Note it writes into the operator's **real** `$HOME` under `.waybill-overlay-test/$PID` with a `finally` cleanup, rather than overriding `HOME`. Phase 2's tests take the opposite (cleaner) approach; the divergence is fine but worth being deliberate about.
- `tests/repo.test.js:102-166` — `describe('resolveBayPath is configurable')`, the block the four new cases join. :150-155 is the blank-`WAYBILL_BAY_DIR` test the spec says to extend rather than duplicate.

### Dependencies (Phase 2)

- `src/bookings.js:267-270` (`stampedByCmd`) — consumed by → **`tests/bookings.test.js:188,192,196,202` only**. No `src/` module imports it. Adding a third parameter is therefore a zero-risk signature change in-tree; the "silence still available" failure mode (`spec-phase-2.md:326`) is about the exported API surface, not any live call site.
- `src/bookings.js:299-329` (`evaluateBooking`) — consumed by → `src/inference.js:28` and `src/bookings.js:286` (`bookingIsDone`). `bookingIsDone` itself is consumed by → `tests/bookings.test.js:212-233` only.
- `src/inference.js:29` warnings — consumed by → `src/waybill.js:244-247` (`WARNINGS:` section) and the markdown renderer.
- Reworded warning text — the only downstream assertion is `tests/inference.test.js:271-289`, which matches `/broken-specs\.md/` and `/waybill-no-such-binary-xyz/`. **Both survive the rewording**; the spec's step-6 claim is verified, not assumed.
- `src/bookings.js:114` (`configuredBookingsDir`) — consumed by → `resolveBookings` :140, which is consumed by → `src/inference.js`, `src/cli.js`, `tests/bookings-overlay.test.js`, `tests/booking-swap.test.js`.
- `src/repo.js:133-136` (`configuredBayDir`) — consumed by → `resolveBayPath` :155 only, which is consumed by → `src/bay.js`, `src/cli.js`, `tests/repo.test.js`, and **`tests/helpers/repo-fixture.js:122` (`addWorktree`)**. Every fixture that adds a worktree therefore runs through the changed code path — the widest consumer of Fix B, and the reason `tests/bay.test.js` is in the regression set.
- `src/repo.js:30` (`configPath`) — currently consumed by → `src/bookings.js:114` only. Fix B adds `src/repo.js:134` as a second consumer.

### Conventions (confirmed for Phase 2)

- **Naming**: lowerCamelCase functions; private module helpers unexported and placed immediately above their caller (`runStamp` at :246 sits above `stampedByCmd` at :267). `binaryOf`/`stampWarning` belong in that same band.
- **Imports**: ESM, `node:`-prefixed builtins, relative `./` for local modules, zero dependencies. `src/bookings.js:7` is `import { checkoutRoot, configPath } from './repo.js';` — `expandTilde` goes into that existing named-import list alphabetically.
- **JSDoc**: every exported function carries a `@param`/`@returns` block plus a prose paragraph explaining *why*, often naming the failure mode avoided. Terse `// …` inline comments only where a line is non-obvious. Match this density — it is the house style, not decoration.
- **Error handling**: queries never throw; `null` means "could not answer" and is deliberately distinct from a falsy answer (`src/repo.js:5-7`, `:287-289`). Stamps never throw (`src/bookings.js:260-261`).
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, `after(cleanupAll)` at the top of every file, temp dirs from the shared fixture. Assertions are `assert.equal`/`assert.match`/`assert.throws`. Test names are full sentences describing the property, often with a `—` clause naming the bug guarded against.

### Builder notes (things the spec does not spell out)

- **`tests/bookings.test.js` imports must grow.** Today: `{ bookingIsDone, loadBookings, stampedByCmd, stampedByPath }` from `../src/bookings.js` (:6) and `{ cleanupAll, tempRoot, writeFile }` from the fixture (:7). The new cases additionally need `evaluateBooking` and `resolveBookings`, plus `createRepo`, `git`, `stubBin`, `withEnv`, `withPath`, `pathWithout`, and `LEGS` from `../src/legs.js` for the `knownLegs` set (pattern at `tests/bookings-overlay.test.js:7,24`).
- **The new `WAYBILL_BOOKINGS_DIR` test needs its own isolation.** `tests/helpers/repo-fixture.js:14-16` deletes `WAYBILL_BAY_DIR` but **not** `WAYBILL_BOOKINGS_DIR`, and it pins the git config env at module load. Wrap the case the way `isolated()` does (`tests/bookings-overlay.test.js:37-42`) so an operator's own overlay setting cannot decide the result.
- **The acceptance grep `grep -cE 'tilde|expand' tests/repo.test.js tests/bookings.test.js`** requires the literal word `tilde` or `expand` in **both** files. Test names of the form *"expands a leading `~` in …"* satisfy it; `~`-only names would not.

### Risks (Phase 2)

- **Stale wording left in `tests/waybill.test.js`.** `:305`/`:309` and `:806` hardcode `stampCmd command not found: nope` as renderer *input* strings, not as output of `evaluateBooking`. They will still pass, so the suite gives no signal — but the repo will contain two spellings of the same event. Leave them (surgical-change rule) and note it in the PR, or fix in a follow-up.
- **The `src/signals.js:130` citation is wrong.** `spec-phase-2.md:201` says `expandTilde` should read "`process.env.HOME` first, `os.homedir()` second: the same order src/signals.js:130 uses." `src/signals.js:124-141` reads `env.HOME` and explicitly **refuses** `os.homedir()` ("which is why … `HOME` comes from `env` rather than from `os.homedir()`"), returning `[]` when HOME is unset. `spec-phase-3.md:478` restates this as a rule. The spec's Error Handling row (`:317`) nonetheless does want an `os.homedir()` fallback. Implement the fallback as the JSDoc block specifies, but **do not cite `signals.js` as precedent** — write the rationale honestly.
- **Trim happens after expansion.** `configuredBayDir` (`src/repo.js:135`) and `configuredBookingsDir` (`src/bookings.js:115`) both `.trim()` the *selected* tier. Wrapping the env read in `expandTilde` before selection means `WAYBILL_BAY_DIR=' ~/bays'` (leading space) is not expanded and then trims to a literal `~/bays`. No test covers it and the spec does not mention it; an untrimmed-then-expanded ordering would close it. Low impact, worth a decision rather than an accident.
- **`stampedByCmd` has no production caller.** Fix A's user-visible effect flows entirely through `evaluateBooking` → `inference` → `waybill`. The `stampedByCmd` half is API hygiene plus the directly-tested unit. Do not let the `stampedByCmd` test alone stand as proof the phase works — the `evaluateBooking` case (spec step A.2) is the one that proves the operator sees the warning.
- **`resolveBayPath` runs inside the test fixture.** `tests/helpers/repo-fixture.js:122` calls it from `addWorktree`, so a Fix B regression breaks fixtures across many suites in confusing ways, not just `tests/repo.test.js`. Run `node --test tests/bay.test.js` early, not only at the end.
- **Phase 5 also rewrites this code, and the spec's shared-file warning omits it.** `spec-phase-5.md:106,186-187,229` changes `runStamp`'s return shape to `{ran, notFound, unknown, status, reason}` and reasons about `stampedByCmd`. The spec only names Phase 4 as the conflict risk (`:87-94`). Phase 5 must rebase on Phase 2 as well.
- **`UPDATE_GOLDEN=1` must not be run.** Verified independently: the only `stampCmd`s in `bookings/` are `false` (`bookings/ideation-ideate.md:7`, `bookings/waybill-bay.md:7`, `bookings/waybill-cleanup.md:8`), and `false` exits 1, not 127. No golden output can change.
- **Global convention conflict, informational.** `/Users/jtinetti/Projects/emre/emre-team/claude-rules/javascript.md` mandates `bun`/`bun test`. That rule belongs to the EMRE projects; Waybill is zero-dependency `node --test` on Node >= 22 (`package.json:11-15`). Use `node`, not `bun`.

---

## Phase 1 (retained from the prior map)

**Gates**: 5/5 ready — **Verdict**: GO

| Gate                 | Status | Evidence                                                                                                                                                                                                                          |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Zero repository files change; the six machine-level steps and their artifact paths are enumerated concretely at `spec-phase-1.md:64-77` and `:94-288`, each with an exact command and a check command.                            |
| Pattern familiarity  | ready  | The symlink pattern is read and verified at `README.md:332-352` (loop at 346-348); the `model:`/`effort:` frontmatter it protects is verified at `commands/spec/propose.md:1-6`; the plugin invocation pattern at `commands/status.md:33`. |
| Dependency awareness | ready  | No repository consumers exist because no repository file changes; the machine-level consumers are `src/openspec.js:12-19` (spawns the bare `openspec`), the `commands/*.md` bang lines (run `${CLAUDE_PLUGIN_ROOT}/src/cli.js`), and phases 3/6/7 per `contract.md:89-99`. |
| Edge case coverage   | ready  | `spec-phase-1.md:330-346` enumerates twelve failure modes with triggers and mitigations; the one it leaves open (worktree vs main checkout for `npm link` and the symlinks) is flagged at `:391-393` and resolved below.           |
| Test strategy        | ready  | `package.json:14-16` declares exactly one script (`node --test tests/`); no `justfile`, ESLint config, or `tsconfig.json` exists, confirming the spec's "no linter, no typechecker, no build step" claim at `:350-351`; the phase gate is the probe block at `:39-44`. |

### Key Patterns (Phase 1)

- `README.md:332-352` — the canonical `/spec:*` symlink instruction. The `ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"` loop is at 346-348; the "copying leaves two files that disagree" rationale is at 351-352 (the spec cites this as `README.md:346-347`, off by five lines — the substance is correct).
- `commands/spec/{explore,propose,apply,archive}.md` — all four exist; `propose.md:3-4` carries `model: opus` / `effort: high`, which is the model routing the symlink exists to keep single-sourced.
- `src/openspec.js:12-19` — `spawnSync('openspec', args)`; `result.error || result.status !== 0` both collapse to `{ ok: false }` at line 18 with no warning. `openspecAvailable()` at `:32-33` calls `--version` only. The spec's citation `12,31-33` points at the spawn and the availability function but not at line 18 where the swallow actually happens; the claim itself is accurate.
- `src/openspec.js:25-27,39-40` — documents that `openspec status --json` exits 1 without a change id, so `--version` exit 0 is the only valid availability proof. Matches the spec's step 3.
- `commands/status.md:33` (also `help.md:24`, `bay.md:42`, `new.md:43`) — slash commands run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"`, confirming the spec's premise at `:20-21` that the installed plugin, not PATH, is what `/waybill:*` executes.
- `package.json:7-10` — `"waybill": "bin/waybill"`, `"wyb": "bin/waybill"`. `bin/` contains only `bin/waybill`; there is no `bin/wyb`. The spec's explanation for why `wyb` does not resolve is exactly right.

### Dependencies (Phase 1)

No repository file is modified, so there is no in-repo blast radius. The machine-level dependency chain:

- `openspec` on PATH — consumed by → `src/openspec.js:12` (`spawnSync` of the bare name), which is consumed by legs 5 and 6.
- `~/.claude/commands/spec/*.md` — consumed by → the bare `/spec:propose` and `/spec:apply` the OpenSpec bookings emit (`bookings/openspec-*.md`).
- The installed plugin cache — consumed by → every `commands/*.md` bang line via `${CLAUDE_PLUGIN_ROOT}`.
- This phase as a gate — consumed by → phases 3, 6 and 7 (`contract.md:89-99`); `contract.md:43-44` makes phase 6 assert against `${CLAUDE_PLUGIN_ROOT}/src/cli.js` and `wyb` specifically.

### Machine State Verified (Phase 1)

Verified directly by the executing session (these supersede the scout's readings where they differ):

- `~/.claude/plugins/cache/tinetti/waybill/` contains **only** `0.3.1`. Confirmed — step 1 (HUMAN) not yet done.
- `~/.claude/commands/spec/` did not exist before this phase; created with four symlinks into the main checkout.
- `~/.claude/plugins/cache/ideation/ideation/0.15.0/` present.
- **Scout discrepancy, refuted.** The scout reported `~/.claude/commands/mar.md`, `~/.claude/skills/mr-review` and `~/.claude/skills/cpr` all absent, and concluded three rows of the spec's step-6 inventory were wrong. Direct checks show all three are **present**, along with 16 entries under `~/.claude/skills/`. The spec's inventory is correct as written; the scout's reading was not.
- npm global prefix is `/opt/homebrew`, bin `/opt/homebrew/bin`, both user-writable — no `sudo` needed for `npm link` or the global openspec install.
- `/opt/homebrew/bin` is **PATH position 1**; the plugin-cache waybill bin is **position 21**. The `npm link` shadowing failure mode (`spec-phase-1.md:336`) is therefore guaranteed on this machine, not merely possible.

### Conventions (Phase 1)

- **Naming**: two deliberately distinct binary names — `waybill` = installed plugin, `wyb` = npm-linked working tree. Do not collapse them.
- **Imports**: ESM (`"type": "module"`), relative paths only, zero runtime and zero dev dependencies (`README.md:362-364`).
- **Error handling**: absent external CLIs are an expected state, never a throw — `src/openspec.js:44` states the contract explicitly.
- **Types**: JSDoc on a plain `.js` codebase; no TypeScript, no `tsconfig.json`.
- **Testing**: `node --test tests/`; 17 suites in `tests/`; golden fixtures re-blessed with `UPDATE_GOLDEN=1` (`README.md:357-359`). Nothing in this phase should touch any of them.
- **Secrets**: `spec-phase-1.md:78-92` matches the global AGENTS.md rule — interactive `glab auth login` only, human-performed, no token on a command line or in a variable.

### Risks (Phase 1)

- **This session is in a git worktree.** Steps 2 and 4 both create links whose target is `$PWD`. Both were run against the main checkout `/Users/jtinetti/Projects/tinetti/waybill` instead, resolving Open Item 3 — see `implementation-notes-phase-1.html`.
- **Two steps are HUMAN-only** (step 1 `/plugin` UI commands, step 5 `glab` host + login). An agent must hand back rather than improvise. The phase cannot reach fully-green without the human.
- **Citation drift**: `README.md:346-347` in the failure-mode table should be `351-352`; `src/openspec.js:12,31-33` should include line 18. Harmless for execution, worth correcting if the spec is edited.
- **No automated coverage for any of this.** `node --test tests/` is a regression guard only; the real gate is the probe block, which is a human-read table. Phase 3's `waybill doctor` is the fix, and it is downstream.
