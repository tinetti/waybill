# `new`, `bay`, and the fleet view

Date: 2026-09-08
Status: approved, not yet implemented

## Problem

`waybill next` answers two unrelated questions with one command, and picks between them by reading
the checked-out branch.

On a docket it issues the waybill for the next leg — the thing the command is named for. On the
trunk it issues the waybill for leg 1, which is not "what comes next on this docket" but "how do I
begin an effort at all". `src/waybill.js:50-56` shows the seam: `header` branches on `docketOpen`
before it looks at `leg`, and `renderWaybill` suppresses the leg strip entirely
(`src/waybill.js:184-188`), because there is no position to report. The command prints a waybill for
a docket that does not exist.

The second problem is that the trunk cannot see anything. A docket is defined as the checked-out
branch (`src/inference.js:84`), so `resolveLeg` can only ever answer for the tree the operator is
standing in. With three bays open, `waybill next` on the trunk reports `no docket open` — a
statement that is true of the current directory and false of the repository. There is no way to ask
what is in flight without visiting each bay in turn.

## Decisions

1. **A docket, seen from the trunk, is a bay on disk** — a linked worktree from
   `git worktree list --porcelain`. This is already the tool's own definition of in-flight: leg 2
   makes the bay mandatory (`bookings/waybill-bay.md`), and leg 7 is stamped only when the bay is
   gone (`src/legs.js:84`, `cleanupIsDone`). It also gives every docket a directory, so `resolveLeg`
   reads unstaged and untracked papers exactly as it does today.

   Rejected: any non-trunk local branch, and any unmerged non-trunk branch. Both admit dockets with
   no worktree, whose stamps could only be read from the committed diff — a branch mid-`refine`
   with uncommitted papers would report an earlier leg than it is, which is the class of bug
   `2026-09-07-docket-scoped-stamps-design.md` exists to have fixed.

2. **`new` invokes ideation rather than printing its waybill.** This breaks the print-and-stop rule
   stated in `commands/start.md` deliberately. `handover: transfer` exists so that a session which
   already spent context on the previous leg is cleared first; `new` is the entry point, there is no
   previous leg, and a session sitting on the trunk about to ideate is already empty.

3. **`start` is renamed to `bay`, with no alias.** The leg is called `bay`; only the command
   disagreed. Introducing `new` beside `start` would replace the overload on `next` with a
   synonym collision on the trunk — "new" and "start" both read as "begin". At 0.2.0 with the plugin
   marketplace as the only distribution, an alias is a second name to document and keep in step
   forever.

4. **`status` on the trunk becomes a fleet view.** The docket list belongs on the read-only surface,
   which keeps `next` printing exactly one waybill and gives `status` a reason to exist on the trunk
   for the first time.

5. **The CLI never prompts.** It prints the docket list and the usage line; `commands/next.md`
   turns that into an `AskUserQuestion` and re-invokes. Keeps the CLI pure stdout, every output
   coverable by a golden file, and adds no TTY-detection branch that must never misfire inside the
   `` ! `` invocation.

6. **Approach: a fleet module beside inference, not a plural inference layer.** `src/fleet.js`
   enumerates bays and maps each to a plain `resolveLeg(bayPath)` call. `src/inference.js` is not
   touched.

   Rejected: generalising `resolveLeg` into `resolveDockets` returning an array. It rewrites the
   module every stamp flows through and invalidates every golden fixture, in exchange for a
   plurality nothing in this design needs — no feature here reasons across dockets.

   Rejected: doing it all in `commands/next.md` with no source change. It puts real logic in
   markdown where nothing tests it, leaves `waybill next` from a plain terminal broken, and lets the
   two surfaces disagree about what a docket is — the exact failure `renderPosition` and
   `renderWaybill` share `withFindings` (`src/waybill.js:151`) to avoid.

## Design

### 1. Command surface

Four verbs, each naming one thing, three of them matching a row in the route table.

| Command | Trunk, no bays | Trunk, one bay | Trunk, many bays | Inside a bay |
| --- | --- | --- | --- | --- |
| `new` | invoke ideation | invoke ideation | invoke ideation | invoke ideation, and warn |
| `bay <branch>` | cut branch + bay | same | same | same |
| `next [<branch>]` | exit 2, point at `new` | that docket's waybill + `cd` | list, exit 2 | unchanged |
| `status` | `main · no dockets open` | fleet view | fleet view | unchanged |

"invoke ideation" is the slash command's behaviour; `waybill new` in a terminal prints leg 1's
waybill and stops, because a CLI has no session to invoke anything in. See §6.

`next <branch>` is a positional, matching `bay <branch>`. It resolves against that branch's bay from
anywhere — the trunk, or another bay — and errors when the branch has no bay:

    waybill: no bay for feat/x — cut one with `waybill bay feat/x`

### 2. The exit contract

**`waybill next` exits 0 if and only if it issued exactly one waybill.**

No dockets and too many dockets are both "no waybill was issued", so both exit 2. This preserves the
rule already stated in `src/cli.js:65` — exit 2 is reserved for "there is nothing here to answer
about" — and gives scripts one condition to test instead of three.

`next --json` still emits an object in every case, so it remains the single machine-readable
surface and `status` still takes no options (`src/cli.js:97`). The ambiguous and empty cases
emit:

```json
{ "error": "...", "dockets": [{ "branch": "...", "path": "...", "leg": "...", "index": 5 }] }
```

Both non-zero cases print to **stdout**, not stderr, because the `` ! `` invocation in
`commands/next.md` is the primary consumer and stderr capture there is unverified. Verify this
during implementation: if stderr is not captured, `repoRoot`'s existing "not a git repository" error
(`src/cli.js:50-56`) is already invisible inside a session. That is a pre-existing bug; record it,
do not fold the fix into this change.

### 3. Enumeration: `src/fleet.js`

One query added to `src/repo.js` (`git worktree list --porcelain`), and the mapping in `fleet.js`.
The `worktree ` prefix is sliced rather than split on whitespace, as `mainCheckout`
(`src/repo.js:44`) already does, so paths containing spaces survive.

A worktree is a docket only if all of the following hold. Each exclusion is a real state git can
produce, not a defensive guess:

- it is not the main checkout — the first `worktree ` entry;
- it has a branch. `--porcelain` reports `detached` instead of `branch` for a detached HEAD, and a
  docket with no branch has nothing to hang itself on. This is the same guard `docketOpen` already
  needs at `src/inference.js:84`, where `currentBranch` returns null;
- its branch is not the default branch. `git worktree add` will happily check the trunk out twice;
- it is not `prunable`. A worktree whose directory was deleted out from under git is still
  registered, and `resolveLeg` against a path that does not exist would warn rather than fail.

Each surviving entry is resolved with `resolveLeg(worktreePath, bookings)` — the existing function,
unchanged, called with a directory other than the operator's for the first time.

**`src/inference.js` staying untouched is the check on this approach.** If implementation starts
wanting to change it, the boundary was drawn in the wrong place; stop and revisit rather than widen
the diff.

### 4. Rendered output

Trunk, no bays — exit 2. The CLI names the CLI form; `commands/next.md` translates it to
`/waybill:new` for a session, the same way it already adds framing for `IGNORED BY GIT`:

    waybill: no dockets open — begin one with `waybill new`

Trunk, one bay — exit 0. The `cd` block gets its own heading and sits *before* `NEXT:`, because the
order is load-bearing: move the shell first, then `/clear` the session.

    feat/session-handover · leg 5 of 7 (specs)
      ✓ ideate  ✓ bay  ✓ refine  ✓ contract
      ▶ specs

    IN BAY:
      cd /Users/…/waybill-feat-session-handover

    NEXT:
      /clear, then run:
      /spec:propose add-session-handover
      └ opus · high effort

Trunk, many bays — exit 2. The heading matches the all-caps convention `withFindings` already uses
for `NEXT:`, `IGNORED BY GIT:` and `WARNINGS:`, and is the literal string `commands/next.md`
branches on:

    main · 3 dockets open

    SELECT A DOCKET:
      feat/session-handover · leg 5 of 7 (specs)
      fix/stamp-scoping     · leg 6 of 7 (execute, 4 of 9 tasks)
      feat/fleet-view       · leg 3 of 7 (refine)

      waybill next <branch>

`status` on the trunk — exit 0, no waybill. Warnings from each docket's resolution are aggregated
and prefixed with the branch they came from, so a docket that cannot determine its diff is named
rather than blamed on the repository at large:

    main · 3 dockets open

    DOCKETS:
      feat/session-handover · leg 5 of 7 (specs)
      fix/stamp-scoping     · leg 6 of 7 (execute, 4 of 9 tasks)
      feat/fleet-view       · leg 3 of 7 (refine)

`renderFleet` and `renderSelect` join `renderWaybill` and `renderPosition` in `src/waybill.js` and
share `withFindings` with them, for the reason that function's own comment gives: two surfaces that
build their own findings blocks will eventually disagree about the same repository.

The `cd` lines currently built inline in `start()` (`src/cli.js:187-196`) move to a shared helper so
trunk-resolved `next` and `bay` cannot print different shapes of the same instruction. `isInside`
(`src/bay.js`) already covers the "you are already there" case.

### 5. `commands/next.md` and the verbatim rule

The Task section today has exactly one rule — show the block verbatim, then stop — and that single
rule is what stops the model paraphrasing a waybill. This change adds a branch to it, which is the
main risk in the design, so the branch is keyed on an exact literal:

> If the block contains `SELECT A DOCKET:`, ask which docket, then re-run
> `waybill next <branch>` and show *that* block verbatim. Otherwise show the block verbatim and
> stop.

Verbatim stays the default; the exception is a string match rather than a judgment call.

Two knock-on details. The second invocation needs no new permission — `allowed-tools: Bash(node:*)`
already covers it (`commands/next.md:3`). But `AskUserQuestion` is **not** in that list, and the
list is restrictive, so it must be added or the prompt is silently unavailable.

### 6. `new`: two surfaces, one booking

Decision 2 says `new` invokes ideation, and a CLI cannot invoke anything — it is not a session. The
two surfaces therefore split cleanly, and the split is the point:

- **`waybill new`** (CLI) prints leg 1's waybill from `bookings/ideation-ideate.md` and stops. This
  is byte-for-byte the block trunk `next` prints today; it is not lost, it moves to the command
  that means it.
- **`/waybill:new`** (slash command) shows that block, then invokes the command it names. When the
  session cannot resolve `/ideation:brainstorm` — the `ideation` plugin is not installed — it says
  so and leaves the waybill on screen as the instruction, which is the "or tells the user how to
  start it" half of the requirement.

Everything below concerns the slash command only.

A session cannot switch its own model, so invoking `/ideation:brainstorm` directly discards the
ideate booking's `opus · high effort` (`bookings/ideation-ideate.md:4-5`). The fix is to declare
`model: opus` and `effort: high` in `commands/new.md`'s frontmatter.

This is the exact opposite of what `commands/next.md:7` and `commands/start.md:8` do, and
correctly so: those commands refuse `model:` because their waybill is for the **next** session,
while `new`'s waybill is for **this** one.

That leaves the routing stated in two files that can drift. `tests/commands.test.js` already solved
this problem once, in *"keeps the vendored routing commands byte-identical to what they encode"* —
the same pin applies here, asserting `commands/new.md`'s `model`/`effort` against
`bookings/ideation-ideate.md`. Rebook ideate to sonnet and the suite reports that the command
disagrees.

`new` invoked from inside a bay warns that new efforts begin on the trunk, and proceeds anyway.
Ideation writes nothing to disk (`bookings/ideation-ideate.md`), so the wrong cwd costs nothing but
confusion, and blocking it would be a rule with no failure behind it.

### 7. A property that falls out

Leg 7 is stamped by *merged into the default branch **and** no bay left*. A merged branch whose bay
still stands therefore appears in the fleet at `leg 7 of 7 (cleanup)` — the trunk view becomes a
standing list of what has not been tidied up — and the moment `/mar` removes the bay, the docket
drops off the list because it is genuinely complete. The enumeration and the stamp agree without
either knowing about the other.

## Testing

Written first, in this order.

**`tests/fleet.test.js`** — enumeration, which is where the real bugs are. One case per exclusion in
§3: the main checkout is not a docket; a detached-HEAD bay is not a docket; a bay checked out on the
default branch is not a docket; a `prunable` worktree whose directory was deleted is not a docket;
zero bays yields an empty fleet rather than an error.

**`tests/cli.test.js`** — the exit contract of §2 as a sweep: `next` exits 0 iff exactly one waybill
was issued, across zero, one, and three dockets. Plus `next <branch>` hitting and missing, and `bay`
behaving exactly as `start` did.

**`tests/waybill.test.js`** and golden files — `fleet.txt`, `select.txt`, `trunk-one-docket.txt`,
`no-dockets.txt`. `tests/golden/no-docket.txt` is **not** retired: per §6 it is exactly what
`waybill new` prints, so it is re-pointed at `new` and must pass unchanged. If regenerating it
produces a diff, the ideate waybill was altered by accident.

**`tests/commands.test.js`** — `DECLARED` updated to add `bay.md` and `new.md` and drop `start.md`,
plus the routing pin from §6.

**Regression guard** — every existing golden file covering the in-a-bay path must pass *unchanged*.
That is the cheapest available proof that the trunk/bay dispatch did not disturb the path that
already worked.

## Files

| | |
| --- | --- |
| New | `src/fleet.js`, `commands/new.md`, `tests/fleet.test.js`, four golden files |
| Renamed | `commands/start.md` → `commands/bay.md` |
| Modified | `src/cli.js`, `src/waybill.js`, `src/repo.js`, `bookings/waybill-bay.md`, `commands/next.md`, `commands/status.md`, `README.md`, `tests/{commands,cli,waybill}.test.js`, `tests/golden/bay.txt` |
| Untouched | `src/inference.js`, `legs.js`, `bookings.js`, `frontmatter.js`, `inspection.js`, `progress.js`, `openspec.js` |

## Out of scope

- **Cross-docket reasoning.** Nothing here compares dockets, orders them by staleness, or warns
  about two dockets touching the same files. The fleet view is a list.
- **A `status --json`.** `next --json` already carries the fleet shape in its ambiguous case, and
  the rule in `src/cli.js:97` against a second machine-readable surface stands.
- **Interactive selection in the CLI.** Decision 5.
- **The stderr-capture question in §2.** Investigated and recorded during implementation, fixed
  separately.
