## ADDED Requirements

### Requirement: A booking marks its leg as brief-taking

A booking MAY declare a `brief` key: a single line of free-text guidance telling the author of a
brief what the leg's command needs to know. A leg SHALL be brief-taking if and only if the booking in
force for it declares a non-empty `brief`. The value SHALL be passed through verbatim and SHALL NOT
be validated against any list.

An overlay booking replaces the built-in whole, as for every other key: an overlay that omits `brief`
makes its leg not brief-taking, and an overlay that adds `brief` to any leg makes that leg
brief-taking.

The stock `ideate` and `specify` bookings SHALL declare `brief`. No other stock booking SHALL.

#### Scenario: A stock brief-taking leg
- **WHEN** the built-in bookings are loaded
- **THEN** the `ideate` and `specify` bookings each carry a non-empty `brief`, and `bay`, `execute`,
  `review`, `cleanup` and the off-route `brainstorm` carry none

#### Scenario: An overlay drops the key
- **WHEN** an overlay rebooks `ideate` without a `brief` key
- **THEN** `ideate` is not brief-taking for that checkout

#### Scenario: An overlay adds the key
- **WHEN** an overlay rebooks `execute` with `brief: what the proposal left open`
- **THEN** `execute` is brief-taking for that checkout, with that guidance

### Requirement: The run line carries the brief and Waybill's context

When the markdown rendering prints a `RUN:` line for a brief-taking leg, the line SHALL be the
booking's own command and argument followed by a context suffix, all on one line. The suffix SHALL
consist of these fields, in this order, joined by ` · `:

1. `Brief: <absolute path> (read first)` when a brief file exists for that leg in the docket's bay,
   and `Brief: none written` when it does not
2. `branch <branch>`
3. `bay <absolute path>`
4. `ideation <directory>`, omitted when the docket has no ideation directory
5. `skipped <leg>[,<leg>…]`, omitted when no leg was skipped
6. `next after this session: <leg>`, omitted when no leg follows

The brief's path SHALL be `<bay>/.waybill/handoff/<leg>.html`, where `<leg>` is the leg that reads
it. The line SHALL contain no newline, whatever the booking or the repository supplies.

A `RUN:` line for a leg that is not brief-taking SHALL carry no suffix and SHALL be byte-identical to
its previous output. The runs annotation (``→ runs `<command>` ``) SHALL continue to name the
booking's bare command and argument, with no suffix.

#### Scenario: A brief has been written
- **WHEN** `next --markdown feat/x/ideate` is run, `feat/x` is at the ideate leg, and
  `<bay>/.waybill/handoff/ideate.html` exists
- **THEN** the `RUN:` line reads `RUN: /ideation:ideation Brief: <bay>/.waybill/handoff/ideate.html
  (read first) · branch feat/x · bay <bay> · next after this session: specify`, on one line

#### Scenario: No brief has been written
- **WHEN** the same command is run and no brief file exists for `ideate`
- **THEN** the `RUN:` line carries `Brief: none written` in place of the path, followed by the same
  remaining fields, and names no file under `.waybill/handoff/`

#### Scenario: The specify leg
- **WHEN** `next --markdown feat/x/specify` is run, `feat/x` is at the specify leg with its contract
  under `docs/ideation/thing/`, and `<bay>/.waybill/handoff/specify.html` exists
- **THEN** the `RUN:` line begins `RUN: /spec:propose Brief: <bay>/.waybill/handoff/specify.html
  (read first)` and its suffix includes `ideation docs/ideation/thing`

#### Scenario: A leg that takes no brief
- **WHEN** `next --markdown feat/x/execute` is run and `feat/x` is at the execute leg
- **THEN** the `RUN:` line is the booking's command and argument alone, identical to the output
  before this change

#### Scenario: The annotation stays bare
- **WHEN** a markdown waybill is rendered for a brief-taking transfer leg on a docket with a bay
- **THEN** the runs annotation names the booking's command with no `Brief:` text

### Requirement: A display run announces an unwritten brief

When the markdown rendering issues a waybill without a `RUN:` line — a display run — and the
docket's next leg is brief-taking, the docket has a bay, and no brief file exists for that leg, the
document SHALL carry the keyed line `BRIEF: <leg> <absolute path>`, naming the leg and the path its
brief would be written to.

The line SHALL NOT appear when the next leg is not brief-taking, when the docket has no bay, when a
brief already exists for that leg, when there is no next leg, or on any run that prints `RUN:` or
`NEXT LEG:`. The plain rendering and `next --json` SHALL never carry it.

#### Scenario: Handing off to ideate from a fresh bay
- **WHEN** `bay --markdown feat/x` cuts a new bay and the next leg is `ideate`
- **THEN** the output carries `BRIEF: ideate <bay>/.waybill/handoff/ideate.html`

#### Scenario: Handing off to specify
- **WHEN** `next --markdown` is run inside a bay whose next leg is `specify` and no brief exists
- **THEN** the output carries `BRIEF: specify <bay>/.waybill/handoff/specify.html`

#### Scenario: The brief is already there
- **WHEN** the same command is run and `<bay>/.waybill/handoff/specify.html` exists
- **THEN** no `BRIEF:` line appears

#### Scenario: The next leg takes no brief
- **WHEN** `next --markdown` is run inside a bay whose next leg is `execute`
- **THEN** no `BRIEF:` line appears

#### Scenario: A docket with no bay
- **WHEN** `next --markdown` is run on a feature branch checked out in the main checkout
- **THEN** no `BRIEF:` line appears

#### Scenario: A run-mode waybill
- **WHEN** `next --markdown feat/x/ideate` prints a `RUN:` line
- **THEN** no `BRIEF:` line appears, whether or not a brief exists

## MODIFIED Requirements

### Requirement: Markdown document shape

The markdown rendering SHALL be a complete markdown document with the following sections, separated
by one blank line:

- **Keyed lines**: the `ENTER BAY:`, `RUN:` and `NEXT LEG:` lines the `command-surface` capability
  defines, present only when `next` was given a docket by name, and the `BRIEF:` line, present only
  on a display run with an unwritten brief; each a paragraph of its own. `ENTER BAY:` SHALL come
  first when present, and `BRIEF:` SHALL never share a document with `RUN:` or `NEXT LEG:`.
- **Position**: the same header and leg-strip lines as the plain rendering, inside a `text` fence so
  their line breaks survive. With no docket open, only the header is shown.
- **NEXT**: the introducing line, any custom handover prose as a plain paragraph, then the command
  fences.
- **Runs annotation**: ``→ runs `<command>` `` as a plain paragraph after the last command fence,
  present exactly when that fence carries `/waybill:next <branch>/<leg>` in place of the leg's own
  command. It names what the wrapper will run, which is otherwise the one part of a booking the
  handover does not show. It SHALL NOT be fenced, and SHALL NOT begin with a keyed prefix: a fence
  reads as another block to paste, and a `RUN:` line is one a session invokes.
- **Booking body**: unindented prose, after the runs annotation where there is one and after the last
  command fence otherwise.
- **IGNORED BY GIT** and **WARNINGS**: each a bold heading followed by `- ⚠ …` bullets, with the same
  text and order as the plain rendering, WARNINGS last.

When there is no current leg, or no booking for it, the NEXT section SHALL state that in one line with
no fences. The document SHALL end with exactly one newline. It SHALL contain no `cd`: a session cannot
act on one, and the plain rendering keeps it for the shell.

#### Scenario: Position survives markdown rendering
- **WHEN** a markdown waybill is rendered for a docket with completed legs
- **THEN** the header and every strip line appear, one per line, inside a single `text` fence

#### Scenario: Resolved from the trunk
- **WHEN** the markdown waybill is rendered for a docket whose bay the operator is not standing in
- **THEN** no IN BAY section and no `cd` appear, a transfer handover's last command is
  `/waybill:next <branch>/<leg>`, and the runs annotation names the leg's own command below it

#### Scenario: A handover with no wrapper carries no annotation
- **WHEN** the markdown waybill is rendered for a through leg, or for a transfer leg on a docket with
  no bay — the cases whose last fence already holds the leg's own command
- **THEN** no `→ runs` line appears anywhere in the document

#### Scenario: Findings in markdown
- **WHEN** a paper path is ignored by git and a warning was raised
- **THEN** both appear as `- ⚠` bullets under bold headings, WARNINGS after IGNORED BY GIT

#### Scenario: Nothing to hand off
- **WHEN** the markdown waybill is rendered for a docket with every leg complete
- **THEN** the NEXT section says there is nothing to hand off and contains no fence

#### Scenario: A brief line sits with the keyed lines
- **WHEN** a display-run markdown waybill carries a `BRIEF:` line
- **THEN** it is a paragraph of its own above the position fence, after any `ENTER BAY:` line
