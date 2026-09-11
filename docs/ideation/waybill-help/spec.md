# Implementation Spec: Waybill Help Card

**Contract**: ./contract.md
**Estimated Effort**: S

> **Blocked.** This spec is written against a command surface that does not exist yet. Do not begin
> until `docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md` has been implemented and
> merged: it renames `start` to `bay` (no alias), adds `new`, makes trunk `next` exit 2, and turns
> trunk `status` into a fleet view. The gate is mechanical — run it first:
>
> ```bash
> node bin/waybill --help | grep -qE '^  new' && node bin/waybill --help | grep -qE '^  bay'
> ```
>
> If that exits non-zero, stop and report the prereq as unmet. Every command name in the walkthrough
> and commands sections below assumes it passed.

## Technical Approach

`waybill help` prints a fixed, single-screen reference page. It is a fourth subcommand alongside
`new`, `bay`, `next` and `status`, and it follows the plugin's established shape exactly: the CLI
renders text, and `commands/help.md` is a passthrough that shows that text verbatim. Nothing about
the page is composed by the model at invocation time, so the whole page is coverable by one golden
file — the same guarantee every other rendered surface in this repo has.

The page has two halves with different maintenance stories. The **generated half** is the route
table: seven rows built by walking `LEGS` from `src/legs.js` and joining each id against the
bookings resolved by `resolveBookings(cwd)`. Adding a leg or rebooking a carrier changes the page
with no edit to `src/help.js`. The **written half** is the from-zero walkthrough, the glossary, the
four command lines, the two-line Why footer and the README pointer — prose that no data source in
the repo can produce, because `LEGS` entries carry only `{id, owner, progress}` and booking
frontmatter has no description key. The written half is guarded structurally instead: tests assert
the four section headings exist, that the walkthrough names `waybill new`, `waybill bay` and `cd`,
and that every subcommand `--help` lists also appears here.

Help is the only surface in the tool that reports nothing about the repository. It never calls
`resolveLeg`, never reads the branch, the worktree list or the diff, and never exits 2 for want of a
git repository — a reference that refuses to print outside a repo is a reference you cannot reach
for when you are lost. It does resolve bookings, which reaches `git config waybill.bookingsdir`
(`src/bookings.js:113-116` via `src/repo.js:30-32`); that is configuration, not position, and the
golden test neutralises it so an operator's overlay cannot rewrite the recorded page.

**Minimum-approach note.** `src/help.js` exports one function taking one argument and returning a
string. There is no options object, no width parameter, no section registry, no theme. The 45-line
budget is a module constant, not a knob.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Sequence the help card after the new-bay-and-fleet design lands, and write it against that
  command surface** — rejected: shipping now against today's verbs and rewriting later; folding it
  into that design's branch; shipping only the route table and glossary. That design renames `start`
  to `bay` with no alias and adds `new` as the trunk entry point. A walkthrough written today would
  teach a deleted verb and byte-lock it into `tests/golden/help.txt`, then need the walkthrough, the
  golden and the README row rewritten — while colliding on `src/cli.js`, `src/waybill.js`,
  `README.md` and two test files.
- **Drop the no-docket discovery pointer from scope entirely** — rejected: adding one line to the
  trunk render pointing at `/waybill:help`. The prereq design already makes trunk `next` exit 2 with
  ``no dockets open — begin one with `waybill new` ``, which closes the discovery gap for free and in
  the renderer that design is rewriting.
- **Help is static CLI-rendered text, printed verbatim by the model** — rejected: the model composes
  the prose fresh each invocation. Every waybill slash command is a passthrough that runs
  `src/cli.js` and shows the output verbatim (`commands/status.md:24`). Model-composed help would be
  the only output in the plugin that differs between runs, and would be untestable by the golden
  harness the whole suite is built on.
- **The route table is generated from `LEGS` plus `resolveBookings`; help reads booking
  configuration but never repository state** — rejected: a hardcoded route table; and the earlier
  phrasing that help "never reads git state", which was false as written because `resolveBookings`
  shells out to `git config`. The distinction that holds is that help never infers position.
- **A route row is the leg id, the resolved booking's command, and a stamp column derived from the
  booking; the two wrapper-owned legs use a fixed phrase keyed off `LEGS`' `owner` field** —
  rejected: a human gloss per leg written into `src/help.js`, or adding a `label` field to `LEGS`.
  Any per-leg prose would be a table inside `help.js` — exactly the edit the zero-drift goal forbids.
- **The commands section is hand-written prose, cross-checked test-side by parsing
  `run(['--help'], { out })`** — rejected: generating it from `USAGE`. `USAGE` is module-private
  (`src/cli.js:12-26`); generating would require exporting it plus an ASCII-column parser in `src/`,
  and would create an import cycle between `help.js` and `cli.js`.
- **Every `--test-name-pattern` criterion is paired with a `grep` twin asserting the named test
  exists** — rejected: binding criteria to `--test-name-pattern` alone. `node:test` skips tests that
  do not match the pattern, and a run where everything is skipped exits 0, so a never-written
  assertion would be indistinguishable from a passing one.
- **`--help` gains exactly one row for `help`; the Options block and existing Commands rows stay
  byte-identical** — rejected: keeping `USAGE` byte-identical overall and leaving `help` unlisted. A
  subcommand absent from its own usage output is undiscoverable by the route a CLI user reaches for
  first.
- **A 45-line cap, asserted by a test** — rejected: writing whatever length the content wants. The
  README already contains every word of this content in 13.8K; without a mechanical cap the page
  grows back into the README, which is the failure mode this project exists to avoid.
- **A flat page with no arguments, and no context-awareness** — rejected: `/waybill:help <topic>`
  drill-down; help reading the repo to highlight the current leg. `next` and `status` already own the
  stateful surfaces, and `status` sets the precedent of a deliberately option-free command
  (`src/cli.js:97-99`).
- **The glossary carries the reasoning; a two-line Why footer, not a rationale section** — rejected:
  a dedicated section explaining the design premises. The vocabulary is the mental model; the essay
  already exists in the README and would consume a third of the line budget.
- **A separate `/waybill:help` command rather than enriching the trunk waybill** — rejected: printing
  the full route from `next` when no docket is open. `README:192-195` makes one-waybill-per-leg the
  tool's premise. The map belongs to the human; the waybill belongs to the handler.

**Gap decision made in this spec** (extends the route-row decision above, which named only
`stampPath` and `owner`): two booking-owned legs have no `stampPath` — `ideate` carries
`stampCmd: false`, and `execute` carries a multi-line shell `stampCmd` that cannot render in a
column. The stamp column therefore resolves in four ordered cases, described under Component 1. If
you disagree with that ordering, change it here rather than inventing a per-leg literal table.

## Feedback Strategy

**Inner-loop command**: `node --test tests/help.test.js`

**Playground**: the test suite, plus `node bin/waybill help` in a terminal for eyeballing layout.
Column alignment is the thing you will iterate on most, and reading it in a terminal is faster than
reading a diff.

**Why this approach**: the entire deliverable is one string, so the tightest possible loop is a
single scoped test file that renders that string and asserts against it — seconds, no fixtures to
build for most iterations, and `UPDATE_GOLDEN=1` to re-bless once the layout is settled.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/help.js` | Renders the reference page: four sections, Why footer, README pointer. One exported function. |
| `commands/help.md` | Slash-command passthrough; mirrors `commands/status.md`. |
| `tests/help.test.js` | The named assertions the contract's success criteria bind to, plus the golden. |
| `tests/golden/help.txt` | Byte-exact recorded page, rendered under a neutralised environment. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/cli.js` | Add a `help` command function; add `['help', help]` to `COMMANDS`; add exactly one row to the `USAGE` Commands block. Do not touch the Options block or the existing rows. |
| `tests/commands.test.js` | Add `'help.md'` to `DECLARED` (sorted position: after `'cleanup.md'`). Add a named assertion `exactly one script` pinning `package.json`'s `scripts` map to just `test`. |
| `tests/index.js` | Add `import './help.test.js';` in alphabetical position. **Mandatory** — an unregistered suite silently never runs on Node 26. |
| `README.md` | Add a `/waybill:help` row to the command table. Nothing else; the surrounding README edits belong to the prereq design. |

### Deleted Files

None.

## Implementation Details

### Component 1 — `src/help.js`

**Pattern to follow**: `src/waybill.js` (a pure renderer returning a string, tested by golden file).

**Overview**: one exported function that builds the page from `LEGS` and the resolved bookings and
returns it as a single string ending in a newline.

```js
/**
 * The reference page. Pure: given the same bookings it returns the same string, and it reads no
 * repository state — no branch, no worktree, no diff. `cwd` is passed through to
 * `resolveBookings` only, which is configuration rather than position.
 *
 * @param {string} cwd
 * @returns {string}
 */
export function renderHelp(cwd) { /* ... */ }

/** Hard budget. A constant, not an option: the cap is the feature. */
export const MAX_LINES = 45;
```

**Key decisions**:

- **The stamp column resolves in four ordered cases**, checked in this order per leg:
  1. `leg.owner === 'wrapper'` → a fixed phrase keyed off the leg id: `bay` → `bay exists`,
     `cleanup` → `merged, bay gone`. Two literals, proportional to a field that already exists.
  2. `leg.progress === true` → `all tasks ticked`. Covers `execute`, whose `stampCmd` is a
     multi-line shell pipeline that cannot render in a column.
  3. `booking.stampPath` present → the glob's basename (`docs/ideation/*/contract.md` →
     `contract.md`). Covers `refine`, `contract`, `specs`.
  4. otherwise → `repo state`. Covers `ideate`, whose `stampCmd: false` never succeeds by design.
- **Carrier comes from `booking.command` verbatim.** Never a literal. A rebooked leg must show the
  rebooked carrier or the page lies to anyone running an overlay.
- **A leg with no booking renders its id with an em-dash in both columns** rather than throwing.
  Help is a reference; refusing to print because one booking is missing is the worst possible
  failure for the one command someone runs when lost.
- **Column widths are computed from the rendered rows**, not hardcoded, so a longer carrier name
  cannot break alignment silently.

**Implementation steps**:

1. Import `LEGS` from `./legs.js` and `resolveBookings` from `./bookings.js`.
2. Build the route rows: for each leg, `{ index, id, carrier, stamp }` using the four-case rule.
3. Compute column widths across the rows; format the route block.
4. Assemble the page in fixed order: title line, `FROM ZERO`, `ROUTE`, `WORDS`, `COMMANDS`, Why
   footer, README pointer.
5. Return the joined string with a trailing newline.

**Feedback loop**:

- **Playground**: `tests/help.test.js` with one smoke test that prints the render, plus
  `node bin/waybill help` in a terminal for alignment.
- **Experiment**: render with the shipped bookings; render with a fixture overlay that rebooks
  `execute` to a different carrier; render with a bookings dir that is missing one leg's file; render
  from a directory outside any git repository.
- **Check command**: `node --test tests/help.test.js`

### Component 2 — the `help` subcommand in `src/cli.js`

**Pattern to follow**: the `status` function in `src/cli.js` — but simpler, because `help` resolves
no repository.

**Overview**: a command function that writes the page and returns 0, plus one `USAGE` row.

```js
/**
 * The reference page. Unlike every other subcommand, this one never resolves a repository: exit 2
 * is reserved for "there is nothing here to answer about", and there is always something to answer
 * about here.
 */
function help(cwd, args, io) {
  if (args.length > 0) { io.err(`waybill: \`help\` takes no arguments\n`); return 2; }
  io.out(renderHelp(cwd));
  return 0;
}
```

**Key decisions**:

- **Reject arguments rather than ignoring them**, matching `status`'s existing strictness
  (`src/cli.js:97-99`). `waybill help bay` should say so, not silently print the flat page.
- **Add `help` to the `COMMANDS` Map**, and exactly one row to `USAGE`'s Commands block. The Options
  block and the existing rows stay byte-identical — a test asserts this.
- **Do not touch the `--help` early return** at `src/cli.js:224`. `waybill help --help` printing
  `USAGE` is correct and needs no special case.

**Implementation steps**:

1. Import `renderHelp` from `./help.js`.
2. Add the `help` function next to `status`.
3. Add `['help', help]` to the `COMMANDS` Map.
4. Add one row to the `USAGE` Commands block: `'  help            This page: the route, the words, and the four verbs',`.

**Feedback loop**:

- **Playground**: `node bin/waybill help`, `node bin/waybill help extra`, `node bin/waybill --help`.
- **Experiment**: confirm exit 0 for the bare form, exit 2 with a message for an argument, and that
  `--help` output gained exactly one line.
- **Check command**: `node bin/waybill help >/dev/null && ! node bin/waybill help extra 2>/dev/null`

### Component 3 — `commands/help.md`

**Pattern to follow**: `commands/status.md` — copy its shape exactly.

**Overview**: frontmatter with `description` and `allowed-tools` and deliberately **no** `model:` or
`effort:`; an HTML rationale comment; the guarded `` ! `` block; a `## Task` section instructing a
verbatim show-and-stop.

```markdown
---
description: "Waybill — the route, the words, and the four verbs"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---
```

**Key decisions**:

- **`${CLAUDE_PLUGIN_ROOT}` stays bare — no `:-` fallback.** `commands/next.md:13-24` records why: a
  fallback points at `./src/cli.js` in the operator's own repo and hands the model a raw
  `MODULE_NOT_FOUND` dump instead of the block.
- **No `model:` / `effort:` frontmatter**, for the reason the other three top-level commands state in
  their own comments: the models named in waybill's output belong to the bookings, not to this
  session. Help names models in its route table, which makes this doubly true.
- **The `## Task` says show verbatim and stop**, and — unlike `status.md` — needs no "do not infer
  the next leg" clause, because help issues no waybill to be tempted by.

**Implementation steps**:

1. Copy `commands/status.md`.
2. Replace the frontmatter description, the rationale comment, and the heading.
3. Change the `` ! `` block's subcommand from `status` to `help`.
4. Rewrite `## Task` to the verbatim show-and-stop, dropping the `IGNORED BY GIT` clause (help never
   prints findings).
5. Add `'help.md'` to `DECLARED` in `tests/commands.test.js`, in sorted position.

**Feedback loop**: omitted — this is a static markdown file with no logic. Its correctness is covered
by `tests/commands.test.js`.

### Component 4 — `tests/help.test.js` and the golden

**Pattern to follow**: `tests/waybill.test.js:41-48` for `assertGolden`; `tests/bookings-overlay.test.js:37-42`
for environment neutralisation.

**Overview**: the named assertions the success criteria bind to. **Test names are load-bearing** —
each is grepped for by a criterion, so do not rename them without updating `contract-data.json`.

Required test names, verbatim:

| Test name | Asserts |
| --- | --- |
| `fits one screen` | rendered line count ≤ 45 |
| `lists every leg` | every id in `LEGS` appears, in order |
| `reflects a rebooked carrier` | an overlay fixture changes the carrier shown for that leg |
| `golden under a neutralised environment` | byte-exact against `tests/golden/help.txt` |
| `covers every subcommand` | every subcommand `run(['--help'], { out })` lists appears in the page |
| `names all four sections` | the four headings exist; walkthrough names `waybill new`, `waybill bay`, `cd` |
| `outside a repository` | renders and does not throw when `cwd` is outside any repo |
| `--help stays terse` | Options block and pre-existing Commands rows unchanged; exactly one row added |

**Key decisions**:

- **`assertGolden` is private to `tests/waybill.test.js`.** Either copy it or promote it to
  `tests/helpers/repo-fixture.js`. Promoting is better — `tests/cli.test.js:84,158` currently reads
  goldens with plain `fs`, so a shared helper has two existing callers — but copying is acceptable
  and keeps this change small. Do not leave two divergent copies.
- **Neutralise `WAYBILL_BOOKINGS_DIR` and `git config waybill.bookingsdir`** before rendering the
  golden, via `withEnv` from the shared helper plus the `GIT_CONFIG_GLOBAL=/dev/null` /
  `GIT_CONFIG_SYSTEM=/dev/null` pinning that `tests/helpers/repo-fixture.js` already applies at module
  load. Without it, an operator with a global overlay renders a different page and the golden fails
  for reasons that have nothing to do with their change.
- **`covers every subcommand` parses `run(['--help'], { out })`** — take the leading token of each
  line between `Commands:` and `Options:`. No new export from `src/cli.js`, no parser in shipped code.
- **No PATH stripping needed.** `loadBookings` parses frontmatter and never executes `stampCmd`, so
  unlike `tests/waybill.test.js` this suite does not need `pathWithout('openspec')`.

**Implementation steps**:

1. Create the suite with the eight named tests above.
2. Add `import './help.test.js';` to `tests/index.js` in alphabetical position.
3. Build the overlay fixture: a temp dir with one booking file rebooking a leg, pointed at by
   `WAYBILL_BOOKINGS_DIR` via `withEnv`.
4. Run `UPDATE_GOLDEN=1 node --test tests/help.test.js` to mint `tests/golden/help.txt`.
5. **Read the golden diff before committing.** Regeneration is an env flag precisely so a
   self-blessing file cannot become a tautology.

**Feedback loop**:

- **Playground**: the suite itself.
- **Experiment**: run with the overlay set and unset; run from a temp dir outside any repo; delete a
  booking file and confirm the em-dash row rather than a throw.
- **Check command**: `node --test tests/help.test.js`

### Component 5 — the README row

**Overview**: one row in the command table. Trivial; no feedback loop.

**Key decision**: touch only the row. The prereq design already lists `README.md` as modified and
owns the surrounding edits, including the trunk-output sample block.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/help.test.js` | The eight named assertions above, plus the golden. |
| `tests/commands.test.js` | `help.md` present and declared; `scripts` map pinned to exactly `test`. |

**Key test cases**:

- Rendered page is ≤ 45 lines.
- All seven `LEGS` ids appear in route order.
- An overlay rebooking a leg changes that row's carrier.
- A missing booking renders an em-dash row rather than throwing.
- Rendering from outside a git repository succeeds.
- `waybill help extra` exits 2.
- `--help` gained exactly one line and its Options block is unchanged.

### Manual Testing

- [ ] `node bin/waybill help` — columns align, page fits one terminal screen without scrolling.
- [ ] `/waybill:help` in a session — the model shows the block verbatim and stops.
- [ ] Read the page cold and confirm you can get from the trunk to a bay without opening the README.
      _(This is success criterion 13, the one judgment check in the contract.)_

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `src/help.js` | Missing booking for a leg | Overlay dir shadows a leg with a malformed file, or a booking is deleted | `renderHelp` throws; the one command for a lost operator prints a stack trace | Render an em-dash row for that leg; never throw from the renderer |
| `src/help.js` | Silent truncation of the route | A leg is added to `LEGS` with no booking and is skipped rather than rendered | The page under-reports the route and nobody notices | `lists every leg` asserts against `LEGS` directly, not against the bookings map |
| `src/help.js` | Column blowout | A rebooked carrier name is much longer than the shipped ones | Rows wrap; the page silently exceeds 45 lines | Widths computed from rendered rows; `fits one screen` asserts the cap |
| `tests/help.test.js` | Golden rendered under a dirty environment | Developer has `WAYBILL_BOOKINGS_DIR` or `waybill.bookingsdir` set | Golden encodes that developer's overlay and fails for everyone else | `withEnv` neutralisation plus the helper's existing `GIT_CONFIG_*` pinning |
| `tests/help.test.js` | Vacuous pass | A named test is renamed or never written | Seven criteria pass against nothing | Each criterion carries a `grep` twin for its test name |
| `tests/help.test.js` | Suite never runs | `tests/index.js` not updated | Green suite on Node 26 with the whole file skipped | Criterion greps `tests/index.js`; called out in the file-changes table |
| `commands/help.md` | Unset `CLAUDE_PLUGIN_ROOT` | Plugin invoked outside its install | Raw `MODULE_NOT_FOUND` dump instead of the page | The `if [ -f ... ]` guard with the explanatory `echo`, copied from `status.md` |

## Validation Commands

```bash
# Prereq gate — run first; stop if this fails
node bin/waybill --help | grep -qE '^  new' && node bin/waybill --help | grep -qE '^  bay'

# Inner loop
node --test tests/help.test.js

# Re-bless the golden (read the diff before committing)
UPDATE_GOLDEN=1 node --test tests/help.test.js

# Full gate
node --test tests/
```

There is no lint, typecheck, or build step in this repo, and none is being added — `tests/commands.test.js`
asserts that `package.json` declares no build script and zero dependencies.

## Rollout Considerations

No feature flags, no monitoring, no migration. The change is additive: one new subcommand, one new
slash command, one new test suite, one README row, and one line added to `USAGE`. Rollback is
deleting the four new files and reverting four small edits.

## Open Items

- [ ] Decide whether to promote `assertGolden` into `tests/helpers/repo-fixture.js` or copy it into
      `tests/help.test.js`. Promoting is better (two existing callers read goldens by hand) but
      widens the diff. Either is acceptable; leaving two divergent copies is not.

---

_This spec is ready for implementation once the prereq gate passes. Follow the patterns and validate at each step._
