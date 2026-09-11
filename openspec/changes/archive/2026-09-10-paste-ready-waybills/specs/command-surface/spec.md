## ADDED Requirements

### Requirement: `next` and `bay` offer a paste-ready markdown form

`next` and `bay` SHALL accept a `--markdown` option that prints the waybill in the markdown rendering
defined by the `handover` capability, in place of the plain one. On `next` it SHALL apply to every
path that issues a waybill: inside a bay, `next <branch>`, and the trunk with exactly one docket
open. Output that issues no waybill (the no-dockets message, the docket-selection menu, and the
no-bay message) SHALL be unchanged by the option.

`--json` and `--markdown` together SHALL be rejected with exit 2 and an error stating that the two
cannot be combined. The check SHALL run before the repository is looked up, so the same error is
given inside and outside a repository.

With `--markdown`, `bay` SHALL print its own heading (the bay created, the bay already existing, or
the operator already standing in it) as a paragraph, followed by the markdown waybill. It SHALL print
no `cd`: the waybill's handover ends in `/waybill:next <branch>/<leg>`, which moves the next session
into the bay.

`new` SHALL NOT accept `--markdown`. It continues to reject every argument.

#### Scenario: Markdown inside a bay
- **WHEN** `next --markdown` is run inside a bay
- **THEN** the markdown waybill is printed and the exit code is 0

#### Scenario: Markdown for a named branch from the trunk
- **WHEN** `next --markdown feat/x` is run from the trunk and a bay for `feat/x` exists
- **THEN** the markdown waybill is printed after an `ENTER BAY:` line naming that bay, and no `cd`
  fence is printed

#### Scenario: Markdown with several dockets open
- **WHEN** `next --markdown` is run on the trunk with three bays open
- **THEN** the docket-selection menu is printed exactly as without the option, and the exit code is 2

#### Scenario: Conflicting output modes
- **WHEN** `next --json --markdown` is run
- **THEN** the command exits 2 and the error says `--json` and `--markdown` cannot be combined

#### Scenario: A misspelled option is still unknown
- **WHEN** `next --markdown --jsonn` is run
- **THEN** the command rejects `--jsonn` as an unknown option

#### Scenario: Cutting a bay in markdown
- **WHEN** `bay --markdown feat/x` is run from the trunk
- **THEN** the heading names the new bay, the markdown waybill follows, and no `cd` fence is printed

#### Scenario: Markdown from inside the bay
- **WHEN** `bay --markdown feat/x` is run from inside the `feat/x` bay
- **THEN** the heading says the operator is already inside it, and the markdown waybill follows

#### Scenario: `new` refuses the option
- **WHEN** `new --markdown` is run
- **THEN** the option is rejected as unknown

## MODIFIED Requirements

### Requirement: `new` behaves differently in a terminal and in a session

`new` SHALL begin an effort. Its two surfaces differ because only one of them has a session to act
in:

- Run as a command line tool, `new` SHALL print the first leg's waybill, in the plain rendering
  defined by the `handover` capability, and stop.
- Run as a slash command, `new` SHALL show that block and then invoke only the last command in its
  NEXT block, the leg command with whatever argument it carries. It SHALL NOT run `/clear`, `/model`
  or `/effort` from the block: the session running `new` is already the fresh one, and its model
  and effort come from the slash command's own declaration. Where the named command cannot be
  resolved, it SHALL say so and leave the waybill on screen as the instruction.

#### Scenario: Terminal invocation
- **WHEN** `new` is run from a terminal
- **THEN** the first leg's waybill is printed and nothing is invoked

#### Scenario: Session invocation
- **WHEN** the slash command is run in a session
- **THEN** the waybill is shown and the leg command it names is invoked in that same session

#### Scenario: Session invocation leaves the other commands alone
- **WHEN** the slash command is run and the NEXT block lists `/clear`, `/model` or `/effort` ahead of
  the leg command
- **THEN** none of them is run, and only the leg command is invoked

#### Scenario: The named command is unavailable
- **WHEN** the slash command is run and the command it names cannot be resolved
- **THEN** the session reports that and leaves the waybill on screen as the instruction

#### Scenario: Run from inside a bay
- **WHEN** `new` is run from inside a bay
- **THEN** it warns that efforts begin on the trunk and proceeds anyway

### Requirement: Verbatim rendering, with keyed exceptions

The session-facing commands that show a waybill for the next session, `/waybill:next` and
`/waybill:bay`, SHALL request the markdown form from the command line tool, show it verbatim, and
stop. The fences SHALL come from the tool's output, never from the session reformatting plain text,
and the session SHALL NOT wrap the output in a further fence.

The exceptions SHALL each be keyed on an exact literal at the start of a line in the output:

- the docket-selection heading: the session SHALL ask which docket is meant, re-run the command
  against that branch in the markdown form, and show *that* block verbatim — acting on no
  `ENTER BAY:` it carries, since a selection never switches;
- `ENTER BAY: <path>`: the session SHALL move into that path with `EnterWorktree`. If the move fails
  or is denied, it SHALL show a fenced `cd <path>` followed by the block verbatim, and stop without
  acting on any `RUN:` line;
- `RUN: <command> [<argument>]`: after a successful move, the session SHALL invoke that command with
  that argument, and never `/clear`, `/model` or `/effort`; a command it cannot resolve SHALL be named
  in one line, with no substitute run;
- `NEXT LEG: <leg>`: the session SHALL say that the named leg is not next, show the block verbatim,
  and stop.

Every tool these exceptions require SHALL be declared, since the permission list is restrictive and
an undeclared tool is silently unavailable.

#### Scenario: An ordinary waybill
- **WHEN** the block does not contain the selection heading
- **THEN** it is shown verbatim and the session stops

#### Scenario: A selection block
- **WHEN** the block contains the selection heading
- **THEN** the session asks which docket, re-runs against that branch in the markdown form, and
  shows the result verbatim

#### Scenario: A selection re-run never switches
- **WHEN** the re-run after a selection begins with `ENTER BAY:`
- **THEN** the session shows it verbatim, does not move, and stops

#### Scenario: A pasted `<branch>/<leg>` from the main checkout
- **WHEN** the block begins with `ENTER BAY:` and then `RUN:`
- **THEN** the session enters the bay and invokes the `RUN:` command there

#### Scenario: The bay cannot be entered
- **WHEN** the move into the `ENTER BAY:` path fails or is denied
- **THEN** the session shows `cd <path>` and the block, and runs nothing

#### Scenario: Cutting a bay from a session
- **WHEN** `/waybill:bay` is run
- **THEN** the markdown form is requested and shown verbatim, with each handover command in its own
  fence
