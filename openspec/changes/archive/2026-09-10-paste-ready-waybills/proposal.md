## Why

Waybill's job is to hand the next session its orders, but the NEXT block delivers them as prose: the
model and effort arrive as a caption (`└ opus · high effort`) the operator must translate into
`/model opus` and `/effort high` by hand, and `/clear, then run:` welds an instruction to a sentence.
Every leg of every docket pays that translation at the moment the operator is switching context.

The obvious fix — one block holding `/model`, `/effort` and the leg command — does not work: Claude
Code submits a multi-line paste as one input, so `/model` receives the following lines as its
argument (the operator's live test: `Model 'haiku     /effort low' not found`). Each command has to
be its own paste, so the thing worth building is one copy button per command.

## What Changes

- The NEXT block becomes a list of commands rather than a description of them: `/clear` (only for a
  `transfer` handover), `/model <model>`, `/effort <effort>` (only when the booking declares one), then
  the leg command. **BREAKING** (output shape): the `└ model · effort` caption and the
  `/clear, then run:` / `run:` lines are removed. Anything parsing the plain text block must move to
  `next --json`, which is unchanged.
- Plain output (`waybill next`, `new`, `bay` in a terminal) prints those commands one per line,
  unindented. A `handover` value other than `transfer` or `through` is still printed verbatim, as an
  indented line above the commands. The booking body and the plain `cd` line keep their indentation.
- New `--markdown` option on `next` and `bay` renders the same waybill as markdown, with each command
  in its own fence so a chat client gives each one a copy button. The position block goes in a text
  fence, and the `cd` instruction gets its own fence. `--json` with `--markdown` is rejected with exit 2.
- `/waybill:next` and `/waybill:bay` ask the CLI for `--markdown` (including the `next <branch>`
  re-run after docket selection) and keep echoing the result verbatim, so a golden file pins the
  fences rather than the model producing them.
- `/waybill:new` stays plain. It now runs only the last command line of the NEXT block, never
  `/clear`, `/model` or `/effort`, because its instruction to ignore the `/clear, then run:` line
  targets a line this change deletes.
- README sample waybills, the `handover` field description, and the options list are updated to match.

Out of scope: the version bump (released separately), a context-window booking field (`model:
opus[1m]` already passes through verbatim), placeholders for arguments Waybill cannot supply, and
markdown for `new`, `status` or the SELECT A DOCKET menu.

## Capabilities

### New Capabilities

- `handover`: the NEXT block as a command list, and its two renderings (plain terminal lines and
  paste-ready markdown fences). Covers command order and inclusion rules, custom handover prose, and
  the markdown document shape.

### Modified Capabilities

- `command-surface`: `next` and `bay` gain `--markdown` and reject it alongside `--json`. The
  verbatim-rendering requirement now names the markdown form the session-facing commands request.
  `new`'s session surface runs only the leg command, and its terminal block is no longer frozen to
  the pre-change trunk output.

## Impact

- **Code**: `src/waybill.js` (NEXT block, new markdown renderer, bare `cd` command), `src/cli.js` (flag
  parsing on `next` and `bay`, conflict check, USAGE row, `bay`'s markdown heading).
- **Command files**: `commands/next.md`, `commands/bay.md`, `commands/new.md`.
- **Tests and goldens**: every booked-leg `.txt` golden is regenerated. New `.md` goldens for every
  booked leg plus the IN BAY and findings cases. Shape assertions change in `tests/waybill.test.js`,
  `tests/cli.test.js`, `tests/commands.test.js`, `tests/booking-swap.test.js` and
  `tests/bookings-overlay.test.js`. `select`, `status`, `fleet`, `fleet-empty` and `complete`
  goldens must stay byte-identical.
- **Docs**: `README.md`.
- **Unchanged**: `--json` output, the inferred state, bookings, the fleet and `status`.
- **Coordination**: the in-flight `ideation/waybill-help` branch edits `src/cli.js` USAGE,
  `tests/commands.test.js` and `README.md`; whichever branch merges second rebases those three files.
- **Source of truth**: `docs/ideation/paste-ready-waybills/contract.md` and `spec.md`. Acceptance is
  judged by `contract-data.json`.
