# Context Map: handover-runs-line

**Phase**: single phase (bare `spec.md`, no phase number)
**Gates**: 5/5 ready
**Verdict**: GO

## Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | All 12 files named with a concrete change each; every line reference in the spec was verified against the files (see Conventions → Verified line refs). |
| Pattern familiarity | ready | Read `handoverCommands` (`src/waybill.js:155-180`), `nextMarkdown` (`:319-340`), `fence` (`:307-309`), `keyedLines` (`:354-359`), `renderWaybillMarkdown` (`:381-405`), and `assertGolden` (`tests/helpers/repo-fixture.js:241-248`). |
| Dependency awareness | ready | `handoverCommands` and `nextMarkdown` are module-private with every call site enumerated below; the public `renderWaybillMarkdown` has 3 CLI call sites and ~20 test call sites, all inspected. |
| Edge case coverage | ready | Concrete list below, including one currently-passing assertion the change will break and the empty-body / trailing-newline cases. |
| Test strategy | ready | `node --test tests/` verified green on the untouched checkout (525 pass, 0 fail, ~59s); `UPDATE_GOLDEN=1` is the only blessing mechanism and is env-flag gated. |

## Key Patterns

- `src/waybill.js:155-180` — `handoverCommands`. Returns `{ prose, commands, command }`. `transfer` is already a named local at `:166`; the wrapper predicate is the inline `transfer && bay` at `:176`. `command` at `:163` is always a non-empty string (`booking.command` with the argument appended only when the source yields one). JSDoc `@returns` at `:150-154` is the block the three call sites read.
- `src/waybill.js:319-340` — `nextMarkdown`. Builds a flat array of paragraph strings; `renderWaybillMarkdown` joins with `\n\n` and appends one `\n` (`:404`). A new paragraph is one new array entry — no separator handling needed. The comment at `:330-331` already states the rule the annotation's position inherits: everything after the fences must not break the pairing of the fences the operator copies.
- `src/waybill.js:337` — `...commands.map((command) => fence([command]))`. **This is the shadowing site.** The map parameter must be renamed (spec suggests `line`) before the annotation can read the outer `command`.
- `src/waybill.js:307-309` — `fence(lines, info)`. Prose paragraphs are plain strings, not `fence()` output; the distinction is structural, so the annotation simply never calls `fence`.
- `src/waybill.js:15-26` — `ARGUMENT_SOURCES` / `DEFAULT_ARGUMENT = 'change-id'`. Explains why the annotation text differs per golden: `specs`/`refine` fixtures have `changeId === null` so the annotation is bare (`→ runs \`/spec:propose\``), while `execute` and the synthetic states carry `add-thing`.

## Dependencies

- `src/waybill.js:155-180` (`handoverCommands`, module-private) — consumed by → `nextBlock` (`src/waybill.js:202`, no `bay` arg → `wrapped` always false), `nextMarkdown` (`:332`), `keyedLines` (`:358`, no `bay` arg). Adding a field to the returned object is additive; no call site breaks.
- `src/waybill.js:319-340` (`nextMarkdown`, module-private) — consumed by → `renderWaybillMarkdown` (`:387`) only.
- `src/waybill.js:381` (`renderWaybillMarkdown`, exported) — consumed by → `src/cli.js:163` (`next <branch>[/leg]` routed), `src/cli.js:297` (`next --markdown`), `src/cli.js:573` (`bay --markdown`), and `tests/waybill.test.js` (lines 134, 139, 204, 230, 235, 240, 244, 249, 261, 268, 273, 366, 372, 381, 412, 426, 437, 446).
- `renderWaybill` / `renderPosition` / `renderFleet` / `renderSelect` — untouched. `tests/guide.test.js:131,147` reads only `.txt` goldens, so the guide suite is insulated from every `.md` regeneration.

Exactly nine `.md` goldens match a grep for `waybill:next`; `tests/golden/bay.md` is a false positive (the string appears in the bay booking's prose body, and that leg's handover is not a transfer — no `/clear` fence). The eight the spec lists are the real wrapper set.

Expected annotation text per regenerated golden:
- `execute.md` → `` → runs `/spec:apply add-thing` ``
- `specs.md` → `` → runs `/spec:propose` `` (no argument — `changeId` is null at the specs leg by design)
- `refine.md`, `bay-cut.md` → `` → runs `/ideation:ideation` ``
- `trunk-one-docket.md` → `` → runs `/spec:propose add-session-handover` ``
- `next-run.md`, `next-branch-only.md` → `` → runs `/spec:apply add-thing` `` (duplicating the `RUN:` line in `next-run.md` — accepted per the decision log)
- `next-stale-leg.md` → `` → runs `/spec:propose add-thing` ``

`next-branch-only.md`, `next-run.md`, `next-stale-leg.md` and `trunk-one-docket.md` currently end at the wrapper fence, so for these four the annotation becomes the final line of the file.

## Conventions

- **Naming**: camelCase functions, SCREAMING_SNAKE module constants (`INDENT`, `ENTER_BAY`, `RUN`, `NEXT_LEG`, `DEFAULT_ARGUMENT`). Non-ASCII glyphs are established in rendered output (`✓ ▶ ⚠ └ ·`); `→` is not yet used anywhere in `src/`, so it is unambiguous as a new marker.
- **Imports**: ESM with explicit `.js` extensions, relative paths. `"type": "module"`, Node >= 22. No build step, no dependencies.
- **Error handling**: none in the renderer — `renderWaybill` and `renderWaybillMarkdown` are documented as pure (no filesystem, no subprocess, no clock), which is what makes golden testing possible. Do not introduce anything that reads the environment here.
- **Types**: JSDoc only, no TypeScript. Every exported *and* private function carries a JSDoc block; the `@returns` inline object literal type on `handoverCommands` (`:150`) is the shape to extend with `wrapped`.
- **Comments**: unusually dense and rationale-bearing — each explains *why*, often naming the failure it prevents. A new branch without a matching comment will read as out of place in this file.
- **Testing**: `node --test tests/` (`npm test`). No linter, no formatter, no CI workflow (`.github/` does not exist) — the test suite is the only gate. Goldens are byte-exact via `assertGolden(dir, name, actual, ext)`; regeneration only via `UPDATE_GOLDEN=1`. Assertion style is `node:assert/strict` with `assert.match(output, /^…$/m)` for line-anchored shape checks.
- **Verified line refs** (all confirmed accurate): `openspec/specs/handover/spec.md:117` is `### Requirement: Markdown document shape`, `:128` is the `- **Booking body**: unindented prose after the last command fence.` bullet, `:140-143` is `#### Scenario: Resolved from the trunk`. `README.md:174-181` is the `--markdown` paragraph. `commands/next.md:87` is the `RUN:` directive. Minor drift: the spec cites the two negative tests as `:419-421` and `:424-426`; they actually span `tests/waybill.test.js:419-422` and `:424-429`.

## Risks

- **`tests/waybill.test.js:414` will fail and the spec does not name it.** The test at `:411-417` ("hands a transfer leg with a bay over to /waybill:next, and prints no cd in markdown") renders `state()` with `{ bay: '/repo/bays/x' }` — a transfer leg with a bay, i.e. exactly the wrapped case — and then asserts `assert.equal(output.includes('/spec:propose'), false);`. The annotation renders `` → runs `/spec:propose add-thing` ``, so that assertion inverts. The builder must rewrite it to assert what it actually means: that `/spec:propose` no longer appears *as a fenced command*, while the annotation names it. This is arguably the natural home for the spec's "assert the annotation's shape in the wrapper case" requirement. The spec's Modified Files row for this file mentions only `:419-421` and `:424-426`.
- **Shadowed `command` binding** (`src/waybill.js:337`). Named in the spec's Failure Modes table as the one silent-failure path: if the map parameter is left as `command`, the annotation names the wrapper rather than the leg. The golden diff catches it (`→ runs \`/waybill:next …\``), but only if the diff is actually read rather than blind-blessed.
- **Two blessing commands, not one.** `tests/golden/bay-cut.md` is minted from `tests/cli.test.js:875` (via `cli(['bay', '--markdown', …])` with the temp path rewritten to a stable literal), not from `tests/waybill.test.js`. Blessing only the latter leaves `bay-cut.md` stale and `node --test tests/` red.
- **Read the golden diff for a one-line gain per file.** Eight files should each gain exactly one line (plus a blank separator line, since paragraphs join with `\n\n`). Any file gaining more, or any of `ideate.md` / `cleanup.md` / `contract.md` / `no-docket.md` / `findings.md` / `bay.md` changing at all, means the predicate is wrong.
- **No linter and no CI.** The suite is the only safety net; there is nothing that will independently catch an unused binding or a stray import.
- **Decision-log reality check**: no contradictions found. The claim that `opsx:propose` is not installed holds (no matching skill under `~/.claude/skills`), which supports amending `openspec/specs/handover/spec.md` in place. Note `openspec/changes/add-help-card` exists as an unarchived change, but it is unrelated to the handover capability and does not undercut the logged reason. The `tests/golden/bay.md` prose that says the handover "ends in `/waybill:next <branch>/<leg>`" is explicitly out of scope per the contract, and it remains true of the last *command*.
