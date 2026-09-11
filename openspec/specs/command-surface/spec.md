# command-surface Specification

## Purpose

Defines the verbs the tool offers, what each one answers on the trunk versus inside a bay, and the
exit contract callers and scripts can rely on.

## Requirements

### Requirement: Four verbs, each naming one thing

The command surface SHALL consist of exactly four verbs:

| Verb | Answers |
| --- | --- |
| `new` | how do I begin an effort at all |
| `bay <branch>` | cut the branch and working tree for this docket |
| `next [<branch>]` | what comes next on this docket |
| `status` | where does this docket, or the repository, stand |

Each verb SHALL answer exactly one of those questions. No verb may change which question it answers
based on the checked-out branch.

#### Scenario: `next` no longer doubles as an entry point
- **WHEN** `next` is run on the trunk with no dockets open
- **THEN** it does not issue leg 1's waybill, and instead points the caller at `new`

### Requirement: `bay` replaces `start`

The verb that cuts a branch and its working tree SHALL be named `bay`, matching the name of the leg
it performs. **BREAKING**: `start` SHALL NOT be accepted, and no alias SHALL be provided.

`bay` SHALL behave identically to the former `start` in every other respect, including its argument,
its collision handling, and the block it prints on success.

#### Scenario: `bay` cuts a branch and working tree
- **WHEN** `bay feat/x` is run and neither the branch nor a bay for it exists
- **THEN** both are created and the waybill for the following leg is printed

#### Scenario: `start` is gone
- **WHEN** `start feat/x` is run
- **THEN** the command is rejected as unknown

### Requirement: The exit contract for `next`

`next` SHALL exit 0 if and only if it issued exactly one waybill. Both "no docket to report on" and
"more than one docket to choose between" SHALL exit 2, giving callers a single condition to test.

Non-zero cases SHALL print to standard output rather than standard error, because they are an
answer about the repository that terminal and `--json` callers read there.

#### Scenario: Exactly one docket
- **WHEN** `next` is run on the trunk and one bay exists
- **THEN** that docket's waybill is issued and the exit code is 0

#### Scenario: No dockets
- **WHEN** `next` is run on the trunk and no bays exist
- **THEN** no waybill is issued, the caller is pointed at `new`, and the exit code is 2

#### Scenario: Many dockets
- **WHEN** `next` is run on the trunk and three bays exist
- **THEN** the dockets are listed for selection, no waybill is issued, and the exit code is 2

### Requirement: `next` accepts a branch

`next` SHALL accept an optional positional branch, resolving against that branch's bay from anywhere
in the repository. When the named branch has no bay, the command SHALL say so and name the verb that
would create one.

#### Scenario: Naming a docket that exists
- **WHEN** `next feat/x` is run from the trunk and a bay for `feat/x` exists
- **THEN** that docket's waybill is issued and the exit code is 0

#### Scenario: Naming a branch with no bay
- **WHEN** `next feat/x` is run and no bay for `feat/x` exists
- **THEN** the output states that there is no bay for it and names `bay feat/x`

### Requirement: `next` accepts a leg after the branch

`next` SHALL also accept `<branch>/<leg>`. The whole argument SHALL be tried as a branch first;
only when no bay carries that branch and its last `/`-segment is a known leg id SHALL that segment
be read as the leg. In markdown output for a named docket, `next` SHALL print `ENTER BAY: <path>`
when the caller is not already in that bay (never for the `cleanup` leg), then `RUN: <command>
[<argument>]` — the booking's own command — when the named leg is the docket's next leg, or
`NEXT LEG: <leg>` when it is not. A docket with nothing left to hand off, or a leg with no booking,
SHALL get neither line. Markdown output SHALL print no `cd`, and a `transfer` handover for a docket
with a bay SHALL end in `/waybill:next <branch>/<leg>` in place of the raw command. Plain output is
unchanged.

#### Scenario: Naming a docket and its next leg
- **WHEN** `next --markdown feat/x/refine` is run from the trunk and `feat/x` is at the refine leg
- **THEN** the output begins with `ENTER BAY:` and the bay's path, then `RUN:` and the refine
  booking's command

#### Scenario: Naming a stale leg
- **WHEN** `next --markdown feat/x/specs` is run and `feat/x` is at the refine leg
- **THEN** the output carries `NEXT LEG: refine` and no `RUN:` line

#### Scenario: Naming a branch from outside its bay
- **WHEN** `next --markdown feat/x` is run from the trunk or from another bay
- **THEN** the output begins with `ENTER BAY:` and the path of `feat/x`'s bay, and carries no `RUN:`

#### Scenario: A branch whose last segment is a leg id
- **WHEN** a bay exists for `fix/specs` and `next --markdown fix/specs` is run
- **THEN** the argument resolves as the branch `fix/specs`, and no `RUN:` or `NEXT LEG:` is printed

#### Scenario: Asking where things stand moves nobody
- **WHEN** `next --markdown` is run on the trunk with one docket open and no argument
- **THEN** the handover ends in `/waybill:next <branch>/<leg>` and no `ENTER BAY:` line is printed

### Requirement: `status` on the trunk is a fleet view

`status` on the trunk SHALL report every docket in flight with its branch and position, and SHALL
exit 0 without issuing a waybill. With no dockets open it SHALL say so in the plural.

Warnings raised while resolving any docket SHALL be attributed to the branch they came from, so a
docket that cannot determine its own position is named rather than blamed on the repository.

`status` SHALL remain free of options, and no second machine-readable surface SHALL be added for it.

#### Scenario: Dockets in flight
- **WHEN** `status` is run on the trunk with three bays open
- **THEN** all three are listed with their branch and leg, and the exit code is 0

#### Scenario: Nothing in flight
- **WHEN** `status` is run on the trunk with no bays open
- **THEN** the output reports that no dockets are open

#### Scenario: A docket that cannot be resolved
- **WHEN** resolving one docket raises a warning
- **THEN** the warning is reported against that docket's branch

#### Scenario: Inside a bay
- **WHEN** `status` is run inside a bay
- **THEN** it reports that bay's own position, unchanged from previous behavior

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

### Requirement: `new` runs at the model and effort its booking names

Because a session cannot change its own model, the slash command that invokes the first leg SHALL
declare the model and effort that leg's booking names, and the two SHALL be pinned against each
other so they cannot drift.

This is deliberately the opposite of the commands whose waybill is for the *next* session; those
SHALL continue to declare no model, so the booking's own choice is not overridden.

#### Scenario: The booking changes
- **WHEN** the first leg's booking is changed to a different model or effort
- **THEN** the test suite reports that the command now disagrees with the booking

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
