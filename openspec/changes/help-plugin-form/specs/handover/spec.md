## MODIFIED Requirements

### Requirement: Markdown document shape

The markdown rendering SHALL be a complete markdown document with the following sections, separated
by one blank line:

- **Keyed lines**: the `ENTER BAY:`, `RUN:` and `NEXT LEG:` lines the `command-surface` capability
  defines, each a paragraph of its own. `ENTER BAY:` is present when `next` was given a docket by
  name, or when `bay` cut or found the bay, and the operator is not already standing in it and, for
  `bay`, the docket's next leg is not `cleanup`; `RUN:`
  and `NEXT LEG:` are present only when `next` was given a leg as well.
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

#### Scenario: A bay asks to be entered
- **WHEN** the markdown waybill is rendered for `bay`, from outside a bay it cut or found
- **THEN** the document begins with `ENTER BAY:` and the bay's path, and carries no `RUN:` or
  `NEXT LEG:` line
