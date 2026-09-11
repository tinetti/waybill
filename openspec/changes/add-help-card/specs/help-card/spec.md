## Purpose

A single-screen reference page for the operator at cold start. It holds the from-zero sequence, the
route, the vocabulary, and the verbs, so getting from the trunk into a bay never requires re-reading
the README.

## ADDED Requirements

### Requirement: One screen, four sections, in a fixed order

`help` SHALL print a page of at most 45 lines, including blank lines and the trailing newline. The
page SHALL present these parts in this order:

1. A title line.
2. A from-zero walkthrough.
3. The route.
4. A glossary.
5. The commands.
6. A Why footer of exactly two lines.
7. One line pointing at the README for everything the page leaves out.

Each of the four sections SHALL open with its own heading, and the headings SHALL be distinct
literals that tests can find.

No line SHALL be wider than 80 columns, because a wrapped line breaks the one-screen promise as
surely as an extra line does.

The 45-line cap is a hard limit, not a target. Content that does not fit SHALL be left to the
README rather than squeezed in.

#### Scenario: Shipped bookings
- **WHEN** `help` is run with only the built-in bookings in force
- **THEN** the page is at most 45 lines, no line is wider than 80 columns, and it contains all four
  section headings in order, followed by the two-line footer and the README pointer

#### Scenario: A long carrier name
- **WHEN** an overlay rebooks a leg to a carrier whose command is much longer than any built-in one
- **THEN** the route stays aligned and the page is still at most 45 lines

### Requirement: The walkthrough gets an operator from the trunk into a bay

The from-zero walkthrough SHALL be followable end to end without opening the README. It SHALL name
`waybill new` as the way to begin, `waybill bay` as the way to cut the branch and its bay, and `cd`
as the step that moves the shell into the bay.

#### Scenario: The walkthrough names its three steps
- **WHEN** the page is rendered
- **THEN** the walkthrough section contains `waybill new`, `waybill bay`, and `cd`

#### Scenario: A cold read
- **WHEN** someone reads the page on the trunk without consulting the README
- **THEN** they can begin an effort, cut its bay, and move their shell into it
  (a judgment check, confirmed by a human reading the rendered page)

### Requirement: The route is generated from the leg model and the bookings in force

The route section SHALL list every leg in the leg model, in route order, with its 1-based position.
Each leg's row SHALL show three things:

- the leg's id;
- its carrier: the command named by the booking in force for that leg, reproduced verbatim;
- what stamps it, resolved by the first of these rules that applies:
  1. A wrapper-owned leg shows a fixed phrase: `bay` shows `bay exists`, and `cleanup` shows
     `merged, bay gone`.
  2. A leg whose progress is counted from task checkboxes shows `all tasks ticked`.
  3. A leg whose booking stamps by path shows the final segment of that path glob.
  4. Any other leg shows `repo state`.

Adding a leg to the leg model, or rebooking a leg, SHALL change the page with no edit to the page's
own source. Column widths SHALL be computed from the rows being rendered.

#### Scenario: Every leg, in order
- **WHEN** the page is rendered
- **THEN** every leg id in the leg model appears in the route, in the leg model's order

#### Scenario: A rebooked carrier
- **WHEN** an overlay rebooks the `execute` leg to a different command
- **THEN** the `execute` row shows the overlay's command, not the built-in one

#### Scenario: Stamp phrases for the shipped route
- **WHEN** the page is rendered with the built-in bookings
- **THEN** `ideate` shows `repo state`, `bay` shows `bay exists`, `refine` shows
  `contract-data.json`, `contract` shows `contract.md`, `specs` shows `tasks.md`, `execute` shows
  `all tasks ticked`, and `cleanup` shows `merged, bay gone`

### Requirement: The page never fails over its bookings

The page is the one thing an operator reaches for when they are lost, so rendering it SHALL NOT
fail because of the bookings.

- A leg with no booking in force SHALL still get its row, with an em-dash (`—`) in both the carrier
  column and the stamp column.
- When the bookings cannot be resolved at all, for example because an overlay contains a malformed
  file, every route row SHALL render that way. The page SHALL add one line naming the problem, still
  exit 0, and still stay within the line cap.

#### Scenario: A malformed overlay
- **WHEN** the configured overlay directory contains a booking with no `command`
- **THEN** the page is printed with em-dash carriers and one line naming the problem, and `help`
  exits 0

### Requirement: The page reports configuration, never position

The page SHALL NOT depend on the branch, the worktree, the working-tree diff, or which dockets are
open. It MAY depend on which bookings are configured, because a page that ignored an operator's
overlay would lie about their route.

`help` SHALL work outside any git repository, printing the page and exiting 0.

#### Scenario: Outside a repository
- **WHEN** `help` is run from a directory that is not inside any git repository
- **THEN** the page is printed and the exit code is 0

#### Scenario: Same page on the trunk and in a bay
- **WHEN** `help` is run on the trunk and then inside a bay, with the same bookings in force
- **THEN** both runs print byte-identical pages

### Requirement: The page teaches the current verbs and no others

The commands section SHALL name every docket verb that `--help` lists, and it SHALL describe each
one in words consistent with its usage row.

The page SHALL NOT contain `waybill start` or `/waybill:start` anywhere, because that verb was
removed with no alias.

#### Scenario: Coverage against the usage
- **WHEN** the subcommands listed in `--help` are compared with the page's commands section
- **THEN** every listed subcommand other than `help` itself appears in that section

#### Scenario: The removed verb
- **WHEN** the recorded page is searched for `waybill start` or `/waybill:start`
- **THEN** neither string is found

### Requirement: `help` takes no arguments

`help` SHALL accept no arguments. Any argument, including a would-be topic such as `bay`, SHALL be
rejected on standard error with exit code 2, not silently ignored. `help --help` SHALL print the
usage like every other subcommand does.

#### Scenario: A topic argument
- **WHEN** `help bay` is run
- **THEN** nothing is printed to standard output, an error saying `help` takes no arguments is
  printed to standard error, and the exit code is 2

#### Scenario: Usage requested
- **WHEN** `help --help` is run
- **THEN** the usage is printed and the exit code is 0

### Requirement: The slash command shows the page verbatim and stops

`/waybill:help` SHALL run the command-line `help` from the installed plugin and instruct the session
to show the output verbatim and then stop, adding no commentary of its own.

It SHALL declare neither a model nor an effort, because the models the page names belong to the
bookings, not to the session.

When the plugin's location cannot be resolved, it SHALL print one explanatory line instead of a raw
module-not-found error.

#### Scenario: Run in a session
- **WHEN** `/waybill:help` is run
- **THEN** the page is shown verbatim and the session takes no further action

#### Scenario: Plugin root not set
- **WHEN** the plugin root is unset or does not contain the CLI
- **THEN** the output is a single line explaining that the CLI could not be located
