## Why

Waybill fixes re-orientation mid-route, but not at cold start. Standing on the trunk, an operator gets
the first carrier and nothing else: no leg count, no route, and no vocabulary. That is the one state
where the author has no memory to fall back on. The command surface just changed underneath them, too.
new-bay-and-fleet added `new` and renamed `start` to `bay` with no alias. Recovering a seven-leg
route and a glossary that fit on one screen still means re-reading a 13.8K README.

Source: the approved contract and spec in `docs/ideation/waybill-help/`. Their prerequisite gate,
new-bay-and-fleet, has landed and is archived: `new` and `bay` both appear in `waybill --help`.

## What Changes

- Add a `waybill help` subcommand that prints a fixed reference page of at most 45 lines. The page
  has four sections: a from-zero walkthrough, the seven-leg route, a glossary, and the four verbs.
  It ends with a two-line Why footer and a one-line README pointer.
- Generate the route section from `LEGS` (`src/legs.js`) joined against `resolveBookings`. Adding a
  leg, or rebooking a carrier through an overlay, changes the page with no edit to the renderer.
- `help` reads booking configuration but never repository position: no branch, worktree, or diff. It
  exits 0 outside a git repository, rejects any argument with exit 2, and never throws because a
  booking is malformed.
- Add exactly one row for `help` to the `--help` usage. The Options block and the existing Commands
  rows stay byte-identical.
- Add `commands/help.md`, a verbatim-and-stop passthrough modelled on `commands/status.md` that
  declares no model or effort.
- Add a `/waybill:help` row to the README command table and name it in the README's list of
  installed commands.
- Test hygiene that comes with the change: a new `tests/help.test.js` and `tests/golden/help.txt`,
  registered in `tests/index.js`. `assertGolden` moves into the shared test helper. A new
  `exactly one script` assertion pins `package.json`.

Nothing here is breaking. The change is additive: one subcommand, one slash command, and one usage
line.

## Capabilities

### New Capabilities

- `help-card`: the reference page. Covers its content and structure, the 45-line budget, how the
  route is generated from the leg model and resolved bookings, how it tolerates bad bookings and
  runs outside a repository, and how the slash command shows it verbatim.

### Modified Capabilities

- `command-surface`: the requirement "Four verbs, each naming one thing" currently says the surface
  consists of *exactly* four verbs, and adding `help` breaks that as written. The requirement changes
  to four docket verbs plus one reference command that answers no question about a docket. The
  existing "the page teaches four verbs" language stays true.

## Impact

- **New files**: `src/help.js`, `commands/help.md`, `tests/help.test.js`, `tests/golden/help.txt`.
- **Modified files**:
  - `src/cli.js`: the `help` handler, a `COMMANDS` entry, and one `USAGE` row.
  - `tests/commands.test.js`: `DECLARED` gains `'help.md'`, plus the `exactly one script` assertion.
  - `tests/index.js`: registers the new suite.
  - `tests/helpers/repo-fixture.js`: `assertGolden` is promoted here.
  - `tests/waybill.test.js`: now imports the promoted `assertGolden`.
  - `README.md`: the command-table row and the installed-commands sentence.
- **Dependencies**: none added. `package.json` stays at zero dependencies and one script.
- **Stateful surfaces**: `new`, `bay`, `next`, and `status` behave exactly as before.
