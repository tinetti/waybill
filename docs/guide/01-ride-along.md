# The ride-along

Coat off the hook, rookie. You're riding with me today.

One change, start to finish. You've got an idea, call it `feat/thing`. By tonight it will have
crossed seven legs, a handful of sessions and three different carriers. Nobody will lose it,
because the paperwork travels with the freight.

Here's the whole job: read what's on the counter, do the one thing it says, leave your stamp. I
don't remember yesterday. Neither will you. That's the system working.

## On the trunk

We stand on `main`, the trunk. No docket is open here. Nothing has left the yard.

You ask the counter for the first leg's paperwork. In a terminal:

```sh
waybill new
```

In a Claude Code session, type `/waybill:new` instead. It shows you the same waybill and then runs
the leg's command for you, right there.

## Leg 1 · ideate — Talk it through before you load anything

Here's your first waybill. Read it top to bottom. It always comes in the same order: where the
docket stands, then the NEXT block, then the carrier's instructions.

```waybill
main · no docket open

NEXT:
/clear
/model opus
/effort high
/ideation:brainstorm

  Talk the idea through before committing to it. Name the problem, argue for the smallest version
  that could work, and surface the assumptions you have not tested yet. Nothing is written to disk
  at this leg by design — the output is a decision to build, or a decision not to.

  This leg's `stampCmd` never succeeds on purpose: rough ideation leaves no papers, so Waybill takes
  its stamp from repository state (a later leg is already done, or a feature branch is checked out)
  rather than from this booking.
```

The NEXT block is the handover. Paste it one line at a time, in order. Claude Code takes a
multi-line paste as one input, and `/model` would swallow the rest as its argument. Ask me how I
know.

The `/clear` on top is there on purpose. The handler for this leg starts empty. Then
`/ideation:brainstorm` argues with you until you've got a decision: build it, or don't.

Nothing lands on disk at this leg. A good brainstorm leaves no papers, only a rookie who knows
what they want.

> **Plainly:** On `main`, you ran `/clear`, set the model and effort, and ran
> `/ideation:brainstorm` in a fresh Claude Code session. No file or branch was created.

## Leg 2 · bay — Cut the branch, back up to a bay

The idea survived. Time to cut a branch and give it a bay: its own worktree, so the main checkout
never gets touched. From the trunk, name the branch:

```sh
waybill bay feat/thing
```

Or `/waybill:bay feat/thing` in the session you're already in. Leave the name off the slash
command and it offers you a short list of branches to pick from.

Say you'd jumped the gun and run `git switch -c feat/thing` in the main checkout. The counter
would hand you this for leg 2:

```waybill
feat/thing · leg 2 of 7 (bay)
  ✓ ideate
  ▶ bay

NEXT:
/model haiku
/effort low
/waybill:bay

  Cut the feature branch and its isolated bay, then move into it — every leg after this one happens
  in the new bay. Pass the branch name as the argument (`feat/<short-name>`). In a session, the
  handover it prints ends in `/waybill:next <branch>/<leg>`, which moves the next session into the bay
  after `/clear`; in a terminal, read the `cd` line it prints instead.

  This leg's `stampCmd` never succeeds on purpose, exactly as the ideate leg's does not: Waybill takes
  the bay's stamp from repository state — `git worktree list` and the configured bay path — never from a
  booking. This one exists to supply the waybill: the command, the model, and this text.
```

No `/clear` this time. The bay leg rides straight through on the session you've got. Cheap leg,
cheap model.

When the bay is cut, the command prints the next leg's handover. In a session it ends in
`/waybill:next feat/thing/refine`. In a terminal it prints a `cd` line instead. Either way, from
here on you work in the bay.

> **Plainly:** Waybill created the branch `feat/thing` and a git worktree for it, by default under
> `.claude/worktrees/` in the main checkout, and printed the handover for leg 3.

## Leg 3 · refine — The interview

New session. `/clear` wipes the handler clean, and a cleared session wakes up back in the main
checkout. That's fine. Paste `/waybill:next feat/thing/refine` from anywhere and it walks the
session into the bay and runs the leg there. From a terminal, stand in the bay and ask:

```sh
waybill next
```

```waybill
feat/thing · leg 3 of 7 (refine)
  ✓ ideate  ✓ bay
  ▶ refine

NEXT:
/clear
/model opus
/effort high
/ideation:ideation

  Run the ideation interview. Push on scope, sequencing, and the decisions worth recording as
  rejected, and keep going until the shape of the work is settled rather than merely described.
  The interview and the contract are one session's work; carry straight on into the contract leg.
```

The interview asks hard questions about scope. Answer them. The handler who comes after you won't
have heard a word of it. They'll only have what gets written down.

> **Plainly:** In a fresh session inside the worktree, `/ideation:ideation` ran the interview and
> wrote `docs/ideation/<project>/contract-data.json`. That file is this leg's stamp.

## Leg 4 · contract — Put it in writing

Same session, no break. The waybill says so: there's no `/clear` in the NEXT block.

```waybill
feat/thing · leg 4 of 7 (contract)
  ✓ ideate  ✓ bay  ✓ refine
  ▶ contract

NEXT:
/model opus
/effort high
/ideation:ideation

  Turn the interview into the contract: goals, success criteria, phase breakdown, and the decision
  log of what was considered and rejected. The contract is what every later leg is checked against,
  so state the criteria as commands that can be run, not as adjectives.
```

The contract is what every later leg gets checked against. Write the criteria as commands someone
can run. "Nice and fast" isn't a criterion, rookie. It's a wish.

> **Plainly:** Still in the same session, `/ideation:ideation` wrote
> `docs/ideation/<project>/contract.md`. That file is this leg's stamp.

## Leg 5 · specs — Scaffold the change

`/clear` again. New handler. Ask the counter where the docket stands:

```sh
waybill next
```

```waybill
feat/thing · leg 5 of 7 (specs)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract
  ▶ specs

NEXT:
/clear
/model opus
/effort high
/spec:propose

  Scaffold the change: proposal, spec deltas, design notes, and a tasks list. Write the tasks so each
  one is a checkbox a later session can tick without re-reading the whole proposal, because the
  execute leg reports progress by counting exactly those boxes.
```

A new carrier takes over here. `/spec:propose` is the bare name, and it only resolves if you've
wired up the `/spec:*` commands. The reference says how. Skip that and this leg hands you a command
your session can't find.

Write the tasks as checkboxes. The next leg counts them.

> **Plainly:** In a fresh session, `/spec:propose` ran OpenSpec and wrote
> `openspec/changes/<change>/tasks.md` along with the proposal and spec deltas. That `tasks.md` is
> this leg's stamp.

## Leg 6 · execute — Do the work

`/clear`. The waybill now names the change, `add-thing`, because the carrier needs to know which
one to apply. It also shows how far along you are.

```waybill
feat/thing · leg 6 of 7 (execute)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract  ✓ specs
  ▶ execute (1 of 3 tasks)

NEXT:
/clear
/model opus
/effort high
/spec:apply add-thing

  Work the tasks list top to bottom, test first, ticking each box as it lands. A phase is roughly one
  session's context — stop and hand the docket on when the remaining tasks no longer fit, rather than
  running the session dry.
```

This leg can take more than one session. When the context runs thin, stop and hand the docket on.
The next handler asks the counter, sees how many boxes are ticked, and picks it up. Nobody has to brief them.

> **Plainly:** In one or more fresh sessions, `/spec:apply add-thing` implemented the change and
> ticked the boxes in `tasks.md`. The leg is stamped when every box is ticked.

## Leg 7 · cleanup — Back to the trunk

Every box is ticked, so the counter moves on to the last leg:

```waybill
feat/thing · leg 7 of 7 (cleanup)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract  ✓ specs  ✓ execute
  ▶ cleanup

NEXT:
/model sonnet
/effort low
/waybill:cleanup feat/thing

  Fold the branch back into the default branch and take its bay with it. Read the whole change one
  last time first: the three-dot diff between the default branch and this one is exactly what is
  about to land, and this is the last moment where reading it is cheap.

  The diff is named rather than spelled out: this body is rendered verbatim, so a literal
  `git diff <default>...<branch>` would reach you with both placeholders still in it.

  This leg's `stampCmd` never succeeds on purpose, exactly as the bay leg's does not: Waybill takes
  cleanup's stamp from repository state — the branch merged into the default branch, and no bay left
  at the configured path — never from a booking. This one exists to supply the waybill: the command,
  the model, and this text.

  `/waybill:cleanup` is the carrier Waybill ships, and it is deliberately the modest one: it assumes
  the pull or merge request is already merged on the forge — by a reviewer, or by CI — verifies that
  with plain git, and then retires the bay and the branch. It never merges anything itself and never
  calls `gh` or `glab`, so it needs no auth and behaves the same on any remote. If the branch is not
  merged yet it stops and says so rather than deleting work.

  If you want a carrier that merges the request for you as well, rebook this leg rather than editing
  this file: point `waybill.bookingsdir` at a directory of your own and drop a booking for `cleanup`
  into it. `examples/mar-cleanup.md` is a worked one. See *Swapping a carrier* in the README.
```

Open the pull request the way you always do and let someone merge it. Then run the NEXT block. No
`/clear` for this one. `/waybill:cleanup feat/thing` checks with plain git that the branch
really is merged. Then it retires the bay and the branch. If it's not merged, it stops and tells
you. It never merges anything itself.

> **Plainly:** `/waybill:cleanup feat/thing` confirmed that `feat/thing` was merged into the
> default branch, then removed its worktree and deleted the branch.

## End of the line

That's the route, rookie. Seven legs, every one stamped on the repo itself, and not one of us had
to remember a thing.

When a word on a waybill stops you cold, it's on [the clipboard](02-glossary.md). When you need a
flag, a key or a prerequisite, look in [the reference](03-reference.md).
