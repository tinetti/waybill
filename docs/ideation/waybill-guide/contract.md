# Waybill Guide Contract

**Created**: 2026-09-10
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Express — single consolidated confirmation, no per-artifact review
**Supersedes**: None

## Problem Statement

Waybill has three documents a person can read, and none of them is written for someone meeting it for the first time. README.md (354 lines) is a reference: install, command table, bay locations, overlays, prerequisites. The help card (`waybill help`, 45 lines) is deliberately a cold-start aid for someone who already knows git, Claude Code and the route. The design docs under docs/superpowers/ hold the vocabulary's origins, but no newcomer will find them.

A newcomer who installs waybill and runs `/waybill:new` is handed a waybill in a vocabulary — docket, bay, leg, stamp, booking, carrier — that nothing walks them through. The waybill-help contract saw this and deferred it: 'if waybill ever gains users beyond the author, an onboarding-grade document written from zero'. This project is that document.

The motive is delight rather than a reported failure: waybill's freight-forwarding metaphor is its personality, and the project deserves a guide that is fun to read and represents it well. That makes accuracy a hard requirement, not a nicety. A funny guide that teaches a deleted verb or an out-of-date waybill does more harm than no guide, and waybill's own discipline — goldens, tests that parse the help card, one source per fact — is the tool for keeping it honest.

## Goals

1. G1 — The ride-along covers the whole route: docs/guide/01-ride-along.md follows one change, feat/thing, from the trunk through all seven legs to cleanup, with one section per LEGS id in LEGS order.
2. G2 — Samples cannot drift: every waybill shown in the ride-along sits in a ```waybill fence and is copied verbatim from tests/golden/<leg>.txt, and each of the seven legs has one.
3. G3 — The glossary contains every help-card word: docs/guide/02-glossary.md defines every term in the WORDS block of renderHelp(), plus handover, handler, route, fleet, overlay, papers and freight forwarder, and each has a literal git-terms translation.
4. G4 — The reference covers the real surface: docs/guide/03-reference.md names every slash command file under commands/, every flag in the Options block of `waybill --help`, every REQUIRED and OPTIONAL booking key, WAYBILL_BOOKINGS_DIR / waybill.bookingsdir, WAYBILL_BAY_DIR / waybill.baydir, and the prerequisites for each carrier namespace the built-in bookings use.
5. G5 — The guide can be found and has no dead links: README.md links to docs/guide/, the help card's pointer line names docs/guide/, and every relative link inside docs/guide/ resolves.
6. G6 — It never teaches a deleted verb: no whole-word `waybill start`, `wyb start` or `/waybill:start` appears anywhere in docs/guide/.
7. G7 — It costs nothing to maintain: no new dependencies, no new package scripts, and tests/guide.test.js is registered in tests/index.js so `node --test tests/` picks it up on Node 22 and 26 (the repo has no CI, so both versions are run by hand before acceptance).
8. G8 — It is fun and followable: the unnamed Dispatcher narrates the prose chapters in a gruff, fond voice, and a newcomer can follow the ride-along cold.

## Success Criteria

- [ ] The ride-along has one section per LEGS id, in LEGS order; each section heading contains the literal leg id, so the check does not depend on in-character wording. — check: `node --test --test-name-pattern="rides every leg in order" tests/guide.test.js && grep -q 'rides every leg in order' tests/guide.test.js` → exits 0
- [ ] Every ```waybill fenced block in the ride-along equals some tests/golden/<leg>.txt byte for byte, each of the seven leg goldens appears at least once, and no block without the waybill info string contains a golden's first line — so a sample cannot escape the check under another fence. — check: `node --test --test-name-pattern="samples match their goldens" tests/guide.test.js && grep -q 'samples match their goldens' tests/guide.test.js` → exits 0
- [ ] The glossary defines every word in the WORDS block of renderHelp(), plus handover, handler, route, fleet, overlay, papers and freight forwarder. — check: `node --test --test-name-pattern="defines every help-card word" tests/guide.test.js && grep -q 'defines every help-card word' tests/guide.test.js` → exits 0
- [ ] Every glossary entry carries a literal git-terms translation line, so the Dispatcher's voice never replaces a definition. — check: `node --test --test-name-pattern="every term is translated" tests/guide.test.js && grep -q 'every term is translated' tests/guide.test.js` → exits 0
- [ ] The reference names every file under commands/ (globbed, including commands/spec/), every flag parsed from the Options block of run(["--help"]), every key in the exported REQUIRED and OPTIONAL arrays of src/bookings.js, and both environment variables with their git-config keys. No list is hard-coded in the test. — check: `node --test --test-name-pattern="references the whole surface" tests/guide.test.js && grep -q 'references the whole surface' tests/guide.test.js` → exits 0
- [ ] The reference lists prerequisites for every carrier namespace derived from the command field of loadBookings(BUILTIN_BOOKINGS) (today: ideation, spec, waybill). The one mapping from spec to the openspec CLI lives in the test. — check: `node --test --test-name-pattern="lists every carrier's prerequisites" tests/guide.test.js && grep -q "lists every carrier's prerequisites" tests/guide.test.js` → exits 0
- [ ] docs/guide/README.md links to each of the three chapters, every relative markdown link inside docs/guide/ resolves (the test fails if it finds fewer than three links), and README.md carries a markdown link to docs/guide/. — check: `node --test --test-name-pattern="links resolve" tests/guide.test.js && grep -q 'links resolve' tests/guide.test.js && grep -qE '\]\(\.?/?docs/guide/?[^)]*\)' README.md` → exits 0
- [ ] The guide never teaches a deleted verb: no whole-word waybill start, wyb start or /waybill:start, and the directory must exist for the check to count. — check: `test -d docs/guide && ! grep -rqwE 'waybill start|wyb start|/waybill:start' docs/guide/` → exits 0
- [ ] The help card's pointer line names docs/guide/ in the waybill repo, still fits in 80 columns and 45 lines, and its golden is re-blessed. — check: `grep -q 'docs/guide/' tests/golden/help.txt && grep -q 'docs/guide/' src/help.js && node --test tests/help.test.js` → exits 0
- [ ] The unarchived add-help-card papers agree with the shipped card: the spec delta and design.md's rendered example name docs/guide/, and neither still describes a README pointer. — check: `grep -q 'docs/guide/' openspec/changes/add-help-card/specs/help-card/spec.md && ! grep -q 'One line pointing at the README' openspec/changes/add-help-card/specs/help-card/spec.md && ! grep -q 'the README pointer' openspec/changes/add-help-card/specs/help-card/spec.md && grep -q 'docs/guide/' openspec/changes/add-help-card/design.md && ! grep -q 'environment variables: README.md' openspec/changes/add-help-card/design.md` → exits 0
- [ ] Still zero dependencies and exactly one package script. — check: `node --test tests/commands.test.js` → exits 0
- [ ] tests/guide.test.js is registered in tests/index.js (an unregistered suite silently never runs on Node 26), contains no skipped or todo tests (so a grep twin cannot be satisfied by a placeholder), and the whole suite is green. — check: `grep -q 'guide.test.js' tests/index.js && ! grep -qE '\.(skip|todo)\(' tests/guide.test.js && node --test tests/` → exits 0
- [ ] The Dispatcher's voice lands and the ride-along can be followed cold: prose chapters are in character, tables and definitions are literal. — judgment call: The author reads docs/guide/README.md and 01-ride-along.md top to bottom without opening README.md and confirms it is fun and followable from the trunk to cleanup.

## Scope Boundaries

### In Scope

- docs/guide/README.md — the Dispatcher's welcome and the chapter index — GitHub renders a folder's README.md automatically, so the index is what someone who clicks docs/guide/ lands on.
- docs/guide/01-ride-along.md — feat/thing from the trunk through seven legs to cleanup, with each leg's waybill copied verbatim from its golden — The spine of the guide. The goldens already use feat/thing, which is what makes verbatim samples possible.
- docs/guide/02-glossary.md — the Dispatcher's clipboard: every help-card word plus handover, handler, route, fleet, overlay, papers and freight forwarder, each with a literal git translation — With Why out of scope, the glossary is where the metaphor gets explained. In-character headings, exact definitions.
- docs/guide/03-reference.md — slash commands, CLI subcommands and flags, booking frontmatter keys, and environment variables with their git-config keys — The lookup chapter. Literal tables so that lookups stay fast.
- tests/guide.test.js, registered in tests/index.js — coverage, golden-match, link and deleted-verb assertions — A third prose copy of waybill's surface drifts without mechanical guards; coverage tests fail the suite when the code outgrows the guide.
- A link to docs/guide/ in README.md — The README stays the front door; the guide has to be reachable from it.
- Repoint the help card's last line (src/help.js:55) to read "Ride-along, glossary and reference: docs/guide/ in the waybill repo" (67 columns), and re-bless tests/golden/help.txt — The card is what a cold-start reader sees first. The new wording names only what the guide actually covers, so it promises no overlay how-to, and it says whose docs/guide/ it means, since help runs in the user's own repo.
- Amend openspec/changes/add-help-card/specs/help-card/spec.md (lines 5, 20, 29, 34) and the rendered example at design.md:222 so the pointer requirement names the guide. proposal.md:16 and tasks.md:95 are history (ticked tasks) and are deliberately left alone. — That change is unarchived, so its delta is still the governing text; the card and its requirement must agree.
- A per-leg prerequisites table in 03-reference.md — A newcomer riding along will reach a leg whose carrier isn't installed; the reference has to say what each leg needs.
- Export REQUIRED and OPTIONAL from src/bookings.js (lines 22-23) — The reference coverage test must read the real booking-key lists; copying them into the test would let a new key drift past the check that exists to catch it.
- Show the --markdown waybill form next to the terminal form in the ride-along, also verbatim from goldens (tests/golden/<leg>.md) — Useful to desktop-app users, but it doubles the sample count and the ride-along's length.

### Out of Scope

- A standalone Why / design-rationale chapter — The author chose to leave it out after it was offered both standalone and folded into the ride. The reasoning stays in README.md and docs/superpowers/specs/2026-09-04-waybill-rename-design.md.
- A How-to / recipes chapter (swapping a carrier, writing an overlay, resuming after /clear) — The author chose to leave it out. README.md's 'Swapping a carrier' and overlay sections already cover these tasks.
- A /waybill:guide slash command — The guide is markdown in the repo. A slash command needs a DECLARED entry and a CLI-rendered source to be testable, which is a separate project.
- An HTML page or docs site — There is no site infrastructure, and HTML prose is harder to diff and grep-test.
- Slimming the README by moving its content into the guide — The two coexist and the README gains one link. Rewriting the front door in the same PR multiplies the review surface.
- Generating guide sections from src/ with a splice script — tests/commands.test.js enforces exactly one package script. Coverage tests catch drift without adding a generator.
- Archiving the add-help-card OpenSpec change — It is shipped but unarchived, which is a separate hygiene task. This project only amends its pointer wording.

### Future Considerations

- A Why chapter or How-to recipes, if readers ask for them after the guide ships.
- A /waybill:guide [chapter] slash command that prints a chapter, CLI-rendered so it is golden-testable.
- Archive openspec/changes/add-help-card so its (amended) delta folds into the living specs.

## Decisions Considered and Rejected

- **Write for a newcomer fluent in git and Claude Code who has never seen waybill** — rejected: The author wanting a deeper reference; newcomer and author layered; contributors changing waybill itself. The help card already serves the author at cold start. The unmet reader is the one waybill-help deferred: someone meeting it from zero.
- **Markdown in the repo under docs/** — rejected: A /waybill:guide slash command; markdown plus a slash command; a rendered HTML page. GitHub renders it, it ships in the plugin clone, node --test can grep it, and it adds no dependencies. A slash command is only testable if the CLI renders it.
- **Full character: a gruff narrator who talks to 'the rookie'** — rejected: In-world metaphor with git translations throughout; straight prose with wry asides. The author picked the most memorable voice after seeing all three side by side; the risk of cuteness obscuring meaning is handled by where the voice stops.
- **The Dispatcher narrates prose; the glossary and reference are 'the Dispatcher's clipboard', with in-character headings and literal definitions, commands, flags and paths** — rejected: The character everywhere, including reference rows; the character in the tutorial only. A gruff aside is funny once and costly on the fourth lookup of a flag. Literal tables keep lookups fast and make them testable.
- **The narrator is unnamed: 'the Dispatcher', ungendered** — rejected: A named character; waybill narrating in the first person as the forwarder. A role ages better than a person and doesn't compete with the tool's own vocabulary.
- **Coverage tests in tests/guide.test.js, each criterion with a grep twin** — rejected: Checking only that the guide exists and is linked; sections generated from src/ by a splice script. Existence-only lets drift through silently. A generator needs a second package script, which tests/commands.test.js forbids. The grep twin copies waybill-help's guard against --test-name-pattern runs that skip everything and still exit 0.
- **Why and How-to are out: the guide is a ride-along, a glossary and a reference** — rejected: Folding the why in as Dispatcher asides and the how-tos in as detour boxes; standalone Why and How-to sections. The brain dump named how-to and why, but when asked directly the author chose to leave them out. The README and design docs keep that content.
- **The guide and the README coexist, and the README gains a link** — rejected: Slimming the README by moving its long-form content into the guide. The smallest diff. The facts both documents repeat are guarded by the coverage tests rather than removed from one of them.
- **Ride-along samples are verbatim copies of tests/golden/<leg>.txt, asserted byte for byte** — rejected: Illustrative, abbreviated samples that are not tested. Waybill output is the part most likely to change. Re-blessing a golden then fails the guide test until the guide is updated too.
- **A folder of chapters in docs/guide/** — rejected: One docs/GUIDE.md capped at about 600 lines; one file with no cap. The author chose room to grow over a single scroll. The link-resolution test covers the extra links that chapters add.
- **Repoint the help card's pointer at docs/guide/ and amend add-help-card's spec delta to match** — rejected: Naming both the guide and README.md on one line, which leaves the spec unchanged; leaving the card alone. The author wants the guide to be the card's next step and the governing requirement to say so plainly, rather than working around the requirement's wording.
- **The reference includes per-leg prerequisites** — rejected: Leaving prerequisites in the README only. A newcomer riding along will reach a leg whose carrier isn't installed, and the reference is where they will look.
- **The help-card repoint, the spec amendment and the prerequisites table are MVP, not Full** — rejected: Keeping them in the Full tier (the pre-critic plan). The scope-creep critic found that goals G4 and G5 and three success criteria require them, so shipping MVP only would fail 3 of the 13 criteria. The goals won.
- **Export REQUIRED and OPTIONAL from src/bookings.js, and parse flags from run(["--help"])** — rejected: The pre-critic plan left the test's source for these lists unstated, which in practice means copying them into the test. Found by the hidden-dependency and success-criteria critics. A hard-coded list passes when a new key or flag lands, which defeats a coverage test.
- **Waybill samples live in ```waybill fences; that info string is what the golden test selects on** — rejected: Matching every fenced block, which the pre-critic plan left unspecified. The ride-along also has shell-command fences. Without a marker, the test either fails on those or quietly skips a drifting sample.
- **The help pointer reads "Ride-along, glossary and reference: docs/guide/ in the waybill repo"** — rejected: A bare docs/guide/, or keeping the old line's promise of overlays and environment variables. help runs in the user's own repo, so a bare path points at a folder that isn't there, and the guide deliberately has no overlay how-to. 67 columns, under the 80-column cap.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Waybill Guide
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/waybill-guide/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Waybill Guide contract (waybill-guide) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/waybill-guide/contract.md`. All commits belong on branch feat/waybill-guide — switch to it before any run.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/waybill-guide/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Waybill Guide _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-guide/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
