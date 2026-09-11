## MODIFIED Requirements

### Requirement: Four verbs, each naming one thing

The command surface SHALL consist of exactly four verbs that act on or report about dockets, plus
exactly one reference command:

| Verb | Answers |
| --- | --- |
| `new` | how do I begin an effort at all |
| `bay <branch>` | cut the branch and working tree for this docket |
| `next [<branch>]` | what comes next on this docket |
| `status` | where does this docket, or the repository, stand |

| Reference | Answers |
| --- | --- |
| `help` | what is the route, what do the words mean, and what are the verbs |

Each verb SHALL answer exactly one of those questions. No verb may change which question it answers
based on the checked-out branch.

The reference command SHALL answer no question about any docket. Its output SHALL NOT vary with the
branch, the worktree, or which dockets are open. Adding it SHALL NOT change the behavior of any of
the four verbs.

#### Scenario: `next` no longer doubles as an entry point
- **WHEN** `next` is run on the trunk with no dockets open
- **THEN** it does not issue leg 1's waybill, and instead points the caller at `new`

#### Scenario: The reference command is not a fifth verb
- **WHEN** `help` is run on the trunk, inside a bay, or outside any repository
- **THEN** it prints the same reference page and never issues a waybill or reports a position

## ADDED Requirements

### Requirement: The usage lists every command, and grows by one row

`--help` SHALL list every subcommand the tool accepts, `help` included. Adding `help` SHALL add
exactly one row to the Commands block of the usage. The Options block and every pre-existing
Commands row SHALL remain byte-identical.

#### Scenario: The usage after adding `help`
- **WHEN** `--help` is run
- **THEN** the Commands block contains the four verbs' rows unchanged, plus one row for `help`, and
  the Options block is unchanged

#### Scenario: Only one line was added
- **WHEN** the usage is compared with the usage from before `help` existed
- **THEN** the only difference is one added line in the Commands block
