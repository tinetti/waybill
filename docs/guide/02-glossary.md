# The Dispatcher's clipboard

Every word we use on this dock, in the order you'll trip over them. My notes are on top. The
**Literally:** line underneath is what the word means in git and Claude Code terms, no
embellishment. When you're in a hurry, read that line and nothing else.

### trunk

Where every job begins, and where every job comes home.

**Literally:** the repository's default branch, usually `main`. Efforts begin here, and no docket
is open while it is checked out.

### docket

The folder of paperwork that rides with the freight. It gets thicker at every leg.

**Literally:** the git branch for one change. A docket is open whenever anything but the trunk is
checked out.

### bay

Every docket gets its own loading bay. Nobody works on the main floor.

**Literally:** the docket's own git worktree, so the main checkout is never touched. By default it
lives at `.claude/worktrees/<checkout>-<branch>` inside the main checkout.

### leg

One stretch of road, one driver.

**Literally:** one stage of the route, run in one Claude Code session. There are seven: `ideate`,
`bay`, `refine`, `contract`, `specs`, `execute`, `cleanup`.

### route

Same road every time. Only the freight changes.

**Literally:** all seven legs, in their fixed order, from `ideate` to `cleanup`.

### stamp

We don't keep a ledger. We look at the freight.

**Literally:** the mark a leg leaves in the repository, and how waybill knows the leg is done: a
branch, a worktree, a file matching a path, or a command that exits 0. Waybill reads the stamps off
the repository every time and keeps no state file.

### booking

Who's driving, in what truck, how hard.

**Literally:** a markdown file with YAML frontmatter that binds a leg to its carrier command, model
and effort. The shipped ones live in `bookings/`, and they can be swapped per machine or per
repository with an overlay.

### carrier

The outfit with the trucks. We don't have any.

**Literally:** the command a booking names for its leg, such as `/ideation:brainstorm` or
`/spec:apply`.

### waybill

The slip for one leg. You get a fresh one every time.

**Literally:** the instruction for exactly one leg, issued fresh every session: the docket's
position, the NEXT block of commands to paste, and the booking's text. Also the name of the tool
itself (`waybill`, or `wyb` for short).

### handover

How the paperwork changes hands between legs.

**Literally:** the booking key that decides what comes before the NEXT block's commands.
`transfer` puts a `/clear` first, so the leg runs in a fresh session. `through` adds nothing, so
the leg carries on in the current session. Any other value is printed as it is, above the
commands.

### handler

Forgets everything at the end of a shift. On purpose.

**Literally:** the Claude Code session that runs one leg. It starts empty, reads one waybill, runs
one leg and leaves its stamp. `/clear` between legs is how a new handler starts.

### papers

What's in the docket. The papers are the stamp.

**Literally:** the files a leg writes into the repository, such as `contract.md` or `tasks.md`. A
path stamp only counts papers that this branch changed compared with the default branch.

### fleet

Everything that's out on the road right now.

**Literally:** every open docket in the repository, meaning every branch that has a bay on disk.
`waybill status` lists the fleet when you run it on the trunk.

### overlay

Your own standing orders, pinned over the house rules.

**Literally:** a directory of your own bookings, set with `WAYBILL_BOOKINGS_DIR` or
`git config waybill.bookingsdir`. A booking in it replaces the shipped booking for its leg
entirely, and every other leg keeps its default.

### freight forwarder

That's us. We own no trucks.

**Literally:** what waybill is. It reads the docket, decides which leg comes next, names the
carrier that runs it and prints the handover. The legs themselves are run by carriers. For `bay`
and `cleanup`, the carrier happens to be one of waybill's own commands.
