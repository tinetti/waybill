# Context Map: leg-renames

**Phase**: 2
**Gates**: 5/5 ready
**Verdict**: GO

Worktree root: `/Users/jtinetti/Projects/tinetti/waybill/.claude/worktrees/waybill-feat-leg-renames`. All paths below are relative to it.

Phase 1 has landed as commit `456f7d8` ("feat: cut the route to six legs and rename four of them"). Two files carry **uncommitted** phase-1 leftovers in the working tree — `tests/frontmatter.test.js` (leg-id literals `contract`/`specs` → `ideate`/`specify`) and `tests/help.test.js`. They are correct and belong to phase 1; do not revert, stash, or re-do them, and do not use bare `git stash`.

## Gates

### Phase 2 (current)

| Gate                 | Status | Evidence                                                                                                                                                                                                           |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope clarity        | ready  | Every file the spec names was read at its cited lines; the three places the spec is factually wrong (the `!docketOpen` early return, `new --markdown`, the `new.md` golden's producer) are each named with a concrete resolution below. |
| Pattern familiarity  | ready  | Read `src/cli.js:399-479` (`firstLeg` + `begin`), `src/waybill.js:136-182,186-215,296-310` (`handoverCommands`, `nextBlock`, `renderWaybill`), `commands/bay.md:91`, `commands/new.md` whole, and both golden renderings. |
| Dependency awareness | ready  | `firstLeg` has exactly one caller (`src/cli.js:475`); the golden/test consumers of `new`'s output are enumerated below; the two prose sites phase 2 deliberately leaves stale are named.                          |
| Edge case coverage   | ready  | Concrete list below: the trunk path the spec's snippet misses, the `/waybill:bay ` trailing-space grep, the "run only the last" collision, the transfer/`/clear` interaction, the outside-a-repo short-circuit.   |
| Test strategy        | ready  | Baseline captured by running the inner loop: `node --test tests/cli.test.js tests/commands.test.js` → 126 tests, 121 pass, **5 fail**, all pre-existing golden staleness (named below). `UPDATE_GOLDEN=1` is the regeneration flag (`tests/helpers/repo-fixture.js:274-281`). |

### Phase 1 (retained)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                  |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file the spec named was read and its change was concrete; the two under-named places (six extra `knownLegs` call sites, the fixture-count arithmetic) were enumerated with file:line.                                                |
| Pattern familiarity  | ready  | Read `src/legs.js:32-41`, `src/inference.js:120-186`, every booking's frontmatter, and the whole `tests/fixtures/` chain.                                                                                                                  |
| Dependency awareness | ready  | All ten consumers of `LEGS`/`knownLegs` listed, including the six test-tier sites that would hard-throw `unknown leg \`brainstorm\``.                                                                                                     |
| Edge case coverage   | ready  | The `git mv` collision, the `LegFixture` typedef stranded in `ideate.js`, `src/cli.js:424` silently re-pointing at `bay`, the byte-exact grep criterion, the fixture-count conflict.                                                       |
| Test strategy        | ready  | `node --test tests/legs.test.js` ran green; `package.json:15` is the only script — no lint, typecheck, build, or justfile.                                                                                                                 |

## Key Patterns

### Phase 2

- `src/cli.js:399-446` — `firstLeg`'s current shape. Builds a synthetic `Inference` rather than inferring one; the doc comment (`:401-421`) is the thing the spec asks to rewrite. **Line numbers shifted by +6 from the spec's citations after phase 1**: the function opens at `:425` (spec says `:419`), `LEGS[0].id` is `:430` (spec says `:424`), `bookings.get(LEGS[0].id)` is `:434` (spec says `:428`), the warning is `:439-443` (spec says `:435`), the `begin` doc comment is `:448` (spec says `:409`), the `firstLeg` doc comment starts `:401` (spec says `:67`, which is now `repoRoot`'s comment at `:29-38`; the `ideate`-naming prose the spec means is at `:33`).
- `src/cli.js:464-479` — `begin`. `args.length > 0` → exit 2, which is what makes `new --markdown` impossible (see risk 2). `io.out(renderWaybill(state, checkIgnored(root, paperPaths(bookings))))` is the single line the handoff appends to.
- `src/waybill.js:186-215` (`nextBlock`) + `:136-182` (`handoverCommands`) — where the `NEXT:` block comes from. A `handover: transfer` booking (which the brainstorm is) emits `/clear`, `/model`, `/effort`, then the raw command, because `bay` is `null` on this path. `src/waybill.js:324-345` is the markdown twin (`**NEXT** — paste each block on its own, in order:`).
- `src/waybill.js:296-310` (`renderWaybill`) — returns a string ending in **exactly one** newline, sections joined by `\n\n` (`withFindings`, `:243-249`). `IGNORED BY GIT:` and `WARNINGS:` are appended *after* `NEXT:`, so a handoff concatenated onto the return value lands after the warnings.
- `src/waybill.js:65-69` (`position`) — confirmed as the spec claims: `if (!state.docketOpen) return 'no docket open'` short-circuits before reading `index`. Dropping `index: 1` is safe. `renderWaybill:306` likewise skips `strip(state)` when `!docketOpen`, so a `leg: 'brainstorm'` id that is absent from `LEGS` never reaches the positional walk at `:104-123`.
- `bookings/ideation-brainstorm.md` — the booking `new` must resolve: `leg: brainstorm`, `command: /ideation:brainstorm`, `model: opus`, `effort: high`, `handover: transfer`, `stampCmd: false`. Its body already says "`/waybill:new` resolves it by name rather than by position", written in phase 1.
- `commands/bay.md:91` — the literal rule phase 2 inverts: "Do not invent a branch, and do not pick one for me from whatever we were last working on."
- `tests/helpers/repo-fixture.js:274-281` (`assertGolden`) — `assertGolden(dir, name, actual, ext = 'txt')`, byte-exact, rewrites when `UPDATE_GOLDEN=1`. This is how `new.txt`/`new.md` get captured; do not hand-write them.
- `tests/waybill.test.js:148-149` — `assertGolden(GOLDEN, 'no-docket', renderWaybillMarkdown(resolve(noDocketFixture().dir), CLEAN), 'md')`. The only existing producer of a no-docket **markdown** golden, and the template for `new.md` (see risk 2).
- `tests/cli.test.js:477-565` (`describe('waybill new')`) — seven cases. `:478-487` is the byte-exact comparison to re-point; `:489-497` already asserts `/^\/waybill:bay$/m` with a comment that names phase 2 as its owner; `:513-529` is the docket-open warning path; `:549-555` the outside-a-repo path.

### Phase 1 (retained)

- `src/legs.js:32-41` — the `LEGS` array; per-entry shape `{ id, owner }`, `progress: true` only on `execute`.
- `src/legs.js:43-56` — `OFF_ROUTE_BOOKINGS = ['brainstorm']` and `BOOKABLE_IDS`, both now shipped. `OFF_ROUTE_BOOKINGS[0]` is the constant phase 2's snippet imports.
- `src/legs.js:99-120` — `WRAPPER_STAMPS`, declared below both stamp functions because `const` is not hoisted.
- `src/inference.js:120-186` — `resolveLeg`'s walk, now with no special-cased index.
- `src/bookings.js:71-121` — `loadBookings`; `:97-98` is the only gate on leg ids, `:91-96` throws on a booking with neither `stampPath` nor `stampCmd`.
- `tests/legs.test.js` — deliberately count-free, structural assertions with a comment per invariant.
- `tests/fixtures/*.js` — each fixture builds on the previous leg's; every `@returns` is `import('./ideate.js').LegFixture`.

## Dependencies

### Phase 2

- `src/cli.js:425` (`firstLeg`) — consumed by → **`src/cli.js:475` only** (`begin`). Not exported, no test imports it. Changing its return shape is self-contained.
- `src/cli.js:475-477` (`begin`'s output) — consumed by → `tests/cli.test.js:482,490,502,513,533,540,549` and, at runtime, `commands/new.md`'s `` ! `` line. No JSON surface (`new --json` is rejected at `:466`).
- `tests/golden/no-docket.txt` — consumed by → `tests/cli.test.js:486` (to be re-pointed at `new.txt`) **and** `tests/waybill.test.js:178`. `tests/golden/no-docket.md` — consumed by → `tests/waybill.test.js:149` only. Both goldens survive phase 2 as the renderer's own; only cli.test.js's claim on them is dropped.
- `commands/new.md` — consumed by → `tests/commands.test.js:37` (the `DECLARED` list), `:204-223` (the model/effort pin, already re-pointed at `ideation-brainstorm.md` in phase 1 and green), `:294` (`assert.equal(source('new.md').includes('--markdown'), false)`), `:297-306` ("only the last", `/clear`, `/model`, `/effort` named in backticks), `:308-312` (no "then run:"). Any rewrite of the Task text must keep all four literals.
- Prose describing `new` as "leg 1's waybill" that phase 2 does **not** own: `src/cli.js:38` (USAGE), `src/help.js:30,52` → `tests/golden/help.txt:4,31`, `docs/guide/03-reference.md:11,37`, `docs/guide/01-ride-along.md:16`, `README.md:122,138`. Phases 4/5 per contract-data; leaving them is correct for this phase, but see risk 5.

### Phase 1 (retained)

`LEGS` / `knownLegs` blast radius — ten sites: `src/inference.js:75`, `src/cli.js:87`, `src/doctor.js:29`, `src/help.js:122`, `tests/inference.test.js:37`, `tests/bookings.test.js:344`, `tests/bookings-overlay.test.js:24,44`, `tests/booking-swap.test.js:17,53`, `tests/inspection-gitignore.test.js:127`, `tests/review.test.js:89`. All now routed through `BOOKABLE_IDS`. `src/inference.js:90,94` (the not-a-git-repository return) still uses `LEGS[0].id`, which is `bay` and correct under the new route.

## Conventions

Unchanged from phase 1, and re-confirmed against the phase-2 files:

- **Naming**: lower-case hyphen-free leg ids. Bookings `<namespace>-<leg>.md`. Goldens `<name>.txt` / `<name>.md` in `tests/golden/`.
- **Imports**: relative, explicit `.js`, ESM. Node builtins first with `node:`, then local modules. No barrels, no default exports. `src/cli.js:4` already imports from `./legs.js` — add `OFF_ROUTE_BOOKINGS` to that existing named import rather than a second statement.
- **Error handling**: loader tier throws with the offending file and key; inference/CLI tier never throws and reports through `warnings` or a one-line stderr message plus exit 2.
- **Types**: JSDoc typedefs only, no TypeScript, no typecheck step. Every exported and most internal functions carry a `@param`/`@returns` block; `firstLeg`'s is long-form prose explaining *why*, and the rewrite should match that voice rather than shrink it.
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, test names as full sentences stating the invariant. Comments above assertions explain why the invariant holds. Byte-exact goldens via `assertGolden`.
- **Commands**: `node --test tests/` is the entire gate. No justfile, no ESLint/Prettier, no tsconfig. `package.json:15` is the only script.
- **Markdown/prose**: source lines wrap at ~100 columns in both `commands/*.md` and JSDoc; HTML comments in command files carry the rationale and are deliberately skipped by `tests/commands.test.js`'s literal sweeps.

## Risks

Phase-2 risks first; the phase-1 list is retained below for reference.

1. **The spec's `firstLeg` snippet does not fix the path that is actually broken.** It keeps `if (!state.docketOpen) return state;` and rewrites only the docket-open branch. But `!docketOpen` is the *primary* path — `waybill new` on a clean trunk. Verified by running the suite: `new` today prints

   ```
   main · no docket open

   NEXT:
   /model haiku
   /effort low
   /waybill:bay
   ```

   because `resolveLeg` does `done.fill(false)` when no docket is open (`src/inference.js:150`), so `done.indexOf(false)` is `0` → `leg: 'bay'` → the `waybill-bay.md` booking (haiku/low). Implemented as written, `new` would still hand off the bay booking and the spec's own key test case — "the brainstorm booking's `command`, `model` and `effort` appear in the rendered block" — would fail. **Resolution**: build the brainstorm state unconditionally and make only the *warning* conditional:

   ```js
   function firstLeg(cwd, root, bookings) {
     const state = resolveLeg(cwd, bookings);
     return {
       leg: BRAINSTORM,
       completed: [], skipped: [],
       booking: bookings.get(BRAINSTORM),
       branch: defaultBranch(root),
       docketOpen: false,
       changeId: null,
       warnings: state.docketOpen ? [...state.warnings, /* reworded */] : state.warnings,
     };
   }
   ```

   This also drops the "byte-for-byte what the trunk used to print in reply to `next`" invariant that `src/cli.js:403-406` and `tests/cli.test.js:478-481` both assert in prose — deliberately, and both comments must be rewritten to say so.

2. **`tests/golden/new.md` has no producer, and the spec's playground command does not exist.** `begin` rejects every argument (`src/cli.js:465-468`), `tests/cli.test.js:865-870` pins that `new --markdown` exits 2, and `tests/commands.test.js:294` pins that `commands/new.md` never mentions `--markdown`. So the Feedback Strategy's `node src/cli.js new --markdown` cannot be run, and no product code path renders `new` in markdown. `renderWaybillMarkdown` lives in `src/waybill.js`, which the contract forbids touching. **Resolution**: render `new.md` in `tests/waybill.test.js` — a file phase 2's Modified Files table omits and must gain — as `renderWaybillMarkdown(<the same synthetic state>, CLEAN)` plus the markdown form of the handoff, following `tests/waybill.test.js:148-149`. That requires the handoff text to live in one exported helper pair in `src/cli.js` (e.g. `bayHandoff()` / `bayHandoffMarkdown()`) rather than as an inline template literal, or the two goldens will drift. The alternative — dropping `new.md` entirely — satisfies the contract's criterion (which greps only `new.txt`) but contradicts the spec's New Files table; if the builder takes it, say so in the commit message.

3. **The criterion greps `/waybill:bay ` with a trailing space.** `contract-data.json:99`: `grep -q '/waybill:bay ' tests/golden/new.txt`. The bare `/waybill:bay` line `new` renders today (the bay booking's command) does **not** match — the handoff must render an argument after the command, i.e. `/waybill:bay <branch>`. The same check's second half, `! grep -qE 'leg [0-9]+ of' tests/golden/new.txt`, holds automatically because `position()` returns `no docket open`.

4. **The handoff must not become the last line of the `NEXT:` block.** `commands/new.md`'s Task says "Run **only the last** of them", and `tests/commands.test.js:297-306` pins the phrase `only the last`. If `/waybill:bay <branch>` is appended inside `NEXT:`, the session runs `bay` instead of the brainstorm — the exact inversion of this command's purpose. Append it to `renderWaybill`'s returned string as its own section (it will therefore land after `IGNORED BY GIT:` / `WARNINGS:`, since `withFindings` appends those last — `src/waybill.js:224-251`), preserve the "ends with exactly one newline" contract, and update the Task text to say the handoff is for *after* the brainstorm, not now. `tests/cli.test.js:536` asserts `indexOf('NEXT:') < indexOf('WARNINGS:')`, which stays true.

5. **`new`'s own one-line descriptions are now false and no phase owns them.** `src/cli.js:38`, `src/help.js:30,52`, `commands/new.md:2` (`description: "Waybill — begin an effort: the first leg's waybill, then run it"`) all still call `new` "leg 1's waybill". `contract-data.json`'s phase 5 lists README and the guide but names neither `src/help.js` nor `src/cli.js:38`. Phase 2 should not change `src/help.js` — `tests/golden/help.txt` is phase 4's and would go red early — but the `commands/new.md` `description:` field is unpinned by any test and is squarely in this phase's file set, so fix that one and leave a note for phase 5 about `src/help.js:30,52` and `src/cli.js:38`.

6. **Inner-loop baseline is red for reasons outside this phase.** `node --test tests/cli.test.js tests/commands.test.js` → 121 pass / 5 fail today. `tests/commands.test.js` is fully green; the five failures are all byte-exact golden comparisons in `tests/cli.test.js`, in the suites `waybill next`, `waybill new`, `waybill status`, `waybill next --markdown`, `waybill bay --markdown`. Within `waybill new` exactly one case fails — `:478` "prints leg 1's waybill — byte-for-byte…", the `no-docket.txt` comparison, which this phase re-points. Do not treat the other four as regressions; they settle in phase 4. The phase-2 target is: `waybill new`'s suite fully green, the other four unchanged.

7. **The `/clear` in the brainstorm's handover is intentional and must survive.** `handover: transfer` makes `handoverCommands` emit `/clear` first (`src/waybill.js:172`). `commands/new.md`'s Task explains at length why the session must *not* run it. Both the golden and that explanation have to stay consistent — if the handoff rewrite tempts a switch to `handover: through` to suppress `/clear`, that changes `bookings/ideation-brainstorm.md`, which is phase 1's file and out of scope.

8. **The outside-a-repository path never reaches `firstLeg`.** `begin` returns 2 at `src/cli.js:473` before calling it, so `defaultBranch(root)` is never handed a null root. The spec's "outside a repository (the exit-2 path)" experiment exercises `repoRoot`, not the new code — `tests/cli.test.js:549-555` already covers it and passes; keep it, do not re-derive it.

9. **Decision-log check against reality (phase 2)**: one contradiction found. The logged decision "`/waybill:new` proposes a concrete branch name (Full tier)" and the spec's step "Derive the branch name from the brainstorm conclusion" cannot both be satisfied in `src/cli.js`: the CLI is a pure, stateless process with no access to the session's conversation, and `renderWaybill` is documented as "Pure by design — no filesystem, no subprocess, no clock" (`src/waybill.js:290-292`). The only coherent reading is that the **CLI always renders the `<branch>` placeholder** (which is also what the criterion's trailing-space grep wants) and the Full-tier proposal is an instruction in `commands/new.md` telling the session to substitute a name derived from the brainstorm it just ran, falling back to pasting `<branch>` verbatim when there is nothing to derive from. Implement it that way; the spec's Failure Modes row "Invented name presented as certain" then resolves to wording in `commands/new.md`, not to a code branch. The rest of the log was spot-checked and holds: `commands/bay.md:91` reads exactly as quoted, `position()` does short-circuit at `src/waybill.js:66`, and `tests/golden/ideate.md:2` is `main · no docket open`.

### Phase 1 risks (retained)

1. The spec's "four call sites" was wrong — there were ten, including `tests/inspection-gitignore.test.js:127` and `tests/review.test.js:89`, which appear in no phase's Modified Files list.
2. The fixture count was arithmetically impossible as written; resolved by keeping `brainstorm.js` as a second deliberate exception alongside `no-docket.js`.
3. The `LegFixture` typedef was stranded by the `ideate.js` → `brainstorm.js` rename; every fixture references `import('./ideate.js').LegFixture` and nothing typechecks, so it rots silently.
4. Criterion 2 is a byte-exact grep on test source (`grep -qF "'bay', 'ideate', 'specify', 'execute', 'review', 'cleanup'" tests/legs.test.js`) — the array literal must stay on one line with `', '` separators.
5. Silent pin drift at `tests/commands.test.js:213` — now re-pointed at `ideation-brainstorm.md` and green.
6. `git mv` ordering was load-bearing for the three-way booking and fixture collisions.
7. Source frontmatter carried across the renames: `handover: through` → `transfer` on the merged `ideate` booking; `stampCmd: false` and `command: /ideation:brainstorm` preserved on `ideation-brainstorm.md`.
8. `tests/inference.test.js:85-94`'s eight-id `deepEqual` and the "keeps refine and contract on one command" test had premises deleted by the change.
9. No decision-log contradiction found in phase 1 beyond the "four call sites" premise.
