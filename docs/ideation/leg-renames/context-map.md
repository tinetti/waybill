# Context Map: leg-renames

**Phase**: 1
**Gates**: 5/5 ready
**Verdict**: GO

Worktree root: `/Users/jtinetti/Projects/tinetti/waybill/.claude/worktrees/waybill-feat-leg-renames`. All paths below are relative to it.

## Gates

| Gate                 | Status | Evidence                                                                                                                                                                                                                                  |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file the spec names was read and its change is concrete; the two places the spec under-names (six extra `knownLegs` call sites, the fixture-count arithmetic) are enumerated with file:line and a resolution below.                  |
| Pattern familiarity  | ready  | Read `src/legs.js:32-41` (the `LEGS` shape), `src/inference.js:120-186` (the walk), every booking's frontmatter, and the whole `tests/fixtures/` chain — the conventions to replicate are explicit.                                        |
| Dependency awareness | ready  | All ten consumers of `LEGS`/`knownLegs` are listed below, including the six test-tier sites that will hard-throw `unknown leg \`brainstorm\`` once the booking lands.                                                                      |
| Edge case coverage   | ready  | Concrete list below: the `git mv` collision, the `LegFixture` typedef stranded in `ideate.js`, `src/cli.js:424` silently re-pointing at `bay`, the byte-exact grep criterion on `tests/legs.test.js`, the fixture-count conflict.           |
| Test strategy        | ready  | `node --test tests/legs.test.js` runs pure and green today (7/7, 60 ms); inner loop and phase gate are `node --test` invocations; `package.json:15` is the only script — no lint, typecheck, build, or justfile (verified by `ls`).        |

## Key Patterns

- `src/legs.js:32-41` — the `LEGS` array. Per-entry shape `{ id, owner }`, `progress: true` only on `execute`. Column-aligned object literals, one entry per line. The file's own JSDoc (`:16-31`) states the invariant the tests hold: shape, not count.
- `src/legs.js:99-120` — `WRAPPER_STAMPS`, a `Map` keyed by id, declared *below* both stamp functions because `const` is not hoisted. `bay` is already in it, so `bay` at index 0 needs no walk change.
- `src/inference.js:120-186` — `resolveLeg`'s walk. The general path (`legIsDone`, `deferred`, `done.indexOf(false)`) already handles a wrapper-owned leg at index 0. Only lines `140-146` are special-cased.
- `src/bookings.js:71-121` — `loadBookings`. `:97-98` is the only gate on leg ids and it consults the caller-supplied set; `:91-96` throws when a booking has neither `stampPath` nor `stampCmd`, independent of whether the id is a leg. Confirms the spec's claim that widening the set is the entire off-route mechanism.
- `tests/legs.test.js` — deliberately count-free. Structural assertions only, each with a comment stating *why* the shape holds. New assertions should match that voice.
- `tests/fixtures/*.js` — each fixture builds on the previous leg's (`contract.js:4` ← `refine.js`, `specs.js:4` ← `contract.js`, `execute.js:4` / `review.js:4` ← `specs.js`). Every file's `@returns` is `import('./ideate.js').LegFixture`.

## Dependencies

`LEGS` / `knownLegs` blast radius — **ten** sites, not the four the spec's Technical Approach claims:

- `src/legs.js:32` (`LEGS`) — consumed by → `src/inference.js:1`, `src/cli.js:4`, `src/doctor.js:6`, `src/help.js:3`, and six test suites.
- `src/legs.js:131-133` (`ideateIsDone`) — consumed by → `src/inference.js:1,146` only. No other consumer; deleting it is safe.

Sites that build `knownLegs` from `LEGS.map((leg) => leg.id)` and **load the shipped `bookings/` directory** — every one throws `unknown leg \`brainstorm\`` the moment `bookings/ideation-brainstorm.md` exists, so every one must move to `BOOKABLE_IDS`:

- `src/inference.js:75` — named by the spec.
- `src/cli.js:87` (`KNOWN_LEGS`) — named by the spec.
- `src/doctor.js:29` (`KNOWN_LEGS`) — named by the spec.
- `src/help.js:122` — named by the spec.
- `tests/inference.test.js:37` (`KNOWN_LEGS`, used at `:105`) — spec names `:100` and `:114` but not the constant at `:37` or the eight-id `deepEqual` at `:85-94`.
- `tests/bookings.test.js:344` — **not named by the spec**.
- `tests/bookings-overlay.test.js:24,44` — `resolve()` calls `resolveBookings`, which loads the built-ins. **Not named** (the spec lists this file only for fixture imports and literals).
- `tests/booking-swap.test.js:17,53` — same shape. **Not named** beyond fixture imports.
- `tests/inspection-gitignore.test.js:127` — `loadBookings(BOOKINGS, { knownLegs: LEGS.map(...) })` against the shipped dir. **Not named by the spec at all.**
- `tests/review.test.js:89` — same. **Not named by the spec at all.**

Other `LEGS`-coupled consumers that phase 1 perturbs but does not own:

- `src/cli.js:419-437` (`firstLeg`) — resolves `LEGS[0].id` / `bookings.get(LEGS[0].id)`. After this phase `LEGS[0]` is `bay`, so `firstLeg` starts handing out the bay booking and its warning text at `:435` still says "the ideate leg writes nothing to disk". Owned by phase 2 (contract line 52); expected wrong at the end of phase 1.
- `src/inference.js:90,94` — the not-a-git-repository return also uses `LEGS[0].id`; it becomes `bay`, which is correct under the new route.
- `tests/guide.test.js:138,147,155,158`, `tests/help.test.js:90,141,195`, `tests/waybill.test.js`, `tests/cli.test.js`, all 33 goldens — expected red at the end of this phase, settled in phase 4.

Retired-id literals in `src/` (criterion 3 greps `! grep -rqE "'(refine|contract|specs)'" src/`): today only `src/legs.js:35,36,37` match. Rewriting `LEGS` clears that criterion outright. Unquoted prose mentions in `src/cli.js:93,409,435`, `src/waybill.js:58,159,298`, `src/fleet.js:19`, `src/progress.js:139` are **not** matched by that pattern and belong to phases 4/5.

## Conventions

- **Naming**: lower-case hyphen-free leg ids. Bookings are `<namespace>-<leg>.md` (`ideation-`, `openspec-`, `waybill-`) — note the namespace does not have to match the leg id, which is exactly the trade the contract accepted for `specify`. Fixtures are `<leg>.js` exporting `<leg>Fixture`.
- **Imports**: relative, explicit `.js` extensions, ESM (`"type": "module"`). Node builtins first with the `node:` prefix, then local modules, then test helpers. No barrels, no default exports.
- **Error handling**: the loader tier throws with the offending file and key (`src/bookings.js:89,93,98,109`); the inference tier never throws and reports through `warnings` (`src/inference.js:55-67`). Keep that split — a booking problem throws, a repository problem warns.
- **Types**: JSDoc typedefs only, no TypeScript, no typecheck step. `@typedef` blocks live at the top of the module that owns the concept (`Leg` in `src/legs.js:6`, `Booking` in `src/bookings.js:9-13`, `LegFixture` in `tests/fixtures/ideate.js:3-6`).
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, test names written as full sentences that state the invariant ("anchors on bay, the first leg that leaves papers behind"). Comments above assertions explain *why* the invariant holds, not what the line does. Tests live in `tests/*.test.js` beside `tests/fixtures/` and `tests/helpers/`.
- **Commands**: `node --test tests/` is the entire gate. No justfile, no ESLint/Prettier, no tsconfig (verified). The unrelated global rule preferring `bun` does not apply here — this repo pins `node >= 22` in `package.json:11` and ships `node --test` as its only script.

## Risks

1. **The spec's "four call sites" is wrong — there are ten.** `tests/inspection-gitignore.test.js:127`, `tests/review.test.js:89`, `tests/bookings.test.js:344`, `tests/bookings-overlay.test.js:24` and `tests/booking-swap.test.js:17` all build `knownLegs` from `LEGS` and load the shipped bookings dir. Once `bookings/ideation-brainstorm.md` lands, each throws `unknown leg \`brainstorm\`` at module/suite level — a hard failure, not a golden mismatch. All five must import `BOOKABLE_IDS`. Two of them (`inspection-gitignore`, `review`) appear in **no** phase's Modified Files list, so nothing downstream will catch them either.

2. **The fixture count is arithmetically impossible as written.** The spec's New Files table creates `tests/fixtures/brainstorm.js`, and the shuffle deletes only `refine.js` — 9 files minus 1 is 8. But the spec's Testing Requirements say "the fixture directory holds exactly seven files" and keep `tests/inference.test.js:100` at `LEGS.length + 1` (6+1=7). The contract repeats the error at line 50 ("down from 9 files to 7"). **Resolution supported by the codebase**: keep `brainstorm.js` and relax the assertion to `LEGS.length + 2`, updating the comment at `tests/inference.test.js:97-99`. That comment already carves out `no-docket.js` as "the one deliberate exception, since the state it covers is not one of the legs" — `brainstorm` is now a second such exception, by exactly the same reasoning. Deleting the fixture instead would break the byte-identical-render twin assertion in `tests/waybill.test.js` that `tests/fixtures/no-docket.js:13-18` documents.

3. **The `LegFixture` typedef is stranded by the rename.** `tests/fixtures/ideate.js:3-6` owns the `@typedef LegFixture`, and every other fixture references it as `import('./ideate.js').LegFixture` (`no-docket.js:20`, `bay.js:14`, `refine.js:7`, `contract.js:11`, `specs.js:11`, and more). After `ideate.js` → `brainstorm.js` and `contract.js` → `ideate.js`, those references resolve to a file that no longer declares the type. There is no typecheck step so nothing fails — it rots silently. Carry the typedef into the new `ideate.js` (or into `tests/helpers/repo-fixture.js`) and re-point the references. The spec does not mention this.

4. **Criterion 2 is a byte-exact grep on test source.** `contract-data.json:63` runs `grep -qF "'bay', 'ideate', 'specify', 'execute', 'review', 'cleanup'" tests/legs.test.js`. The new `deepEqual` must render that array literal on one line with exactly `', '` separators — a prettier-style multiline array, different quoting, or extra spacing fails a criterion the code itself satisfies.

5. **Silent pin drift at `tests/commands.test.js:213`.** Verified: the line reads `meta(BOOKINGS, 'ideation-ideate.md')` and reaches the file by literal filename through `parseFrontmatter`, never through `loadBookings`. All three ideation bookings are `opus`/`high`, so left alone it keeps passing while asserting against the wrong booking. Re-point it in this phase, as the spec says.

6. **`git mv` ordering is load-bearing.** `bookings/ideation-ideate.md` must be vacated to `ideation-brainstorm.md` *before* `ideation-contract.md` moves onto that name, or the brainstorm booking is overwritten and its history lost. Same ordering in `tests/fixtures/`. Verify afterwards with `git log --follow bookings/ideation-ideate.md`.

7. **Source frontmatter to carry across, verified on disk**: `bookings/ideation-contract.md` has `handover: through` (must become `transfer`) and `stampPath: docs/ideation/*/contract.md`; `bookings/ideation-ideate.md` has `stampCmd: false` and `command: /ideation:brainstorm` (both must survive the rename to `ideation-brainstorm.md`, or `src/bookings.js:91-96` throws and every `/waybill:*` command fails); `bookings/ideation-refine.md` carries `stampPath: docs/ideation/*/contract-data.json`, which is dropped, not merged.

8. **Assertions the spec does not name that will break in the suites it *does* name**: `tests/inference.test.js:85-94` deep-equals the full eight-id list, and `tests/inference.test.js` (~:124) asserts "keeps refine and contract on one command, separated only by stamp" via `bookings.get('refine').command` — that test's premise is deleted by this change and the test must go, not be repaired.

9. **Decision-log check against reality**: no contradiction found. The rejected alternatives were spot-checked against the codebase — `commands/bay.md:91` exists as cited, `tests/commands.test.js:204-216` does read by filename rather than through `loadBookings` as the withdrawn justification concedes, `src/doctor.js:405-429` does catch the `resolveBookings` throw and degrade it to `warn`, and `src/bookings.js:97-98` does gate on the caller-supplied set alone. The only premise that fails is the Technical Approach's "constructed identically at four call sites" — see risk 1.
