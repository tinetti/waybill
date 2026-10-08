## MODIFIED Requirements

### Requirement: Verbatim rendering, with keyed exceptions

The session-facing commands that show a waybill for the next session, `/waybill:next` and
`/waybill:bay`, SHALL request the markdown form from the command line tool, show it verbatim, and
stop. The fences SHALL come from the tool's output, never from the session reformatting plain text,
and the session SHALL NOT wrap the output in a further fence.

The exceptions SHALL each be keyed on an exact literal at the start of a line in the output:

- the docket-selection heading (`/waybill:next` only): the session SHALL ask which docket is meant,
  re-run the command against that branch in the markdown form, and show *that* block verbatim —
  acting on no `ENTER BAY:` it carries, since a selection from `next`'s docket menu never switches;
- `ENTER BAY: <path>`: the session SHALL move into that path with `EnterWorktree`. In
  `/waybill:next`, if the move fails or is denied, it SHALL show a fenced `cd <path>` followed by the
  block verbatim, and stop without acting on any `RUN:` line. In `/waybill:bay`, the session SHALL
  show the block verbatim and then move; if the move fails or is denied, it SHALL say why in one
  line, show the block verbatim, and stop, with no `cd` fence, since no `RUN:` follows and the
  waybill's `/waybill:next` line still moves the next session;
- `RUN: <command> [<argument>]`: after a successful move, the session SHALL invoke that command with
  that argument, and never `/clear`, `/model` or `/effort`; a command it cannot resolve SHALL be named
  in one line, with no substitute run;
- `NEXT LEG: <leg>`: the session SHALL say that the named leg is not next, show the block verbatim,
  and stop.

`/waybill:bay` SHALL run no leg after a move: entering the bay is the whole of its action, and
`Skill` and `SlashCommand` SHALL NOT be on its permission list.

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
- **WHEN** the re-run after a selection from `next`'s docket menu begins with `ENTER BAY:`
- **THEN** the session shows it verbatim, does not move, and stops

#### Scenario: A pasted `<branch>/<leg>` from the main checkout
- **WHEN** the block begins with `ENTER BAY:` and then `RUN:`
- **THEN** the session enters the bay and invokes the `RUN:` command there

#### Scenario: The bay cannot be entered
- **WHEN** the move into the `ENTER BAY:` path fails or is denied in `/waybill:next`
- **THEN** the session shows `cd <path>` and the block, and runs nothing

#### Scenario: Cutting a bay from a session
- **WHEN** `/waybill:bay` is run from the main checkout
- **THEN** the markdown form is requested and shown verbatim, with each handover command in its own
  fence, the session moves into the bay with `EnterWorktree`, and no leg runs

#### Scenario: Picking a branch from `bay`'s menu
- **WHEN** `/waybill:bay` is run with no branch and the re-run for the chosen branch carries
  `ENTER BAY:`
- **THEN** the session shows the re-run verbatim and moves into that bay

#### Scenario: `bay` cannot enter its bay
- **WHEN** `/waybill:bay`'s move into the `ENTER BAY:` path fails or is denied
- **THEN** the session says why in one line, shows the block verbatim with no `cd` fence, and stops

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
no `cd`. Between the heading and the waybill it SHALL print `ENTER BAY: <path>` naming the bay,
unless the operator is already standing in that bay or the docket's next leg is `cleanup`. It SHALL
print no `RUN:` and no `NEXT LEG:` line. The waybill's handover still ends in
`/waybill:next <branch>/<leg>`, which moves the next session into the bay.

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
- **THEN** the heading names the new bay, `ENTER BAY:` and the bay's path follow it, then the
  markdown waybill, and no `cd` fence and no `RUN:` line is printed

#### Scenario: Finding a bay in markdown
- **WHEN** `bay --markdown feat/x` is run from the trunk and the bay already exists
- **THEN** the heading says the bay already exists, and `ENTER BAY:` and the bay's path follow it

#### Scenario: Markdown from inside the bay
- **WHEN** `bay --markdown feat/x` is run from inside the `feat/x` bay
- **THEN** the heading says the operator is already inside it, the markdown waybill follows, and no
  `ENTER BAY:` line is printed

#### Scenario: A bay whose next leg is cleanup
- **WHEN** `bay --markdown feat/x` is run from the trunk and `feat/x`'s next leg is `cleanup`
- **THEN** no `ENTER BAY:` line is printed, since cleanup is about to remove the bay

#### Scenario: `new` refuses the option
- **WHEN** `new --markdown` is run
- **THEN** the option is rejected as unknown
