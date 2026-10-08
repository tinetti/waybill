## MODIFIED Requirements

### Requirement: The walkthrough gets an operator from the trunk into a bay

The from-zero walkthrough SHALL be followable end to end without opening the README. It SHALL name
`/waybill:new` as the way to begin, `/waybill:bay` as the way to cut the branch and its bay and move
the session into it, and `/waybill:next` as the way every new session gets its waybill. It SHALL NOT
name a `cd` step: `/waybill:bay` moves the session in, so there is no separate step for the operator
to take.

#### Scenario: The walkthrough names its three steps
- **WHEN** the page is rendered
- **THEN** the walkthrough section contains `/waybill:new`, `/waybill:bay`, and `/waybill:next`, and
  does not contain `cd `

#### Scenario: A cold read
- **WHEN** someone reads the page on the trunk without consulting the README
- **THEN** they can begin an effort, cut its bay and land in it with `/waybill:bay`, and get the
  waybill for the next leg
  (a judgment check, confirmed by a human reading the rendered page)

### Requirement: The route is generated from the leg model and the bookings in force

The route section SHALL begin with a header row labelling its columns `#`, `LEG`, `CARRIER` and
`STAMP`, followed by one row for every leg in the leg model, in route order. Each leg's row SHALL
show a number and three named things:

- its 1-based position;
- the leg's id;
- its carrier: the command named by the booking in force for that leg, reproduced verbatim;
- what stamps it, resolved by the first of these rules that applies:
  1. A wrapper-owned leg shows a fixed phrase: `bay` shows `bay exists`, and `cleanup` shows
     `merged, bay gone`.
  2. A leg whose progress is counted from task checkboxes shows `all tasks ticked`.
  3. A leg whose booking stamps by path shows the final segment of that path glob.
  4. Any other leg shows `repo state`.

Adding a leg to the leg model, or rebooking a leg, SHALL change the page with no edit to the page's
own source. Column widths SHALL be computed from the rows being rendered, the header row included,
so each header label starts in the same column as the field beneath it whether the bookings resolve
or not.

#### Scenario: Every leg, in order
- **WHEN** the page is rendered
- **THEN** every leg id in the leg model appears in the route, in the leg model's order

#### Scenario: The header row
- **WHEN** the page is rendered
- **THEN** the first line after the `ROUTE` heading is the header row, and its `LEG`, `CARRIER` and
  `STAMP` labels start at the same columns as the first leg row's id, carrier and stamp

#### Scenario: The header row with unreadable bookings
- **WHEN** the bookings cannot be resolved, so every carrier and stamp is an em-dash
- **THEN** the header row is still the first line after `ROUTE` and still aligned with the rows
  beneath it

#### Scenario: A rebooked carrier
- **WHEN** an overlay rebooks the `execute` leg to a different command
- **THEN** the `execute` row shows the overlay's command, not the built-in one

#### Scenario: Stamp phrases for the shipped route
- **WHEN** the page is rendered with the built-in bookings
- **THEN** `bay` shows `bay exists`, `ideate` shows `contract.md`, `specify` shows `tasks.md`,
  `execute` shows `all tasks ticked`, `review` shows `request open`, and `cleanup` shows
  `merged, bay gone`

### Requirement: The page teaches the current verbs and no others

The commands section SHALL name every docket verb that `--help` lists, in its `/waybill:` form, and
it SHALL describe each one in words consistent with its usage row. The page is read inside a
session, where the slash command is what the operator types, so it SHALL NOT name a verb in its
terminal form (`waybill new`, `waybill bay`, `waybill next`, `waybill status`, `waybill doctor`).

The page SHALL NOT contain `waybill start` or `/waybill:start` anywhere, because that verb was
removed with no alias.

#### Scenario: Coverage against the usage
- **WHEN** the subcommands listed in `--help` are compared with the page's commands section
- **THEN** every listed subcommand other than `help` itself appears in that section as
  `/waybill:<subcommand>`

#### Scenario: No terminal forms
- **WHEN** the page is rendered
- **THEN** it contains none of `waybill new`, `waybill bay`, `waybill next`, `waybill status` or
  `waybill doctor`

#### Scenario: The removed verb
- **WHEN** the recorded page is searched for `waybill start` or `/waybill:start`
- **THEN** neither string is found
