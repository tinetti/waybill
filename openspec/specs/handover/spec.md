# handover Specification

## Purpose
Defines what a waybill's NEXT block hands the next session: which commands it lists, their order,
and how that list is rendered for a terminal and for a chat client that copies one command at a time.

## Requirements

### Requirement: The handover is a list of commands

When the current leg has a booking, the NEXT block SHALL present the handover as commands, in this
order:

1. `/clear`, only when the booking's `handover` is `transfer`
2. `/model <model>`, always, with the booking's `model` value passed through verbatim
3. `/effort <effort>`, only when the booking declares an `effort`. No default SHALL ever be supplied.
4. The leg command, with its argument appended exactly as before: omitted, with no trailing space,
   when the repository cannot supply it

A `handover` of `through`, or none at all, SHALL add no command. Any other `handover` value SHALL add
no command and SHALL instead be shown verbatim as prose ahead of the commands, so a booking can still
ask for something the tool never anticipated.

The same list SHALL drive every rendering, so no two renderings of one waybill can disagree about
which commands the handover needs. The one sanctioned difference is the markdown rendering of a
`transfer` leg for a docket with a bay, whose last command SHALL be `/waybill:next <branch>/<leg>`
in place of the leg command: `/clear` drops a session back to the main checkout, and only that line
carries it back into the bay.

#### Scenario: A transfer leg with a declared effort
- **WHEN** the current leg's booking reads `handover: transfer`, `model: opus`, `effort: high` and
  command `/spec:apply` with change id `add-thing`
- **THEN** the commands are `/clear`, `/model opus`, `/effort high`, `/spec:apply add-thing`, in
  that order

#### Scenario: A through leg
- **WHEN** the current leg's booking reads `handover: through`
- **THEN** no `/clear` command is listed

#### Scenario: No handover declared
- **WHEN** the current leg's booking declares no `handover`
- **THEN** no `/clear` command is listed and no prose line is shown

#### Scenario: No effort declared
- **WHEN** the current leg's booking declares no `effort`
- **THEN** no `/effort` command is listed

#### Scenario: A model value carrying a qualifier
- **WHEN** the booking reads `model: opus[1m]`
- **THEN** the command listed is `/model opus[1m]`

#### Scenario: An argument the repository cannot supply
- **WHEN** the booking's argument resolves to nothing, as the change id does before a change exists
- **THEN** the leg command is listed bare, with no trailing space

#### Scenario: A custom handover
- **WHEN** the booking reads `handover: hand the laptop to Dave`
- **THEN** that text is shown verbatim ahead of the commands, and no `/clear` command is listed

### Requirement: Plain rendering lists one command per line

In the plain rendering, the default for every verb that issues a waybill, the NEXT block SHALL list
each command on its own line with no indentation, so each line can be copied whole. The block SHALL NOT
contain the former `└ <model> · <effort>` caption, nor any `then run:` or `run:` line.

Custom handover prose SHALL be one indented line between `NEXT:` and the first command. The booking
body SHALL follow the commands after one blank line, indented as before, with no trailing whitespace
on any line.

The complete-docket message, the no-booking message and the indented `cd` line under `IN BAY:` SHALL
keep their existing form.

#### Scenario: An execute leg in a terminal
- **WHEN** `waybill next` prints the waybill for a transfer leg booked with `model: opus`,
  `effort: high` and `/spec:apply` against change `add-thing`
- **THEN** the lines after `NEXT:` are exactly `/clear`, `/model opus`, `/effort high`,
  `/spec:apply add-thing`, each unindented, followed by a blank line and the indented booking body

#### Scenario: No caption survives
- **WHEN** any waybill is printed in plain form
- **THEN** no line contains `└ ` and no line contains `then run:`

#### Scenario: Every leg complete
- **WHEN** the docket has no current leg
- **THEN** the NEXT block reads `nothing to hand off — every leg is complete`, byte-identical to the
  previous output

#### Scenario: A docket resolved from outside its bay
- **WHEN** `waybill next` is run from the trunk and the one open docket's bay is elsewhere
- **THEN** the `IN BAY:` section still carries the indented `cd <path>` line

### Requirement: Markdown rendering gives each command its own fence

In the markdown rendering, each command SHALL sit alone in its own fence: a bare opening fence line,
the one command line, and a closing fence line. No fence SHALL hold more than one command, and
nothing but the command SHALL appear inside a command fence. The fences SHALL follow the command
order defined above.

A `**NEXT**` line SHALL introduce the fences and tell the reader to paste each block on its own, in
order.

#### Scenario: An execute leg in markdown
- **WHEN** the markdown waybill is rendered for the transfer leg booked with `model: opus`,
  `effort: high` and `/spec:apply` against change `add-thing`, for a docket with no bay
- **THEN** `/clear`, `/model opus`, `/effort high` and `/spec:apply add-thing` each appear on a line
  whose previous and next lines are both a bare fence

#### Scenario: An execute leg with a bay in markdown
- **WHEN** the same waybill is rendered for docket `feat/thing`, which has a bay
- **THEN** the fenced commands are `/clear`, `/model opus`, `/effort high` and
  `/waybill:next feat/thing/execute`

#### Scenario: Model and effort are never fenced together
- **WHEN** a booking declares both a model and an effort
- **THEN** `/model` and `/effort` are in two separate fences

### Requirement: Markdown document shape

The markdown rendering SHALL be a complete markdown document with the following sections, separated
by one blank line:

- **Keyed lines**: the `ENTER BAY:`, `RUN:` and `NEXT LEG:` lines the `command-surface` capability
  defines, present only when `next` was given a docket by name, each a paragraph of its own.
- **Position**: the same header and leg-strip lines as the plain rendering, inside a `text` fence so
  their line breaks survive. With no docket open, only the header is shown.
- **NEXT**: the introducing line, any custom handover prose as a plain paragraph, then the command
  fences.
- **Booking body**: unindented prose after the last command fence.
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
- **THEN** no IN BAY section and no `cd` appear, and a transfer handover ends in
  `/waybill:next <branch>/<leg>`

#### Scenario: Findings in markdown
- **WHEN** a paper path is ignored by git and a warning was raised
- **THEN** both appear as `- ⚠` bullets under bold headings, WARNINGS after IGNORED BY GIT

#### Scenario: Nothing to hand off
- **WHEN** the markdown waybill is rendered for a docket with every leg complete
- **THEN** the NEXT section says there is nothing to hand off and contains no fence

### Requirement: The change is render-only

Neither rendering SHALL change what the tool infers. `next --json` output SHALL be unchanged, and
surfaces that carry no handover commands SHALL be byte-identical to their previous output: the
docket-selection menu, `status` inside a bay, the fleet view (including the empty fleet), and the
complete-docket waybill.

#### Scenario: Machine-readable output is untouched
- **WHEN** `next --json` is run in any state
- **THEN** its output is identical to the output before this change

#### Scenario: Non-handover surfaces are untouched
- **WHEN** the selection menu, `status`, the fleet view or the complete-docket waybill is rendered
- **THEN** the output is byte-identical to the output before this change
