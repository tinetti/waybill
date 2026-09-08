# Waybill Help Card Contract

**Created**: 2026-09-08
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

Waybill's README (lines 3-5) names the problem the tool exists to solve: every session boundary costs a manual re-orientation — which leg is this, which command comes next, which model does it want, and does the work live in the main checkout or a bay. Waybill solves that mid-route. Run `waybill next` inside a bay and you get `feat/thing · leg 2 of 7` with a checklist of what is done and what is next (tests/golden/bay.txt).

It does not solve it at cold start. Standing on the trunk, the operator gets the first carrier and nothing else: no leg count, no route, and no vocabulary. The one state with no map is the one state where the author has no memory to fall back on. This is not a private diagnosis — docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md reaches the same seam independently, observing that leg 1's waybill answers 'how do I begin an effort at all' rather than 'what comes next on this docket'.

That design fixes the command surface: it adds `new`, renames `start` to `bay`, and makes trunk `next` exit 2 with `no dockets open — begin one with \`waybill new\``. What it does not do is give the operator the route or the vocabulary. After it lands there are four verbs instead of three, one of them renamed with no alias, and the author still has to re-read a 13.8K README to recover a seven-leg sequence and a glossary that fit on one screen. A rename makes a reference card more necessary, not less.

## Goals

1. Answer cold start in one screen: `waybill help` prints at most 45 lines covering the from-zero sequence, the seven-leg route, the glossary, and waybill's four verbs — plus a two-line Why footer and a one-line README pointer.
2. Zero drift on the generated half: adding a leg to src/legs.js, or rebooking a carrier, changes the route table with no edit to src/help.js.
3. Correct on arrival: the page teaches `new`, `bay`, `next [<branch>]` and `status`, and the string `waybill start` appears nowhere in the rendered page.
4. Cost nothing to maintain: no new dependencies, no new package scripts, and help renders correctly outside a git repository.
5. Keep --help terse: its Options block and existing Commands rows are unchanged, and it gains exactly one row for `help`.

## Success Criteria

- [ ] The prereq actually landed: `bay` and `new` exist as subcommands before the page is written against them. — check: `node bin/waybill --help | grep -qE '^  new' && node bin/waybill --help | grep -qE '^  bay'` → exits 0
- [ ] Help output is at most 45 lines — the mechanical guard against reproducing the README. — check: `node --test --test-name-pattern="fits one screen" tests/help.test.js && grep -q 'fits one screen' tests/help.test.js` → exits 0
- [ ] The route section lists every id in src/legs.js LEGS, in order, so a new leg cannot be silently missing. — check: `node --test --test-name-pattern="lists every leg" tests/help.test.js && grep -q 'lists every leg' tests/help.test.js` → exits 0
- [ ] Carriers are read from resolved bookings: a fixture with a bookings overlay changes the carrier shown for that leg. — check: `node --test --test-name-pattern="reflects a rebooked carrier" tests/help.test.js && grep -q 'reflects a rebooked carrier' tests/help.test.js` → exits 0
- [ ] The golden is rendered under a neutralised environment, so an operator with a global overlay or WAYBILL_BOOKINGS_DIR set cannot change the recorded page. — check: `node --test --test-name-pattern="golden under a neutralised environment" tests/help.test.js && grep -q 'golden under a neutralised environment' tests/help.test.js` → exits 0
- [ ] The commands section names every subcommand --help lists, verified by parsing run(['--help']) rather than by exporting USAGE. — check: `node --test --test-name-pattern="covers every subcommand" tests/help.test.js && grep -q 'covers every subcommand' tests/help.test.js` → exits 0
- [ ] All four sections are present and the walkthrough names `waybill new`, `waybill bay` and `cd` — the glossary and walkthrough cannot silently vanish behind a re-blessed golden. — check: `node --test --test-name-pattern="names all four sections" tests/help.test.js && grep -q 'names all four sections' tests/help.test.js` → exits 0
- [ ] Help renders outside any git repository — it is a reference, not a state report, and must never exit 2 for want of a repo. — check: `node --test --test-name-pattern="outside a repository" tests/help.test.js && grep -q 'outside a repository' tests/help.test.js` → exits 0
- [ ] The page never teaches the deleted verb: neither `waybill start` nor `/waybill:start` appears in the rendered golden. — check: `! grep -q 'waybill start' tests/golden/help.txt && ! grep -q '/waybill:start' tests/golden/help.txt` → exits 0
- [ ] --help stays terse: the Options block and existing Commands rows are unchanged, and exactly one row was added. — check: `node --test --test-name-pattern="--help stays terse" tests/help.test.js && grep -q -- '--help stays terse' tests/help.test.js` → exits 0
- [ ] commands/help.md exists, is entered in the DECLARED array, and the plugin still declares zero dependencies and exactly one package script. — check: `test -f commands/help.md && grep -q "'help.md'" tests/commands.test.js && grep -q 'exactly one script' tests/commands.test.js && node --test tests/commands.test.js` → exits 0
- [ ] The new suite is registered in tests/index.js — an unregistered suite silently never runs on Node 26, a mistake this repo has already made five times — and the whole suite is green. — check: `grep -q 'help.test.js' tests/index.js && node --test tests/` → exits 0
- [ ] The page actually answers cold start: from `waybill help` alone, without opening README.md, a reader can get from the trunk to a bay with the branch cut and the shell moved. — judgment call: The author reads the rendered page on the trunk and confirms the from-zero sequence is followable end to end without consulting the README.

## Scope Boundaries

### In Scope

- src/help.js — renders the whole page: four sections (from-zero walkthrough, route, glossary, commands), a two-line Why footer, and a one-line README pointer — Naming every rendered element here rather than in prose is what makes the 45-line budget a real agreement. Kept in its own module rather than inline in cli.js so the golden test can call the renderer directly, matching how renderWaybill is tested (tests/waybill.test.js:41-48).
- A `help` subcommand in src/cli.js, exiting 0 with no repository required, plus exactly one new row in the USAGE Commands block — The slash command is a passthrough to the CLI, so the CLI is where the output must live. A subcommand absent from its own usage line would be undiscoverable by the one route a CLI user reaches for.
- commands/help.md — a passthrough mirroring commands/status.md, plus 'help.md' added to the DECLARED array in tests/commands.test.js — Every waybill slash command works this way (commands/status.md:24). DECLARED is asserted in both directions (tests/commands.test.js:32-41), so shipping the file without the entry fails the suite.
- tests/help.test.js and tests/golden/help.txt, registered in tests/index.js, rendered under withEnv isolation that neutralises WAYBILL_BOOKINGS_DIR and git config waybill.bookingsdir — The named assertions are what the success criteria bind to. Registration is mandatory — an unregistered suite silently never runs on Node 26. Env neutralisation follows the pattern tests/bookings-overlay.test.js:37-42 already uses; assertGolden is private to tests/waybill.test.js:41-48 and must be copied or promoted to the shared helper.
- A /waybill:help row in the README command table — The README is the tool's front door; a command absent from its own table is undiscoverable by the other route. The surrounding README edits belong to the new-bay-and-fleet design, which already lists README.md as modified.

### Out of Scope

- A help pointer in the trunk's no-docket render — The new-bay-and-fleet design already prints `no dockets open — begin one with \`waybill new\`` on trunk `next` (exit 2). Adding a second pointer would duplicate it, and it would land in a renderer that design is rewriting.
- Anything the new-bay-and-fleet design owns — the start-to-bay rename, `new`, the fleet view, `next <branch>`, and the four goldens it adds — That design is approved with work in flight. This contract consumes its command surface as a prereq and changes none of it.
- Bay-directory precedence, the bookings overlay mechanism, and environment variables — Already documented at README:133-153 and README:197-240, and including them blows the 45-line budget. The page's last line points at the README for exactly this.
- The per-leg prerequisites / tool-dependency table (README:155-170) — A setup concern read once, not a cold-start concern read every change.
- A design-rationale section explaining why legs hand off one at a time and why there is no state file — The author's own answer was that the vocabulary is the reasoning they meant. A two-line Why footer stays; the essay remains in the README.
- Context-awareness — help reading repository state or highlighting the current leg — `next` already owns 'where am I' and `status` now owns the fleet. A third stateful renderer duplicates them and forfeits byte-exact golden testing.
- Topic arguments such as /waybill:help bay — The moment of need is cold start, where one screen beats navigating a menu. `status` already sets the precedent of a deliberately option-free command (src/cli.js:97-99).
- Generating the commands section from the USAGE string — USAGE is a module-private const (src/cli.js:12-26); generating would mean exporting it and parsing a column-aligned ASCII block, and help.js importing cli.js while cli.js imports the renderer creates an import cycle. The four command lines are hand-written prose, cross-checked test-side.

### Future Considerations

- If waybill ever gains users beyond the author, an onboarding-grade document written from zero — a separate artifact from this card, which deliberately assumes git and Claude Code fluency.

## Decisions Considered and Rejected

- **Sequence the help card after the new-bay-and-fleet design lands, and write it against that command surface** — rejected: Ship the card now against today's verbs and rewrite it later; or fold it into that design's branch; or ship only the route table and glossary. That design renames `start` to `bay` with no alias (Decision 3) and adds `new` as the trunk entry point. A walkthrough written today would teach a deleted verb and byte-lock it into tests/golden/help.txt, then need the walkthrough, the golden and the README row rewritten — while colliding on src/cli.js, src/waybill.js, README.md and two test files. The branch has uncommitted work in flight, so the wait is short and the rework is certain.
- **Drop the no-docket discovery pointer from scope entirely** — rejected: Adding one line to the trunk render pointing at /waybill:help. The prereq design already makes trunk `next` exit 2 with `no dockets open — begin one with \`waybill new\``, which closes the discovery gap for free and in the renderer that design is rewriting. Recorded because this was contracted scope until the collision surfaced.
- **Help is static CLI-rendered text, printed verbatim by the model** — rejected: The model composes the help prose fresh each invocation. Every waybill slash command is a passthrough that runs src/cli.js and shows the output verbatim (commands/status.md:24). Model-composed help would be the only output in the plugin that differs between runs, and a reference you cannot trust to be identical is not a reference. It would also be untestable by the golden harness the whole suite is built on.
- **The route table is generated from src/legs.js LEGS plus resolveBookings; help reads booking configuration but never repository state** — rejected: A hardcoded route table; and the original phrasing that help 'never reads git state'. resolveBookings shells out to `git config --type=path --get waybill.bookingsdir` (src/bookings.js:113-116 via src/repo.js:30-32), so the original decision was false as written. The distinction that actually holds is that help never infers position — no branch, no worktree, no diff — while still resolving which bookings apply, so it cannot lie to an operator running an overlay. The golden is rendered under a neutralised environment to keep it deterministic.
- **A route row is the leg id, the resolved booking's command, and a stamp column derived from stampPath; the two wrapper-owned legs use a fixed phrase keyed off LEGS' owner field** — rejected: A human gloss per leg written into src/help.js, or adding a label field to LEGS. LEGS entries carry only {id, owner, progress} (src/legs.js:26-34) and booking frontmatter has no description key (src/bookings.js:22-23), so any per-leg prose would be a table inside help.js — exactly the edit the zero-drift goal forbids. Keying the two wrapper legs off `owner` keeps the literals proportional to a field that already exists.
- **The commands section is hand-written prose, cross-checked test-side by parsing run(['--help'], { out })** — rejected: Generating it from the USAGE string. USAGE is module-private and generating would require exporting it plus an ASCII-column parser in src/, and would create an import cycle between help.js and cli.js. The test-side check catches a missing subcommand without adding a parser to the shipped code.
- **Every --test-name-pattern criterion is paired with a grep twin asserting the named test exists** — rejected: Binding criteria to --test-name-pattern alone. node:test skips tests that do not match the pattern, and a run where everything is skipped exits 0. Without the twin, seven criteria would pass vacuously the moment tests/help.test.js existed with any test in it, making a never-written assertion indistinguishable from a passing one.
- **--help gains exactly one row for `help`; the Options block and existing Commands rows stay byte-identical** — rejected: Keeping USAGE byte-identical overall and leaving `help` unlisted. A subcommand absent from its own usage output is undiscoverable by the route a CLI user reaches for first. The original goal of a byte-identical USAGE was incompatible with adding a subcommand at all — the terse-versus-page distinction the author chose is about length and audience, not about omitting the command.
- **A 45-line cap, asserted by a test** — rejected: Writing whatever length the content wants. The README already contains every word of this content in 13.8K. Without a mechanical cap the page grows back into the README, which is the specific failure mode this project exists to avoid. Making the cap a test turns a matter of taste into a build failure.
- **A flat page with no arguments, and no context-awareness** — rejected: /waybill:help <topic> drill-down; and help reading the repo to highlight the current leg. The moment of need is cold start, where one screen beats navigating a menu, and `next` and `status` already own the stateful surfaces. `status` establishes the precedent of a command that deliberately accepts no options at all (src/cli.js:97-99).
- **The glossary carries the reasoning; a two-line Why footer, not a rationale section** — rejected: A dedicated section explaining the design premises. Asked directly, the author said the vocabulary is the reasoning they meant — knowing docket=branch, bay=worktree, leg=session is the mental model. The essay already exists in the README and would consume a third of the line budget.
- **A separate /waybill:help command rather than enriching the trunk waybill** — rejected: Printing the full route from `next` when no docket is open. README:192-195 makes one-waybill-per-leg the tool's premise: handlers are amnesiac by design and each session reads exactly one waybill. Stuffing the route into `next` fights that premise. The map belongs to the human; the waybill belongs to the handler.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Gate: new-bay-and-fleet landed
  └── Help card  (blocked by Gate: new-bay-and-fleet landed)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/waybill-help/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Waybill Help Card contract (waybill-help) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/waybill-help/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/waybill-help/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Gate: new-bay-and-fleet landed _(blocking)_

   ```bash
   # Review: Gate: new-bay-and-fleet landed
   ```

2. **Phase 2** — Help card _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-help/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
