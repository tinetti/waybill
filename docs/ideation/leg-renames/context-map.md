# Context Map: leg-renames

**Phase**: 4
**Gates**: 5/5 ready
**Verdict**: GO

Worktree root: `/Users/jtinetti/Projects/tinetti/waybill/.claude/worktrees/waybill-feat-leg-renames`. All paths below are relative to it.

**Landed so far**: phase 1 = `456f7d8`, phase 3 = `3dfb3aa`, phase 2 = `1543ea6` (committed out of spec order; both are in). Phase 4 is next. Two files still carry **uncommitted** working-tree edits — `tests/frontmatter.test.js` (leg-id literals) and `tests/help.test.js:149-158` (the stamp map, now `ideate: 'contract.md'`, `specify: 'tasks.md'`, with `refine`/`contract`/`specs` rows dropped). They are correct and belong to earlier phases; do not revert, stash, or re-do them, and do not use bare `git stash`.

## Gates

### Phase 4 (current)

| Gate                 | Status | Evidence                                                                                                                                                                                                                                                                                 |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file the spec names was inspected; six of the eleven rows in its Modified Files table turn out to be **already done by phase 1** and need no edit, and the real remaining work is enumerated file-by-file below (goldens, the ride-along, four source comments).                    |
| Pattern familiarity  | ready  | Read `tests/helpers/repo-fixture.js:263-281` (`assertGolden` + the `UPDATE_GOLDEN=1` rewrite path the spec claims does not exist), `tests/cli.test.js:912-920` (the temp-path normalisation), `tests/guide.test.js:130-166` (the whole coupling), `src/help.js:79-104` (`routeLines`).      |
| Dependency awareness | ready  | All 20 `assertGolden` call sites, the 3 raw `readFileSync(path.join(GOLDEN, …))` sites, and `tests/guide.test.js:131`'s `golden(leg.id)` reader are listed below with which golden each owns; the six orphaned goldens with no writer at all are named.                                    |
| Edge case coverage   | ready  | Concrete list below: the already-broken `specify.txt`/`specify.md` reference, orphan goldens that criterion 8 will catch, the `ideate.*` content swap, the `firstLines` cross-check at `guide.test.js:160-165`, `help.txt:4,31`'s un-owned prose, the `fix/specs` branch name.            |
| Test strategy        | ready  | Full-suite baseline captured by running `node --test tests/`: **31 distinct failing tests**, every one a golden byte-comparison or a `guide` assertion — the exact set phase 4 owns, with nothing else red. Regeneration path identified and correct. `package.json:15` is the only script. |

### Phase 2 (retained)

| Gate                 | Status | Evidence                                                                                                                                                                                                                              |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file the spec named was read at its cited lines; three factual errors in the spec were each named with a concrete resolution.                                                                                                   |
| Pattern familiarity  | ready  | Read `src/cli.js:399-479`, `src/waybill.js:136-215,296-310`, `commands/bay.md:91`, `commands/new.md`, both golden renderings.                                                                                                         |
| Dependency awareness | ready  | `firstLeg` has exactly one caller (`src/cli.js:475`); golden/test consumers of `new`'s output enumerated.                                                                                                                             |
| Edge case coverage   | ready  | The trunk path the spec's snippet missed, the `/waybill:bay ` trailing-space grep, the "run only the last" collision, the transfer/`/clear` interaction, the outside-a-repo short-circuit.                                             |
| Test strategy        | ready  | Inner loop `node --test tests/cli.test.js tests/commands.test.js` → 126 tests, 121 pass, 5 fail, all pre-existing golden staleness. `UPDATE_GOLDEN=1` is the regeneration flag (`tests/helpers/repo-fixture.js:274-281`).              |

### Phase 1 (retained)

| Gate                 | Status | Evidence                                                                                                                                                             |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Every file the spec named was read; the two under-named places (six extra `knownLegs` call sites, the fixture-count arithmetic) were enumerated with file:line.       |
| Pattern familiarity  | ready  | Read `src/legs.js:32-41`, `src/inference.js:120-186`, every booking's frontmatter, the whole `tests/fixtures/` chain.                                                 |
| Dependency awareness | ready  | All ten consumers of `LEGS`/`knownLegs` listed, including six test-tier sites that would hard-throw `unknown leg \`brainstorm\``.                                     |
| Edge case coverage   | ready  | The `git mv` collision, the stranded `LegFixture` typedef, `src/cli.js:424` silently re-pointing at `bay`, the byte-exact grep criterion, the fixture-count conflict. |
| Test strategy        | ready  | `node --test tests/legs.test.js` ran green; `package.json:15` is the only script — no lint, typecheck, build, or justfile.                                            |

## Key Patterns

### Phase 4

- `tests/helpers/repo-fixture.js:263-281` (`assertGolden`) — `assertGolden(dir, name, actual, ext = 'txt')`. **It rewrites the golden when `process.env.UPDATE_GOLDEN === '1'`, then asserts.** The doc comment states this is deliberate and env-flag-only. This is the "capture from the CLI, do not hand-edit" mechanism the spec asks for — see risk 1, because the spec asserts it does not exist.
- `tests/cli.test.js:912-920` — the `bay-cut` normalisation the spec points at (its line numbers are stale; it is `:918`, not `:880`). `const stable = result.out.replaceAll(target, '/repo/.claude/worktrees/waybill-feat-thing'); assertGolden(GOLDEN, 'bay-cut', stable, 'md');`. The substitution happens **before** `assertGolden`, so `UPDATE_GOLDEN=1` blesses the normalised string automatically — no extra work.
- `tests/waybill.test.js:120-146` — the golden loop. Its `cases` array is **already the six new ids** in route order (`bay, ideate, specify, execute, review, cleanup`), driving `assertGolden(GOLDEN, id, …)` for `.txt` and `.md`. Re-blessing here is what creates `specify.txt`/`specify.md` and rewrites `ideate.{txt,md}` with the merged contract leg's output. The content swap the spec calls the phase's sharpest trap therefore happens *for free* if the builder blesses rather than `git mv`s.
- `tests/guide.test.js:134-143` (`rides every leg in order`) — `/^## Leg (\d) · ([a-z]+)\b/gm`, `deepEqual` of the ids against `LEGS.map(l => l.id)`, then a per-heading numbering check. Note `(\d)` is **one digit** and `([a-z]+)` is **lower-case only** — an id with a hyphen or a two-digit number would silently not match.
- `tests/guide.test.js:145-166` (`samples match their goldens`) — `fences()` (`:98-116`) collects `^```(\S*)$` … `^```$` blocks at column 0. Every ` ```waybill ` body must equal some `tests/golden/<legId>.txt` exactly; every leg must be matched; `samples.length >= LEGS.length`. Then `:160-165` asserts **no non-`waybill` fence contains the first line of any leg golden** — so a ` ```sh ` or ` ```text ` block may not quote a waybill header line.
- `tests/guide.test.js:131` — `const golden = (id) => fs.readFileSync(path.join(GOLDEN, \`${id}.txt\`), 'utf8')`. `.txt` only; `.md` goldens are not read by the guide test. An absent `specify.txt` throws ENOENT here, not a clean assertion failure.
- `docs/guide/01-ride-along.md:61-94` — the model section: heading, prose, optional ` ```sh ` fence, a `> **Plainly:**` blockquote, and one ` ```waybill ` fence whose body is **byte-identical to `tests/golden/bay.txt`** (verified). This is the shape to preserve while renumbering.
- `src/help.js:79-104` (`routeLines`) — the ROUTE table in `tests/golden/help.txt:10-18` is **generated from `LEGS`**, one row per leg, widths computed. It collapses to six rows with no hand-edit; the spec's "rebuild the route table for six rows" is a re-bless, not a manual table edit. `src/help.js:13-24` (`STAMP_LABELS`) is the display map `tests/help.test.js:149-158` mirrors (already updated in the working tree).
- `src/legs.js:32-39` — `LEGS` is `bay, ideate, specify, execute, review, cleanup`. Golden headers therefore read `leg 1 of 6 (bay)` … `leg 6 of 6 (cleanup)`.

### Phase 2 (retained)

- `src/cli.js:425-479` — `firstLeg` + `begin`; `begin` rejects every argument, which is why `new --markdown` is impossible.
- `src/waybill.js:186-215` (`nextBlock`) + `:136-182` (`handoverCommands`) — where the `NEXT:` block and the `transfer`/`/clear` behaviour come from. `:324-345` is the markdown twin.
- `src/waybill.js:296-310` (`renderWaybill`) — returns a string ending in exactly one newline; `IGNORED BY GIT:` and `WARNINGS:` append after `NEXT:`.
- `src/waybill.js:65-69` (`position`) — `if (!state.docketOpen) return 'no docket open'` short-circuits before reading `index`.
- `bookings/ideation-brainstorm.md` — `leg: brainstorm`, `command: /ideation:brainstorm`, `handover: transfer`, `stampCmd: false`.
- `tests/cli.test.js:477-565` (`describe('waybill new')`) — `:488` is now `assertGolden(GOLDEN, 'new', result.out)`.

### Phase 1 (retained)

- `src/legs.js:43-56` — `OFF_ROUTE_BOOKINGS = ['brainstorm']` and `BOOKABLE_IDS`.
- `src/legs.js:99-120` — `WRAPPER_STAMPS`, declared below both stamp functions because `const` is not hoisted.
- `src/inference.js:120-186` — `resolveLeg`'s walk, no special-cased index.
- `src/bookings.js:71-121` — `loadBookings`; `:97-98` is the only gate on leg ids and the source of the `unknown leg` message.
- `tests/legs.test.js` — deliberately count-free, structural assertions with a comment per invariant.

## Dependencies

### Phase 4 — who writes each golden

`UPDATE_GOLDEN=1` reaches every golden through these `assertGolden` call sites:

- `tests/waybill.test.js:137,144` (the six-leg loop) — writes → `bay`, `ideate`, `specify`, `execute`, `review`, `cleanup` in **both** `.txt` and `.md`. This single loop is what mints `specify.*` and re-captures `ideate.*`.
- `tests/waybill.test.js:149` → `no-docket.md`; `:153` → `status.txt`; `:171` → `complete.txt`; `:180` → `no-docket.txt`; `:197` → `fleet.txt`; `:201` → `select.txt`; `:205` → `fleet-empty.txt`; `:213` → `trunk-one-docket.txt`; `:217` → `trunk-one-docket.md`; `:243` → `next-run.md`; `:248` → `next-branch-only.md`; `:253` → `next-stale-leg.md`; `:382` → `findings.md`; `:526` → `bay-select.txt`; `:534` → `bay-select-new.txt`.
- `tests/help.test.js:202` → `help.txt`.
- `tests/cli.test.js:488` → `new.txt`; `tests/cli.test.js:918` → `bay-cut.md`.

**Read-only consumers that `UPDATE_GOLDEN` does NOT write** — these three must agree with what the writers above produce, or they stay red after a re-bless:

- `tests/cli.test.js:98` — `assert.equal(result.out, readFileSync(GOLDEN/'specify.txt'))`. **Already re-pointed at `specify.txt`, which does not exist yet** — this is an ENOENT today, not a diff.
- `tests/cli.test.js:836` — same, for `specify.md`. Same ENOENT.
- `tests/cli.test.js:605` — `status.txt`, written by `tests/waybill.test.js:153`.
- `tests/guide.test.js:131` — reads `<legId>.txt` for all six ids.

**Goldens with no writer at all** (nothing will regenerate or delete them): `contract.txt`, `contract.md`, `refine.txt`, `refine.md`, `specs.txt`, `specs.md`. All six must be `git rm`'d by hand. Criterion 8's `! grep -rqE 'leg [0-9]+ of [^6]' tests/golden/` catches them if they are left behind (`refine.txt:1` is `feat/thing · leg 3 of 8 (refine)`).

### Phase 4 — what the spec lists that is already done

Verified by grep; these rows in the spec's Modified Files table need **no edit**:

- `tests/waybill.test.js` — the spec says "~39 leg-name references and 9 length references". Phase 1 did them: every length is `${LEGS.length}` (`:280,312,411,467,588,594,614,617,784`) and the golden loop at `:126-131` already names the six new ids. The only surviving `contract` hits are `:164` (a real `contract.md` path) and `:178` (prose about the renderer's "no-docket contract").
- `tests/help.test.js` — done in the uncommitted working-tree diff at `:149-158`.
- `tests/review.test.js` — the only hit is `:32` `describe('the stampCmd exit-code contract')`, the English word. No change.
- `tests/fleet.test.js` — zero hits for any retired id.
- `tests/inspection-gitignore.test.js` — five hits (`:95,141,148,158,163`), but all are **synthetic `Map`s** of the shape `['specs', { leg: 'specs', stampPath: … }]` that never touch `LEGS`. They pass today. Cosmetic only; no criterion greps test sources for these.

Also already done and passing: `tests/bookings.test.js` (uses `leg: contract` as a deliberate synthetic fixture with explicit `knownLegs`, plus `:385-389`'s retired-id loop), `tests/doctor.test.js:419-439` (phase 3's retired-leg overlay case), `tests/inference.test.js:89` (`FIXTURES.length === LEGS.length + 2` — note **+2**, not the contract's +1, because `brainstorm.js` is a second deliberate exception).

### Phase 4 — what genuinely remains

1. `tests/golden/` — delete six files; re-bless the rest (21 goldens change content, 12 are unaffected).
2. `docs/guide/01-ride-along.md` — headings at `:25, 61, 106, 138, 163, 197, 224, 291` (eight, must become six, renumbered 1-6 as `bay, ideate, specify, execute, review, cleanup`) and the ` ```waybill ` fences opening at `:30, 76, 116, 142, 171, 202, 228, 295`.
3. `src/fleet.js:15,17,23` — the doc comment says "leg 2 makes the bay mandatory", "leg 8 is stamped only once the bay is gone", "a branch mid-refine", and "shows up at leg 8". Four phrases, not two. Under the six-leg route: bay is leg **1**, cleanup is leg **6**, and `mid-refine` has no referent.
4. `src/progress.js:139` — "A change with no tasks is a specs-leg problem" → `specify`.
5. `src/waybill.js:58` ("`leg` still reads `ideate`" — now correct only by accident; the base-branch leg is `bay`), `:159` ("the whole point of the specs leg"), `:298` ("`▶ ideate` for a leg the repository was never actually working" — now describes the merged leg, not the brainstorm). Comments only.

### Phase 2 (retained)

- `src/cli.js:425` (`firstLeg`) — consumed by `src/cli.js:475` only.
- `commands/new.md` — consumed by `tests/commands.test.js:37,204-223,294,297-306,308-312`.
- Prose describing `new` as "leg 1's waybill" that phase 2 did not own: `src/cli.js:38` (USAGE), `src/help.js:30,52` → `tests/golden/help.txt:4,31`, `docs/guide/03-reference.md:11,37`, `README.md:122,138`.

### Phase 1 (retained)

`LEGS` / `knownLegs` blast radius — ten sites: `src/inference.js:75`, `src/cli.js:87`, `src/doctor.js:29`, `src/help.js:122`, `tests/inference.test.js:37`, `tests/bookings.test.js:344`, `tests/bookings-overlay.test.js:24,44`, `tests/booking-swap.test.js:17,53`, `tests/inspection-gitignore.test.js:127`, `tests/review.test.js:89`. All routed through `BOOKABLE_IDS`.

## Conventions

Unchanged from phases 1-2, re-confirmed against the phase-4 files:

- **Naming**: lower-case hyphen-free leg ids. Goldens `<name>.txt` / `<name>.md` in `tests/golden/`; leg goldens are named for the leg id exactly, because `tests/guide.test.js:131` and `tests/waybill.test.js:137` both derive the filename from `LEGS`.
- **Imports**: relative, explicit `.js`, ESM; `node:` builtins first. No barrels, no default exports.
- **Error handling**: loader tier throws naming the offending file and key; inference/CLI tier never throws.
- **Types**: JSDoc typedefs only, no TypeScript, no typecheck step.
- **Testing**: `node:test` + `node:assert/strict`, `describe`/`it`, test names as full sentences stating the invariant, a comment above each non-obvious assertion explaining *why* the invariant holds. Byte-exact goldens via `assertGolden`; **route lengths are always `${LEGS.length}`, never a literal** (`tests/legs.test.js:9` states this as policy: "Deliberately count-free").
- **Goldens**: never hand-edited. `UPDATE_GOLDEN=1 node --test <file>` re-blesses; `README.md:400` documents the flag. The `·` separator is U+00B7, the tick is `✓`, the marker is `▶`, and the leg-strip lines are two-space-indented with two spaces between entries.
- **Guide prose**: each leg section is heading → prose → optional ` ```sh ` → ` ```waybill ` (byte-identical to the golden) → a `> **Plainly:**` blockquote.
- **Commands**: `node --test tests/` is the entire gate. No justfile, no ESLint/Prettier, no tsconfig.

## Risks

Phase-4 risks first; earlier lists retained below.

1. **The spec's central factual claim is wrong: `UPDATE_GOLDEN=1` exists.** `spec-phase-4.md:10` says the goldens have "**no regeneration mechanism** — no `UPDATE_GOLDEN=1`, no `npm run golden`". `tests/helpers/repo-fixture.js:276` is literally `if (process.env.UPDATE_GOLDEN === '1') { … fs.writeFileSync(file, actual); }`, and `README.md:400` documents `UPDATE_GOLDEN=1 node --test tests/waybill.test.js   # re-bless the rendered-output fixtures`. **This is good news, and it does not change the phase's conclusions** — the spec's own instruction ("capture from the CLI, do not hand-edit") is exactly what the flag does, and its Failure Modes rows for whitespace drift and temp-path leakage are both eliminated by using it. Recommended sequence: `UPDATE_GOLDEN=1 node --test tests/waybill.test.js tests/help.test.js tests/cli.test.js`, then read every diff by eye before staging — the flag blesses a wrong render just as happily as a right one. Only the three raw `readFileSync` comparisons (`tests/cli.test.js:98,605,836`) stay outside the flag, and all three read goldens some other test writes.

2. **`tests/cli.test.js:98` and `:836` are broken *now*, not merely stale.** They were re-pointed at `specify.txt` / `specify.md` in an earlier phase, but those files do not exist — the failure is `ENOENT`, not a byte diff. The same applies to `tests/guide.test.js:131` for `specify`. Nothing is wrong with the test sources; the goldens simply have to be minted, and only `tests/waybill.test.js:137,144` mints them. Bless `tests/waybill.test.js` **before** running `tests/cli.test.js` or the inner loop will report a misleading error.

3. **`new.md` was never created, contradicting the spec's New Files section.** `spec-phase-4.md:46` says "None — `tests/golden/new.txt` and `new.md` were created in phase 2." Only `new.txt` exists; phase 2 took the alternative resolution named in this map's phase-2 risk 2 and dropped `new.md`. Nothing in phase 4 depends on it, and no criterion greps it. **Do not create it now** — it would be a golden with no producer, exactly the orphan class this phase is deleting.

4. **Six orphaned goldens survive a clean re-bless and fail a success criterion.** `contract.{txt,md}`, `refine.{txt,md}`, `specs.{txt,md}` have no writer, so `UPDATE_GOLDEN=1` leaves them byte-for-byte stale and the suite goes green with them still on disk. Criterion 8's `! grep -rqE 'leg [0-9]+ of [^6]' tests/golden/` is the only thing that catches them. `git rm` all six explicitly. Note the spec frames `specs.* → specify.*` as a `git mv` (step 1); a `git mv` followed by a re-bless is harmless but redundant, and a `git mv` **without** a re-bless would leave `specify.txt` reading `leg 5 of 8 (specs)`.

5. **`help.txt:4` and `:31` still read "leg 1's waybill" after the re-bless, and no phase owns them.** `src/help.js:30` and `:52` are hardcoded prose strings, not generated from `LEGS`; `routeLines` only builds the ROUTE table. Re-blessing `help.txt` will collapse the table from eight rows to six and leave both "leg 1's waybill" lines intact, describing a `new` that no longer issues a leg's waybill. Criterion 10 does not grep goldens or `src/`, so nothing will fail — but this is the same gap this map flagged as phase-2 risk 5 and it is still unclaimed by any phase. `contract-data.json`'s phase-5 notes name README, the guide and openspec, not `src/help.js` or `src/cli.js:38`. Recommend fixing `src/help.js:30,52` here (the golden is being re-blessed in this phase anyway, so it costs nothing) or, at minimum, leaving an explicit note for phase 5.

6. **The ride-along's brainstorm and refine sections must be handled differently from each other.** Eight numbered headings become six, but not by deleting two:
   - `:25` "Leg 1 · ideate" (the brainstorm) — **unnumber**, per the spec. Its prose moves to phase 5; its ` ```waybill ` fence at `:30` must go **now**, because it renders `main · no docket open` and after the re-bless no leg golden has that first line, so `guide.test.js:152` would fail with "a waybill sample matches no leg golden".
   - `:106` "Leg 3 · refine" and `:138` "Leg 4 · contract" — **merge into one** "Leg 2 · ideate" section. Only one of the two fences survives, and its body becomes the re-captured `ideate.txt`. The refine section's narrative (`:118-136`) is genuinely orphaned; phase 5 owns whatever of it should survive as prose.
   - Renumbering then falls out: `bay` 2→1, merged `ideate` →2, `specs`→`specify` 5→3, `execute` 6→4, `review` 7→5, `cleanup` 8→6.

7. **Prose inside the guide that phase 4 must NOT touch, and that will keep criterion 10 red.** `docs/guide/01-ride-along.md:6` ("crossed eight legs"), `:74` ("hand you this for leg 2"), `:99-104` (`/waybill:next feat/thing/refine`, "the handover for leg 3") are narrative, not headings or fences — phase 5 per the spec. Criterion 10's `grep -rnE '(seven|eight) legs|leg [0-9]+ of [78]|\`(refine|specs)\`' README.md docs/guide/ …` will therefore **still fail after phase 4** on `:6`, and that is correct and expected. Do not let a failing criterion 10 at the phase-4 gate trigger a rewrite of phase 5's prose. Criterion 1 (`node --test tests/` exits 0) is phase 4's real gate.

8. **`fix/specs` is a deliberate collision that outlives this phase.** `tests/cli.test.js:448-453` uses the branch `fix/specs` precisely because it once collided with a leg id, proving the `<branch>/<leg>` parser disambiguates. Now that `specs` is retired the test proves nothing, but re-pointing it belongs to phase 5 (`contract-data.json` names `src/cli.js:93`, `tests/cli.test.js:448-450`, `openspec/specs/command-surface/spec.md:104-105`). It passes today. Leave it.

9. **`guide.test.js:160-165` is a second, easily-missed assertion.** After collecting the `waybill` fences it walks **every other fence** and asserts none contains the first line of any leg golden. The ride-along's ` ```sh ` blocks are safe today, but if the builder demotes a retired leg's `waybill` fence to ` ```text ` rather than deleting it, that assertion — not the sample loop — is what fails, with the message "a \`\`\`text fence holds a waybill: …".

10. **Baseline, for regression triage.** `node --test tests/` currently fails **31 distinct tests**, in exactly six suites: `renderWaybill golden output`, `renderWaybillMarkdown`, `renderWaybillMarkdown keyed lines`, `fleet golden output`, `renderHelp`, `guide`, plus `waybill next`, `waybill next --markdown`, `waybill status` and `waybill bay --markdown` in `cli.test.js`. Every single one is a golden byte-comparison or a `guide` coupling assertion. **Nothing else in the suite is red** — no logic failures survive from phases 1-3. If a suite outside that list goes red during this phase, it is a regression the builder introduced, not inherited. A full `node --test tests/` run takes roughly two minutes; prefer the inner loop.

11. **Decision-log check against reality (phase 4)**: the log itself holds, but one logged premise is factually contradicted by the codebase, and one is weakened.
    - **Contradicted**: not a decision entry but the Technical Approach premise at `spec-phase-4.md:10` — "no regeneration mechanism" — is false (risk 1). This matters because it is the stated reason the spec routes the builder through manual CLI capture and normalisation. The decision it supports (**"Ship rename, removal and `new` rework as one change"** — rejected: two PRs, "all 33 goldens are byte-exact … so a split rewrites every one of them twice") still holds on its own merits: byte-exactness is real, and re-blessing twice still means eyeballing 33 diffs twice. The conclusion survives; only the method changes.
    - **Weakened**: the decision **"The ride-along's leg headings and waybill fences move into this phase"** cites `tests/guide.test.js` coupling them to `LEGS` and the goldens in one assertion. Verified true — but the coupling is two assertions in two `it` blocks (`:134-143` headings, `:145-166` fences), not one. The scheduling argument is unaffected; both would be red across a phase boundary either way.
    - Spot-checked and holding: `tests/guide.test.js:147` does derive golden filenames from `LEGS`; `assert.ok(samples.length >= LEGS.length)` at `:158` is a floor, as the spec says; `src/fleet.js` does carry the comments named (four phrases, not the two the spec cites). The spec's citation `tests/cli.test.js:880-882` for the normalisation pattern is stale — it is now `:912-920`.

### Phase 2 risks (retained)

1. The spec's `firstLeg` snippet did not fix the `!docketOpen` path that was actually broken; resolved by building the brainstorm state unconditionally and making only the warning conditional.
2. `tests/golden/new.md` had no producer and `node src/cli.js new --markdown` does not exist; resolved by dropping `new.md` (see phase-4 risk 3).
3. The criterion greps `/waybill:bay ` with a trailing space, forcing a rendered `<branch>` argument.
4. The handoff must not become the last line of the `NEXT:` block — `commands/new.md` says "run **only the last**".
5. `new`'s own one-line descriptions at `src/cli.js:38`, `src/help.js:30,52` are false and no phase owns them (still open — see phase-4 risk 5).
6. Inner-loop baseline was red for reasons outside phase 2; those settle here.
7. The `/clear` in the brainstorm's `handover: transfer` is intentional and must survive.
8. The outside-a-repository path never reaches `firstLeg` (`src/cli.js:473` returns 2 first).
9. Decision-log contradiction: the Full-tier "propose a concrete branch name" cannot live in the CLI, which is pure and stateless; resolved as a `<branch>` placeholder in code plus an instruction in `commands/new.md`.

### Phase 1 risks (retained)

1. The spec's "four call sites" was wrong — there were ten.
2. The fixture count was arithmetically impossible as written; resolved by keeping `brainstorm.js` as a second deliberate exception, which is why `tests/inference.test.js:89` now asserts `LEGS.length + 2`.
3. The `LegFixture` typedef was stranded by the `ideate.js` → `brainstorm.js` rename.
4. Criterion 2 is a byte-exact grep on test source — the array literal must stay on one line with `', '` separators.
5. Silent pin drift at `tests/commands.test.js:213` — re-pointed at `ideation-brainstorm.md`.
6. `git mv` ordering was load-bearing for the three-way booking and fixture collisions.
7. Source frontmatter carried across the renames: `handover: transfer` on the merged `ideate` booking; `stampCmd: false` and `command: /ideation:brainstorm` preserved on `ideation-brainstorm.md`.
8. `tests/inference.test.js:85-94`'s eight-id `deepEqual` had its premise deleted.
9. No decision-log contradiction found in phase 1 beyond the "four call sites" premise.

## Implementation notes — phase 4, review cycle 1

1. **`bookings/waybill-bay.md:14` was factually wrong and is fixed here.** It compared bay's
   never-succeeding `stampCmd` to "the ideate leg's", but the merged `ideate` stamps by
   `stampPath: docs/ideation/*/contract.md` (`bookings/ideation-ideate.md:7`). Retargeted at
   `cleanup`, the other wrapper leg with `stampCmd: false`, mirroring
   `bookings/waybill-cleanup.md:17`. Four goldens (`bay.{txt,md}`, `no-docket.{txt,md}`) re-blessed
   and the bay fence in `docs/guide/01-ride-along.md` re-copied. `bookings/` is claimed by no later
   phase, so it had to be fixed in this one.
2. **Help-card risk 5 resolved here rather than deferred.** `src/help.js:30,52` and `src/cli.js:38`
   claimed `new` issues "leg 1's waybill … and nothing else". After phase 2, leg 1 is `bay` and
   `new` issues the off-route brainstorm's waybill plus an `AFTER THE BRAINSTORM` handoff to
   `/waybill:bay`. Reworded and `tests/golden/help.txt` re-blessed. `tests/help.test.js:262`'s
   deliberately frozen `--help` literal was updated with a comment recording that this one row is
   an intentional reword, not drift.
3. **`tests/inspection-gitignore.test.js` renamed.** Five synthetic bookings keyed `specs` became
   `specify` (`:95,141,148,158,163`). Harmless at runtime — `paperPaths` (`src/inspection.js:73`)
   never validates ids against `LEGS` — but the spec's File Changes table lists the file and a
   retired leg id should not survive in the test sweep this phase is named for.
4. **Carried, not a miss: `tests/frontmatter.test.js`.** Modified in this working tree but absent
   from `spec-phase-4.md`'s File Changes table. It is a correct phase-1 leftover (see this map's
   opening note) and lands in the phase-4 commit.
5. **Deferred to phase 5, deliberately: the ride-along's orphaned brainstorm lead-in.** Removing
   the numbered brainstorm section left `docs/guide/01-ride-along.md:27-32` ("Here's your first
   waybill…", "The NEXT block is the handover…") pointing at nothing. `spec-phase-4.md:14` defers
   narrative and `spec-phase-5.md:56` claims the file; phase 5 must repair those two paragraphs
   along with the stale prose at `:6`, `:56`, `:81`, `:85`, `:90` and `:308`.
