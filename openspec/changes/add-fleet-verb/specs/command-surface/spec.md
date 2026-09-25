## RENAMED Requirements

- FROM: `### Requirement: Four verbs, each naming one thing`
- TO: `### Requirement: Five verbs, each naming one thing`

## MODIFIED Requirements

### Requirement: Five verbs, each naming one thing

The command surface SHALL consist of exactly five verbs that act on or report about dockets, plus
commands that report on something other than a docket:

| Verb | Answers |
| --- | --- |
| `new` | how do I begin an effort at all |
| `bay <branch>` | cut the branch and working tree for this docket |
| `next [<branch>]` | what comes next on this docket |
| `status` | where does this docket, or the repository, stand |
| `fleet [--depth <n>]` | what is in flight everywhere at or below here |

| Reports on something else | Answers |
| --- | --- |
| `help` | what is the route, what do the words mean, and what are the verbs |
| `doctor` | can this machine run the route, and what fixes each gap |

Each verb SHALL answer exactly one of those questions. No verb may change which question it answers
based on the checked-out branch.

A command in the second table SHALL answer no question about any docket. Its output SHALL NOT vary
with the branch, the worktree, or which dockets are open. Adding one SHALL NOT change the behavior
of any of the verbs. The count of five is a count of docket verbs, so a command that reports on the
machine or on the surface itself does not raise it.

`status` and `fleet` both report position, and the boundary between them is the repository. `status`
SHALL answer only for the repository the caller is standing in, and SHALL continue to choose between
one docket's position and that repository's fleet by where the caller stands rather than by a flag.
`fleet` SHALL answer for every repository at or below the working directory. Adding `fleet` SHALL
NOT change anything `status` prints.

#### Scenario: `next` no longer doubles as an entry point
- **WHEN** `next` is run on the trunk with no dockets open
- **THEN** it does not issue leg 1's waybill, and instead points the caller at `new`

#### Scenario: The reference command is not a verb
- **WHEN** `help` is run on the trunk, inside a bay, or outside any repository
- **THEN** it prints the same reference page and never issues a waybill or reports a position

#### Scenario: `fleet` answers outside a repository
- **WHEN** `fleet` is run from a directory that is in no git repository
- **THEN** it searches the directories below it, reports every repository with an open docket, and
  exits 0 rather than refusing the way `new`, `bay`, `next` and `status` do

#### Scenario: `fleet` narrows to one repository from inside one that has work in flight
- **WHEN** `fleet` is run from anywhere inside a checkout that has a docket open
- **THEN** it reports that repository's open dockets and no others

#### Scenario: `fleet` walks through a checkout that has nothing in flight
- **WHEN** `fleet` is run from inside, or above, a checkout with no docket open — a projects
  directory kept under version control
- **THEN** it counts that checkout as scanned and goes on to report the repositories beneath it,
  rather than stopping there and reporting nothing

### Requirement: The usage lists every command, and grows by one row

`--help` SHALL list every subcommand the tool accepts, `fleet`, `doctor` and `help` included. Adding a
subcommand SHALL add exactly one row to the Commands block of the usage, appended after the rows
already there. A subcommand's own options SHALL be listed in the Options block, naming the verb they
apply to. Every pre-existing Commands row SHALL remain byte-identical.

#### Scenario: The usage after adding `fleet`
- **WHEN** `--help` is run
- **THEN** the Commands block contains the four original verbs' rows unchanged and in order, plus
  one row for `fleet` and one for `help`, and the Options block has gained only `--depth`

#### Scenario: Only one line was added per command
- **WHEN** the usage is compared with the usage from before `fleet` existed
- **THEN** the only differences in the Commands block are one added line and the reworded `help`
  row, which names how many verbs the page describes
