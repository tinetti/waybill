# Implementation Spec: Waybill Guide

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

The guide is four markdown files under `docs/guide/`, narrated by an unnamed, gruff, fond
**Dispatcher** who talks to "the rookie". It covers a ride-along, a glossary and a reference; Why
and How-to sections are out of scope. There is no generator and no new script. The facts are kept
honest by one new test suite, `tests/guide.test.js`, which reads the real sources of truth
(`LEGS`, the goldens, `renderHelp()`'s WORDS block, `commands/**`, the `--help` Options block, the
booking-key arrays, the built-in bookings) and fails when the guide falls behind any of them.

Build it **test-first**. Write `tests/guide.test.js` against a `docs/guide/` that doesn't exist
yet, register it in `tests/index.js`, and watch every assertion fail. Then export
`REQUIRED`/`OPTIONAL` from `src/bookings.js`, and write the chapters until the suite passes. The
ride-along's waybill samples are pasted verbatim from `tests/golden/<leg>.txt` inside
```` ```waybill ```` fences, so re-blessing a golden breaks the guide test until the guide is updated.

Two small edits outside `docs/` finish it off. The help card's last line (`src/help.js:55`) is
repointed at the guide and its golden re-blessed. The unarchived `add-help-card` OpenSpec change is
amended so its requirement matches the shipped card. Then the README gains one link.

### Voice rules (the Dispatcher)

These rules govern every prose paragraph. The tests cannot check them; the judgment criterion can.

- **Who:** an unnamed dispatcher. Weary, gruff, secretly fond. Addresses the reader as "rookie"
  or "you". Never gendered: no he/she for the Dispatcher or the reader.
- **Where the voice stops:** prose, section intros and headings are in character. Anything literal
  is plain and exact: commands, paths, flags, keys, definitions, table cells, and every fenced
  block. No jokes inside a code fence, a table cell or a `**Literally:**` line.
- **Every ride-along leg section ends with a plain translation**: one blockquote line starting
  `> **Plainly:**` that says what happened in git and Claude Code terms, with no character.
- Humor comes from the freight world (bays, trunks, dockets, carriers, the forwarder who "owns no
  trucks"), not from pop culture that will date. Keep sentences short. At most one gag per
  paragraph.
- Use waybill's own vocabulary. Never use the words waybill rejected: manifest, container,
  registry, pipeline, artifact, pitwall (see
  `docs/superpowers/specs/2026-09-04-waybill-rename-design.md:107-113`). Say "stamp", never
  "tracking".

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Write for a newcomer fluent in git and Claude Code who has never seen waybill** — rejected: the author wanting a deeper reference; newcomer and author layered; contributors. The help card already serves the author at cold start.
- **Markdown in the repo under docs/** — rejected: a /waybill:guide slash command; markdown plus a slash command; HTML. GitHub renders it, it ships in the plugin clone, node --test can grep it, and it adds no dependencies.
- **Full character: a gruff narrator who talks to 'the rookie'** — rejected: in-world metaphor with git translations throughout; straight prose with wry asides. The author picked the most memorable voice; the risk is handled by where the voice stops.
- **The Dispatcher narrates prose; glossary and reference are 'the Dispatcher's clipboard' with literal content** — rejected: the character everywhere; the character in the tutorial only. Lookups stay fast and testable.
- **The narrator is unnamed: 'the Dispatcher', ungendered** — rejected: a named character; waybill narrating in the first person. A role ages better and doesn't compete with the tool's vocabulary.
- **Coverage tests in tests/guide.test.js, each criterion with a grep twin** — rejected: checking only that the guide exists; sections generated from src/. Existence-only lets drift through; a generator needs a second package script, which tests/commands.test.js forbids.
- **Why and How-to are out** — rejected: folding them into the ride-along as asides and detour boxes; standalone sections. The author's call. README.md and the design docs keep that content.
- **The guide and the README coexist, and the README gains a link** — rejected: slimming the README. The smallest diff.
- **Ride-along samples are verbatim copies of tests/golden/<leg>.txt** — rejected: illustrative, untested samples. Waybill output is the part most likely to drift.
- **A folder of chapters in docs/guide/** — rejected: one docs/GUIDE.md capped at about 600 lines; no cap. The author chose room to grow.
- **Repoint the help card at docs/guide/ and amend add-help-card's spec delta to match** — rejected: naming both the guide and README.md on one line; leaving the card alone.
- **The reference includes per-leg prerequisites** — rejected: leaving them in the README only.
- **The help-card repoint, spec amendment and prerequisites are MVP** — rejected: the Full tier (pre-critic). Goals G4 and G5 require them.
- **Export REQUIRED and OPTIONAL from src/bookings.js; parse flags from run(['--help'])** — rejected: copying the lists into the test. A hard-coded list defeats a coverage test.
- **Waybill samples live in ```waybill fences, and that info string is what the golden test selects on** — rejected: matching every fenced block. The ride-along also contains shell fences.
- **The help pointer reads "Ride-along, glossary and reference: docs/guide/ in the waybill repo"** — rejected: a bare docs/guide/; keeping the promise of overlays and environment variables. help runs in the user's repo, and the guide has no overlay how-to.

## Feedback Strategy

**Inner-loop command**: `node --test tests/guide.test.js`

**Playground**: The test suite. Each chapter is written against the named assertion that guards it.

**Why this approach**: Every mechanical property of the guide is a test assertion, and the suite
runs in well under a second, so writing prose against a failing test is the tightest loop there
is. Voice is the one thing checked by reading, at the end.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `tests/guide.test.js` | Coverage, golden-match, glossary, link and deleted-verb assertions over `docs/guide/` |
| `docs/guide/README.md` | The Dispatcher's welcome and the chapter index (GitHub renders a folder's `README.md`) |
| `docs/guide/01-ride-along.md` | `feat/thing` from the trunk through seven legs to cleanup, with each leg's waybill verbatim |
| `docs/guide/02-glossary.md` | The clipboard: every help-card word plus seven more, each with a `**Literally:**` line |
| `docs/guide/03-reference.md` | Slash commands, CLI verbs and flags, booking keys, environment variables and git config, prerequisites |

### Modified Files

| File Path | Changes |
| --- | --- |
| `tests/index.js` | Add `import './guide.test.js';`, alphabetically between `frontmatter` and `help` |
| `src/bookings.js` | `export` the `REQUIRED` and `OPTIONAL` constants (lines 22-23). No behavior change |
| `src/help.js` | Line 55: `'Ride-along, glossary and reference: docs/guide/ in the waybill repo'` |
| `tests/golden/help.txt` | Re-blessed with `UPDATE_GOLDEN=1 node --test tests/help.test.js` |
| `README.md` | One link to `docs/guide/`, near the top (after the opening pitch, before *The route*) |
| `openspec/changes/add-help-card/specs/help-card/spec.md` | Line 20: `7. One line pointing at the guide (docs/guide/ in the waybill repo) for everything the page leaves out.` Line 29: "left to the guide". Line 34: "the guide pointer". Line 5 (the README as the thing the page spares you from re-reading) stays |
| `openspec/changes/add-help-card/design.md` | Line 222: the rendered example's last line becomes the new pointer text |

Deliberately left alone: `openspec/changes/add-help-card/proposal.md:16` and `tasks.md:95`. They
record a shipped change's history (ticked tasks), and the amended delta is the normative text.

### Deleted Files

None.

## Implementation Details

### 1. tests/guide.test.js (write first)

**Pattern to follow**: `tests/help.test.js`. Copy its `isolated()`, `cli()`, `section()` and
`usage()` helpers as they are (they are file-private, and promoting them is out of scope).
`assertGolden` is not needed: this suite reads goldens and never writes them.

**Overview**: One `describe('guide', …)` holding seven `it`s, named exactly as the contract's
criteria bind them. There are no `it.skip` or `it.todo` calls: criterion 12 greps for them.

```js
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const read = (name) => fs.readFileSync(path.join(GUIDE, name), 'utf8');
const EXTRA_TERMS = ['handover', 'handler', 'route', 'fleet', 'overlay', 'papers', 'freight forwarder'];

/** Fenced blocks as {info, body}; body excludes the fence lines and ends with '\n'. */
function fences(md) { /* scan lines; a fence opens on /^```(\S*)$/ and closes on /^```$/ */ }
```

**The seven assertions**:

1. **`rides every leg in order`**: collect the headings in `01-ride-along.md` that match
   `/^## Leg (\d) · ([a-z]+)\b/m`. Assert the ids equal `LEGS.map(l => l.id)` and that each number
   is its index + 1.
2. **`samples match their goldens`**:
   - Take every `waybill` fence in `01-ride-along.md`. Assert each body `===` the contents of some
     `tests/golden/<id>.txt` with `id` in LEGS, and that every LEGS id's golden matched at least
     once.
   - For every fence whose info string is not `waybill`, assert its body contains none of the
     seven goldens' first lines.
   - Assert that at least 7 waybill fences were found.
3. **`defines every help-card word`**: take the term column of
   `section(isolated(() => renderHelp(tempRoot())), 'WORDS', 'COMMANDS')`, the first
   whitespace-delimited token of each non-empty line. Add `EXTRA_TERMS`. For each term, assert that
   `02-glossary.md` has a heading line `### <term>` (exact, lowercase).
4. **`every term is translated`**: for every `### ` heading in `02-glossary.md`, assert a line
   starting `**Literally:**` appears before the next heading. Assert at least 15 headings, which
   is 8 help-card words plus 7 extra terms.
5. **`references the whole surface`**, all against `03-reference.md`:
   - **Commands:** glob `commands/*.md` and `commands/spec/*.md`. `commands/<n>.md` must appear as
     `/waybill:<n>`, and `commands/spec/<n>.md` must appear as `spec:<n>` (this matches both
     `/waybill:spec:<n>` and the bare `/spec:<n>`).
   - **Flags:** every `--flag` token matched by `/--[a-z][a-z-]*/g` in `usage().options`.
   - **Booking keys:** every key in the imported `REQUIRED` and `OPTIONAL`, as a code span
     `` `key` ``.
   - **Environment and config:** the four literals `WAYBILL_BOOKINGS_DIR`, `waybill.bookingsdir`,
     `WAYBILL_BAY_DIR` and `waybill.baydir`. These are the only literals; the contract's "no
     hard-coded list" rule applies to commands, flags and keys.
6. **`lists every carrier's prerequisites`**: take the namespaces of
   `[...loadBookings(BUILTIN_BOOKINGS).values()].map(b => b.command)`, where `/ideation:ideation`
   becomes `ideation`, deduplicated. Slice `03-reference.md` from `## Prerequisites` to the next
   `## `. Assert each namespace appears in that slice, and that `openspec` does too when `spec` is
   a namespace. That one mapping is the only one, and it lives here.
7. **`links resolve`**:
   - For every `.md` file in `docs/guide/`, collect `](target)` links whose target has no scheme
     and doesn't start with `#`. Strip any `#fragment` and assert `fs.existsSync` resolved against
     the file's directory.
   - Assert at least 3 links in total.
   - Assert that `README.md` in `docs/guide/` links to each of the three chapter files.

**Implementation steps**:

1. Write the file with all seven `it`s and the helpers.
2. Register it in `tests/index.js`.
3. Run `node --test tests/guide.test.js` and confirm all seven fail, with ENOENT or missing
   exports. Paste the failure summary into the PR description.

**Feedback loop**:

- **Playground**: `tests/guide.test.js`, run against a temporary one-line `docs/guide/02-glossary.md`.
- **Experiment**: add `### trunk` with no `**Literally:**` line (translated fails); add it
  (passes); drop `### docket` (defines fails); add a ```` ```text ```` fence containing
  `feat/thing · leg 6 of 7 (execute)` (samples fails).
- **Check command**: `node --test tests/guide.test.js`

### 2. Export the booking keys (src/bookings.js)

A trivial change: `const REQUIRED` → `export const REQUIRED`, and the same for `OPTIONAL`. There is
no feedback loop beyond `node --test tests/bookings.test.js` staying green.

### 3. docs/guide/01-ride-along.md

**Overview**: The spine. It opens on the trunk: the Dispatcher meets the rookie, who has an idea
for `feat/thing`. Then there is one section per leg.

```
## Leg 1 · ideate — <in-character title>
<2–5 short paragraphs of Dispatcher prose: the situation, what you type, what to watch for>
    waybill next          (or the slash command, in a plain ```sh fence)
```waybill
<tests/golden/ideate.txt, verbatim>
```
> **Plainly:** <one literal sentence — what happened in git / Claude Code terms>
```

**Key decisions**:

- Headings follow the form `## Leg N · <id> — <title>`, and the title after the dash is free.
  Test 1 reads only the `Leg N · <id>` part.
- Show every golden at full length, and don't trim `cleanup.txt` (30 lines). The byte-match test
  forbids trimming, so the prose around it should be short.
- The commands the rookie types go in ```` ```sh ```` fences, never in `waybill` fences.
- Between legs, mention `/clear` and a fresh session where the golden's NEXT block shows a
  `transfer` handover. That shows why the handler "forgets everything" without writing a Why
  section.
- Close with a short "End of the line" paragraph that points to `02-glossary.md` and
  `03-reference.md`.

**Implementation steps**:

1. For each LEGS id, read `tests/golden/<id>.txt` and the booking body in `bookings/*-<id>.md`,
   which describes what the carrier session does.
2. Write the section and paste the golden with no edits. Copy it with a script
   (`cat tests/golden/<id>.txt`) rather than retyping it, to avoid a whitespace mismatch.
3. Run the inner loop after each leg.

**Feedback loop**:

- **Playground**: the test suite.
- **Experiment**: write legs 1–3, run the suite, and check that `rides every leg in order` reports
  the missing `contract`.
- **Check command**: `node --test --test-name-pattern="rides every leg|samples match" tests/guide.test.js`

### 4. docs/guide/02-glossary.md

**Overview**: "The Dispatcher's clipboard". A one-paragraph in-character intro, then entries in
route-first order: trunk, docket, bay, leg, route, stamp, booking, carrier, waybill, handover,
handler, papers, fleet, overlay, freight forwarder.

```
### docket
<one or two lines of Dispatcher color — optional>
**Literally:** the git branch for one change; open whenever anything but the trunk is checked out.
```

Source the definitions from `src/help.js:37-44` (WORDS) and
`docs/superpowers/specs/2026-09-04-waybill-rename-design.md:35-85`. `handover` has to name both
values: `transfer` means `/clear` first, and `through` means no break. Keep every `**Literally:**`
line factual and free of character.

**Feedback loop**: `node --test --test-name-pattern="help-card word|term is translated" tests/guide.test.js`

### 5. docs/guide/03-reference.md

**Overview**: Literal tables under in-character `##` headings. It has these sections:

- `## Slash commands`: every `commands/*.md` and `commands/spec/*.md`, one row each: the command,
  what it does, and its argument. Note that legs 5–6 name the bare `/spec:*` form, with the
  symlink caveat from `README.md:83-85`.
- `## The CLI`: the `waybill` and `wyb` binaries, every subcommand from `--help`, every flag from
  the Options block, and `help`.
- `## Booking keys`: required `leg`, `command`, `model`; optional `effort`, `handover`,
  `argument`, `stampPath`, `stampCmd`. Give the meaning of each and one example booking, copied
  from `bookings/ideation-refine.md`.
- `## Environment and git config`: `WAYBILL_BOOKINGS_DIR` / `waybill.bookingsdir`,
  `WAYBILL_BAY_DIR` / `waybill.baydir`, and `--bay-dir` precedence, from `README.md:208-228` and
  `README.md:277-320`.
- `## Prerequisites`: one row per carrier namespace (ideation, spec, which means openspec, and
  waybill), from `README.md:236-241`.

Link to README anchors for the long form. Test 7 resolves the file part of each link, not the
fragment.

**Feedback loop**: `node --test --test-name-pattern="whole surface|carrier's prerequisites" tests/guide.test.js`

### 6. docs/guide/README.md

**Overview**: The Dispatcher's welcome, under 40 lines. Who the guide is for (fluent in git and
Claude Code, new to waybill), a three-row chapter table linking `01-ride-along.md`,
`02-glossary.md` and `03-reference.md`, and a pointer back to `../../README.md` for install. A
trivial page, so it has no loop beyond `links resolve`.

### 7. Help-card pointer, OpenSpec amendment, README link

1. Edit `src/help.js:55`. Run `UPDATE_GOLDEN=1 node --test tests/help.test.js`, then
   `node --test tests/help.test.js`. The existing 80-column and 45-line checks guard the new
   67-column line.
2. Amend `spec.md` lines 20, 29 and 34 and `design.md:222` as listed in File Changes.
3. Add the README link as a markdown link, `[the Waybill Guide](docs/guide/)`, with one sentence
   in the README's own voice. The README doesn't use the Dispatcher's voice.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/guide.test.js` | The seven named assertions above |
| `tests/help.test.js` | Unchanged; must pass against the re-blessed golden |
| `tests/commands.test.js` | Unchanged; still zero dependencies and exactly one script |

**Key test cases**: a new LEGS id with no ride-along section fails; a re-blessed golden fails
until the guide is updated; a new flag in USAGE or a new booking key fails; a waybill pasted into
a ```` ```text ```` fence fails; a glossary entry with no `**Literally:**` line fails; a broken
chapter link fails.

### Manual Testing

- [ ] Run `node --test tests/` on Node 22 and on Node 26. The repo has no CI.
- [ ] Read `docs/guide/README.md` and then `01-ride-along.md` top to bottom without opening the
      README. It should be followable and fun (the contract's judgment criterion).
- [ ] View `docs/guide/` on GitHub after pushing, and check that the fences and tables render.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Golden samples | Whitespace mismatch | Retyping a golden, or an editor trimming trailing spaces or converting `·`/`✓`/`▶` | Test 2 fails on a sample that looks identical | Paste goldens by script; compare bytes in the failure message |
| Golden samples | Sample escapes the check | A waybill pasted under ```` ```text ```` | Silent drift | Test 2's first-line scan of non-`waybill` fences |
| Fence parser | Nested or indented fences mis-parsed | A golden containing a backtick fence (none do today) | Block boundaries wrong | Fences open and close only at column 0; the hidden-dependency critic confirmed no golden has a fence |
| Coverage test | Passes vacuously | Regex matches nothing (zero headings, fences or links) | Guide unguarded | Every assertion also checks a minimum count |
| Glossary parse | WORDS block shape changes | help.js reformats WORDS | Term extraction breaks | `section()` asserts headings exist, so it fails loudly |
| Help pointer | Relative path misread | `help` runs in the user's own repo | Reader looks for a `docs/guide/` that isn't there | Wording says "in the waybill repo" |
| Voice | Character obscures a fact | A joke in a definition or table | Wrong or unclear reference | Voice rules; `**Literally:**` and `> **Plainly:**` lines stay literal |

## Validation Commands

```bash
# The whole suite (the only script)
node --test tests/

# The inner loop
node --test tests/guide.test.js

# Re-bless the help golden after the pointer edit
UPDATE_GOLDEN=1 node --test tests/help.test.js && node --test tests/help.test.js

# Deleted verbs
test -d docs/guide && ! grep -rqwE 'waybill start|wyb start|/waybill:start' docs/guide/
```

There is no typecheck, lint or build step in this repo.

## Rollout Considerations

- The next `chore: release` PR ships it. Don't bump the version in this PR, because release PRs
  own versioning in this repo.
- Rollback: revert the PR. Nothing else depends on `docs/guide/`.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
