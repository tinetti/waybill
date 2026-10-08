## ADDED Requirements

### Requirement: `brief` names where the next leg's brief goes

The tool SHALL offer a `brief [<branch>]` verb that answers one question: where does the brief for
this docket's next leg go, and what should it say. It SHALL write no brief itself.

`brief` SHALL resolve its docket the way `next` does: inside a bay it answers for that bay; given a
branch it answers for that branch's bay from anywhere in the repository; on the trunk with exactly
one docket open it answers for that docket. A `<branch>/<leg>` argument SHALL be accepted, and its
leg SHALL be ignored — the leg briefed is always the docket's next leg, as the repository reports it
at the moment `brief` runs, with bookings resolved from the bay.

When the next leg is brief-taking, `brief` SHALL make the handoff directory ready (see the next
requirement), print these three lines in this order, and exit 0:

- `BRIEF FOR: <leg>`
- `WRITE TO: <absolute path>`, the path being `<bay>/.waybill/handoff/<leg>.html`
- `GUIDANCE: <the booking's brief value, verbatim>`

When the next leg is not brief-taking, `brief` SHALL print `NOTHING TO BRIEF: <leg> takes no brief`,
create nothing, and exit 0. When every leg is complete it SHALL print
`NOTHING TO BRIEF: every leg is complete`, create nothing, and exit 0. Neither is an error, because
an automatic caller reaches both in the ordinary course of a route.

When no docket can be resolved — no dockets open, the named branch has no bay, or more than one
docket is open and none was named — `brief` SHALL print one line on standard output saying so and
naming the way forward, create nothing, and exit 2. It SHALL NOT print the docket-selection menu.
An unknown option, or more than one positional argument, SHALL be rejected with exit 2.

Running `brief` again for the same leg SHALL print the same lines and change nothing. An existing
brief file SHALL be left untouched by the verb.

#### Scenario: From the trunk, right after cutting the bay
- **WHEN** `brief feat/x` is run from the trunk, a bay for `feat/x` exists, and its next leg is
  `ideate`
- **THEN** the output is `BRIEF FOR: ideate`, `WRITE TO: <bay>/.waybill/handoff/ideate.html` and a
  `GUIDANCE:` line carrying the ideate booking's `brief` value, and the exit code is 0

#### Scenario: Inside the bay with no argument
- **WHEN** `brief` is run inside a bay whose next leg is `specify`
- **THEN** the output names `specify` and `<bay>/.waybill/handoff/specify.html`, and the exit code
  is 0

#### Scenario: A leg token does not choose the target
- **WHEN** `brief feat/x/ideate` is run and `feat/x`'s next leg is `specify`
- **THEN** the output is for `specify`

#### Scenario: The next leg takes no brief
- **WHEN** `brief` is run inside a bay whose next leg is `execute`
- **THEN** the output is `NOTHING TO BRIEF: execute takes no brief`, no `.waybill/handoff/`
  directory is created, and the exit code is 0

#### Scenario: Every leg complete
- **WHEN** `brief feat/x` is run and `feat/x` has no next leg
- **THEN** the output is `NOTHING TO BRIEF: every leg is complete` and the exit code is 0

#### Scenario: A branch with no bay
- **WHEN** `brief feat/x` is run and no bay for `feat/x` exists
- **THEN** one line states that there is no bay for it and names `bay feat/x`, and the exit code
  is 2

#### Scenario: Several dockets and none named
- **WHEN** `brief` is run on the trunk with three bays open
- **THEN** one line says to name a docket with `brief <branch>`, no menu is printed, and the exit
  code is 2

#### Scenario: Run twice
- **WHEN** `brief feat/x` is run twice in succession
- **THEN** both runs print the same three lines and exit 0

### Requirement: Briefs live in the bay and stay out of git

`brief` SHALL keep briefs in `<bay>/.waybill/handoff/`. When it makes that directory ready it SHALL
ensure the directory exists and contains a `.gitignore` whose whole content is `*`, so the directory
ignores itself and no ignore file outside it is created or edited.

With a brief written there, `git status --porcelain` in the bay SHALL report nothing for the
directory, and the bay SHALL remain removable with `git worktree remove` without `--force`.

#### Scenario: The handoff directory ignores itself
- **WHEN** `brief feat/x` has run for a brief-taking leg
- **THEN** `<bay>/.waybill/handoff/.gitignore` exists and contains `*`, and the repository's other
  ignore files are unchanged

#### Scenario: A brief does not dirty the bay
- **WHEN** a brief file is written at the `WRITE TO:` path in an otherwise clean bay
- **THEN** `git status --porcelain` in that bay prints nothing

#### Scenario: Cleanup still removes the bay
- **WHEN** a bay holding a brief is removed with `git worktree remove <bay>` and no `--force`
- **THEN** the removal succeeds

### Requirement: `/waybill:brief` writes the brief from the conversation

A session-facing `/waybill:brief` command SHALL run the `brief` verb, passing its argument through
only when one was given, and act on the literals the verb prints:

- `WRITE TO: <path>`: the session SHALL write one self-contained HTML document to exactly that path,
  following the `GUIDANCE:` line, and then confirm in one line what was written, for which leg, and
  where. An existing brief at that path SHALL be overwritten.
- `NOTHING TO BRIEF:`: the session SHALL relay that line and stop, writing nothing.
- a final `waybill: exited N` line: the session SHALL relay the output verbatim and stop, writing
  nothing.

The brief's content SHALL be drawn only from the current conversation. The session SHALL NOT invent
content to fill a section: a section with nothing behind it SHALL be left out, because the session
that reads the brief cannot tell an invented section from a real one.

The command SHALL declare the tool that writes files, since the permission list is restrictive and an
undeclared tool is silently unavailable. It SHALL declare no model and no effort.

#### Scenario: Writing a brief
- **WHEN** `/waybill:brief feat/x` is run and the verb prints `WRITE TO: <path>`
- **THEN** an HTML file exists at `<path>` afterwards and the session names the leg and the path in
  one line

#### Scenario: Nothing to brief
- **WHEN** the verb prints `NOTHING TO BRIEF: execute takes no brief`
- **THEN** the session relays that line, writes no file, and stops

#### Scenario: The verb fails
- **WHEN** the output ends with `waybill: exited 2`
- **THEN** the session shows the output verbatim and writes no file

#### Scenario: A thin conversation
- **WHEN** the conversation settled a decision but recorded no rejected alternatives
- **THEN** the brief has no rejected-alternatives section, rather than an invented one

## MODIFIED Requirements

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
  everything after it on the line as its argument, and never `/clear`, `/model` or `/effort`; a
  command it cannot resolve SHALL be named in one line, with no substitute run. Once the invoked
  command has finished, and only then, `/waybill:next` SHALL invoke `/waybill:brief` for the same
  docket and follow it, so the brief for whichever leg is now next is written while the session
  still holds the conversation;
- `NEXT LEG: <leg>`: the session SHALL say that the named leg is not next, show the block verbatim,
  and stop;
- `BRIEF: <leg> <path>`, in `/waybill:next` and `/waybill:bay` alike: before showing the block, the
  session SHALL ask, with a question offering to write it now or to skip, whether to write the brief
  for `<leg>`. On a yes it SHALL invoke `/waybill:brief` for that docket and follow it; on a skip it
  SHALL write nothing. Either way it SHALL then show the block verbatim and stop. The session SHALL
  NOT decide for itself whether a brief is due: it asks when the line is present and never
  otherwise.

Every tool these exceptions require SHALL be declared, since the permission list is restrictive and
an undeclared tool is silently unavailable. `/waybill:bay` SHALL therefore declare the tools that
invoke another command, in addition to the one that asks.

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

#### Scenario: A run line with a context suffix
- **WHEN** the block carries `RUN: /ideation:ideation Brief: <path> (read first) · branch feat/x · …`
- **THEN** the session invokes `/ideation:ideation` with the whole remainder of the line as its
  argument

#### Scenario: A brief after a run-mode leg
- **WHEN** the command a `RUN:` line named has finished
- **THEN** the session invokes `/waybill:brief` for that docket, and not before the command's own
  work is done

#### Scenario: The brief prompt after cutting a bay
- **WHEN** `/waybill:bay feat/x` prints a block carrying `BRIEF: ideate <path>` and I answer yes
- **THEN** `/waybill:brief feat/x` is invoked, the brief is written, and the block is then shown
  verbatim

#### Scenario: Skipping the brief
- **WHEN** the block carries a `BRIEF:` line and I answer skip
- **THEN** nothing is written and the block is shown verbatim

#### Scenario: No brief line, no prompt
- **WHEN** the block carries no `BRIEF:` line
- **THEN** the session asks nothing about a brief
