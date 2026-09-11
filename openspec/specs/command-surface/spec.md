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

- Run as a command line tool, `new` SHALL print the first leg's waybill and stop. This block SHALL
  be byte-for-byte what the trunk previously printed.
- Run as a slash command, `new` SHALL show that block and then invoke the command it names. Where
  the named command cannot be resolved, it SHALL say so and leave the waybill on screen as the
  instruction.

#### Scenario: Terminal invocation
- **WHEN** `new` is run from a terminal
- **THEN** the first leg's waybill is printed and nothing is invoked

#### Scenario: Session invocation
- **WHEN** the slash command is run in a session
- **THEN** the waybill is shown and the command it names is invoked in that same session

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

The session-facing command that shows a waybill SHALL continue to show the block verbatim and stop.
The exceptions SHALL each be keyed on an exact literal at the start of a line in the output:

- the docket-selection heading: the session SHALL ask which docket is meant, re-run the command
  against that branch, and show *that* block verbatim — acting on no `ENTER BAY:` it carries, since a
  selection never switches;
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
- **THEN** the session asks which docket, re-runs against that branch, and shows the result verbatim

#### Scenario: A selection re-run never switches
- **WHEN** the re-run after a selection begins with `ENTER BAY:`
- **THEN** the session shows it verbatim, does not move, and stops

#### Scenario: A pasted `<branch>/<leg>` from the main checkout
- **WHEN** the block begins with `ENTER BAY:` and then `RUN:`
- **THEN** the session enters the bay and invokes the `RUN:` command there

#### Scenario: The bay cannot be entered
- **WHEN** the move into the `ENTER BAY:` path fails or is denied
- **THEN** the session shows `cd <path>` and the block, and runs nothing
