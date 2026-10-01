## Why

Every `transfer` leg starts after a `/clear`, and the waybill hands the new session a bare command.
The brainstorm that `/waybill:new` runs leaves nothing on disk by design, so when `/waybill:bay`
hands off to `ideate`, the decision, its assumptions and the rejected alternatives exist only in the
conversation the `/clear` is about to discard — `/ideation:ideation` then starts its intake from
zero. `specify` has the same gap: `/spec:propose` takes free text and is passed none, so whatever the
ideate session settled beyond what reached `contract.md` is lost too.

Waybill is deterministic Node with no model. It can assemble the facts it infers, but it cannot
summarise a conversation; that has to be written by the session finishing the previous leg, before
its `/clear`. Source: `docs/ideation/next-leg-brief/contract.md` (approved 2026-09-21), translated
onto the six-leg route that landed in #39 — see `design.md` for every deviation.

## What Changes

- **New verb `waybill brief [<branch>]`.** Resolves a docket the way `next` does, finds the leg that
  is next, and — when that leg's booking takes a brief — creates `<bay>/.waybill/handoff/` with a
  self-ignoring `.gitignore` and prints `BRIEF FOR:`, `WRITE TO:` and `GUIDANCE:`. It writes no
  brief itself. When the next leg takes none it prints `NOTHING TO BRIEF:` and exits 0.
- **New booking key `brief:`.** One optional line of guidance for the author of the brief. Its
  presence is what marks a leg as brief-taking. Set on the stock `ideate` and `specify` bookings;
  honoured in overlays like every other key.
- **`RUN:` carries the brief and Waybill's own facts.** For a brief-taking leg, the `RUN:` line of a
  pasted `/waybill:next <branch>/<leg>` gains a one-line suffix: `Brief: <path> (read first)` or
  `Brief: none written`, then the branch, the bay, the ideation directory, any skipped legs, and
  the leg that follows this session. Legs with no `brief:` key are byte-identical to today.
- **`BRIEF:` keyed line on display runs.** `next --markdown` and `bay --markdown` print
  `BRIEF: <leg> <path>` when the next leg takes a brief, the bay exists, and no brief has been
  written for it yet.
- **New command `/waybill:brief`.** Runs the verb and writes a self-contained HTML brief to the path
  it names, drawing only on the current conversation.
- **`/waybill:next` and `/waybill:bay` trigger it.** On a `BRIEF:` line both ask, with
  `AskUserQuestion`, whether to write the brief before showing the waybill. After a run-mode leg's
  command finishes, `/waybill:next` runs `/waybill:brief` unprompted. `bay.md` gains `Skill` and
  `SlashCommand` so a "yes" can act.
- Help card, usage text, README and `docs/guide/` describe the verb, the key and the handoff path.

Nothing here is breaking: plain output, `next --json`, and every waybill for a leg whose booking has
no `brief:` key are unchanged.

## Capabilities

### New Capabilities

None. The brief is part of how a leg is handed over and of the verbs that do it; both capabilities
already exist.

### Modified Capabilities

- `handover`: the markdown document gains a `BRIEF:` keyed line on display runs; the `RUN:` line
  gains a context suffix for brief-taking legs; a booking can declare `brief:` guidance.
- `command-surface`: a `brief` verb with its own exit contract and its self-ignoring handoff
  directory; a `/waybill:brief` session command; `/waybill:next` and `/waybill:bay` gain a
  `BRIEF:`-keyed exception and `/waybill:next` an automatic brief after a run-mode leg.

## Impact

- **Source**: new `src/brief.js`; `src/bookings.js` (`OPTIONAL`, typedef), `src/waybill.js`
  (`BRIEF` export, `Route.context`, `keyedLines`), `src/cli.js` (`brief` verb, `USAGE`, `COMMANDS`,
  context assembly at the three markdown call sites), `src/help.js` (one more COMMANDS row, inside
  the 45-line budget).
- **Bookings**: `bookings/ideation-ideate.md`, `bookings/openspec-specify.md`.
- **Commands**: new `commands/brief.md`; `commands/next.md`, `commands/bay.md`, `commands/help.md`.
- **Tests**: new `tests/brief.test.js`; `tests/waybill.test.js`, `tests/cli.test.js`,
  `tests/bookings.test.js`, `tests/commands.test.js`, `tests/bang-lines.test.js`,
  `tests/help.test.js`; three new goldens and a re-recorded `tests/golden/help.txt`.
- **Docs**: `README.md`, `docs/guide/01-ride-along.md`, `02-glossary.md`, `03-reference.md`.
- **Operators**: a new untracked, self-ignored `.waybill/handoff/` directory appears in a bay once a
  brief is requested. It never shows in `git status` and does not block `git worktree remove`.
- **External**: no change to the ideation or OpenSpec plugins. The payoff depends on the receiving
  session reading the path named after `Brief:` before its intake — confirmed by one manual run.
- **Dependencies**: none added.
