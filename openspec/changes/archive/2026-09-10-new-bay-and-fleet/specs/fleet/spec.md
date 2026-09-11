## Purpose

Defines what counts as an effort in flight when seen from outside it, so that the repository can be
asked what work is open without visiting each working tree in turn.

## ADDED Requirements

### Requirement: A docket seen from outside is a bay on disk

The system SHALL treat each linked worktree of the repository as one docket. Enumeration MUST be
possible from anywhere in the repository — the trunk, or another bay — and MUST NOT depend on which
branch the caller has checked out.

Branches without a worktree SHALL NOT be enumerated, even when they are unmerged. A docket must
have a directory so its position can be read from its own working tree.

#### Scenario: Enumerating from the trunk
- **WHEN** the caller is in the main checkout and three bays exist
- **THEN** all three dockets are reported, each with its branch and directory

#### Scenario: Enumerating from inside a bay
- **WHEN** the caller is inside one bay and two others exist
- **THEN** all three dockets are reported, including the caller's own

#### Scenario: A branch with no bay
- **WHEN** an unmerged branch exists with no worktree checked out on it
- **THEN** it is not reported as a docket

#### Scenario: No bays at all
- **WHEN** the repository has only its main checkout
- **THEN** the fleet is empty and no error is raised

### Requirement: Exclusions from the fleet

The system SHALL exclude from the fleet every worktree that cannot carry a docket:

- the main checkout, which is the repository rather than an effort within it;
- any worktree with a detached HEAD, which has no branch to hang a docket on;
- any worktree checked out on the default branch, since a second trunk is not an effort;
- any worktree git still has registered but whose directory has been deleted.

#### Scenario: The main checkout is not a docket
- **WHEN** the fleet is enumerated
- **THEN** the main checkout does not appear in it

#### Scenario: A detached-HEAD bay is not a docket
- **WHEN** a worktree has a detached HEAD
- **THEN** it does not appear in the fleet

#### Scenario: A second checkout of the trunk is not a docket
- **WHEN** a worktree is checked out on the default branch
- **THEN** it does not appear in the fleet

#### Scenario: A deleted bay directory is not a docket
- **WHEN** a worktree is still registered but its directory has been removed
- **THEN** it does not appear in the fleet, rather than appearing as a stalled docket

### Requirement: Each docket's position is read from its own working tree

The system SHALL determine each docket's leg from that docket's directory, applying the same rules
that apply to an operator standing in it. Uncommitted and untracked papers in a bay SHALL count
toward that bay's stamps exactly as they do when read from inside it.

#### Scenario: Uncommitted papers count
- **WHEN** a bay holds an unstaged or untracked artifact that stamps a leg
- **THEN** that docket reports the same leg it would report when read from inside the bay

### Requirement: Deterministic fleet order

The fleet SHALL be reported in a deterministic order for any given set of bays, so that rendered
output is reproducible.

#### Scenario: Repeated enumeration
- **WHEN** the fleet is enumerated twice with no bays added or removed
- **THEN** the dockets are reported in the same order both times

### Requirement: A merged branch with a standing bay remains in the fleet

A docket SHALL remain in the fleet until its bay is removed. A branch already merged into the
default branch whose bay still stands SHALL therefore be reported at the cleanup leg, making the
fleet a standing list of what has not yet been tidied up.

#### Scenario: Merged but not tidied
- **WHEN** a docket's branch is merged into the default branch and its bay still exists
- **THEN** it appears in the fleet at the cleanup leg

#### Scenario: Tidied away
- **WHEN** that docket's bay is removed
- **THEN** it no longer appears in the fleet
