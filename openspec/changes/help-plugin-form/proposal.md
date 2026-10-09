## Why

`/waybill:next <branch>/<leg>` already moves a session into a bay: the CLI prints a keyed
`ENTER BAY: <path>` line and `commands/next.md` calls `EnterWorktree` with it. `/waybill:bay` does
not, so after it cuts or finds a bay the session is still standing in the main checkout, and the
operator has to `/clear` and paste the waybill's last line just to get into the bay they asked for.

Source: the approved contract and specs in `docs/ideation/help-plugin-form/`.

## What Changes

- `bay --markdown` prints `ENTER BAY: <path>` between its heading and the waybill, unless the
  operator is already inside that bay or the docket's next leg is `cleanup` (which is about to
  remove the bay). It never prints `RUN:` or `NEXT LEG:`: `bay` takes no leg token.
- `commands/bay.md` declares `EnterWorktree`, shows the block verbatim, then moves the session with
  `EnterWorktree` and stops. A failed or denied move is explained in one line and the block is shown
  verbatim, with no `cd` fallback: no `RUN:` follows, and the waybill's `/waybill:next` line still
  moves the next session. It still runs no leg: `Skill` and `SlashCommand` are on its
  `allowed-tools` only for `add-next-leg-brief`'s brief prompt, and `/waybill:brief` is the one
  command it may invoke.
- The "a selection never switches" rule is scoped to `next`'s docket menu; `bay`'s branch picker
  re-run is a request for a bay and may enter it.
- Plain `bay` output, `bay --list`, and `next` are unchanged.
- The help page names every verb in its `/waybill:` form: FROM ZERO becomes four steps with no `cd`
  step, COMMANDS lists the six `/waybill:` commands, and ROUTE gains a `#  LEG  CARRIER  STAMP`
  header row that shares the rows' width calculation.

Nothing here is breaking.

## Capabilities

### Modified Capabilities

- `command-surface`: the verbatim-rendering exceptions and the markdown form of `bay`.
- `handover`: the keyed lines section of the markdown document shape.
- `help-card`: the walkthrough, the route's header row, and the verbs' `/waybill:` form.

## Impact

- `src/cli.js` (`bay`), doc comments in `src/waybill.js`, `commands/bay.md`.
- `src/help.js` (the page's FROM ZERO, ROUTE header and COMMANDS).
- Tests: `tests/cli.test.js`, `tests/commands.test.js`, `tests/golden/bay-cut.md`,
  `tests/help.test.js`, `tests/golden/help.txt`.
- `README.md`, `CHANGELOG.md`.
