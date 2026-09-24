## Why

Waybill's only fleet view is `waybill status` run from a repository's trunk, which prints one line
per docket in that one repository. There is no age, no signal for which docket has stalled, no record
of which branch was cut from which, and no visibility past the current checkout. The operator runs
5–10 dockets across several repositories, so starting the day means running `status` in each one in
turn and reconstructing the picture by hand.

Source: the approved contract and specs in `docs/ideation/waybill-fleet/`. Phases 1–3 landed the
model — multi-repository discovery, deferrable execute progress, the two age columns, stacked-branch
detection, and the tmux/`ps` signals. This change is the surface that renders it.

It stacks on `add-help-card`, which is still unarchived. That change already reworded the
`command-surface` requirement from "exactly four verbs" to "four verbs plus one reference command";
this one builds on that text rather than on the living spec, so the two do not conflict at archive
time.

**Archive `add-help-card` first.** Until it lands, `openspec validate --strict` reports that an
archive would refuse the MODIFIED `The usage lists every command, and grows by one row`, because
that requirement is `add-help-card`'s own ADDED one and is not in the living spec yet. The
`Four verbs` → `Five verbs` rename is written as a `RENAMED` pair for the same reason: the living
spec still carries the four-verb header, and a MODIFIED under the new name alone would match
nothing.

## What Changes

- Add a `waybill fleet` subcommand: every open docket in every git repository at or below the working
  directory, grouped by repository, ordered by neglect, with a progress bar, an opened age, an idle
  age, stacked branches nested under the one they were cut from, and the tmux pane sitting in each
  bay together with what is running in it.
- `fleet` answers outside a repository, which only `help` does today. Inside a checkout it reports
  that repository alone.
- `--depth <n>` bounds the search, defaulting to 4. A non-integer, or anything below 1, exits 2
  naming the flag.
- The frame is produced by a pure renderer, `renderFleetDashboard(model, now)` in `src/fleet-dash.js`:
  no filesystem, no subprocess, and no clock, with `now` passed in. That is what makes a golden file
  of a frame stable overnight, and what lets a later live-repaint mode reuse it unchanged.
- A column whose source could not be read is omitted from every row rather than printed empty. An
  empty cell claims "we looked and there is nothing"; an unreadable `tmux` or `ps` has made no such
  claim.
- Extend the `Io` bag `run` passes to handlers with `isTTY`, `now` and `stdin`. Only `now` is acted
  on here; the other two are the injection points the live mode needs.
- Add `commands/fleet.md`, a verbatim-and-stop passthrough modelled on `commands/status.md` that
  declares no model or effort, plus its `DECLARED` entry and its row in the guide reference.
- Nothing about `waybill status` changes, including its trunk-side fleet listing. The new renderer
  deliberately shares no layout with `renderFleet`.

## Capabilities

### Modified Capabilities

- `command-surface`: the requirement `add-help-card` reworded to "four verbs plus one reference
  command" becomes five verbs plus one reference command, with the boundary between `status` and
  `fleet` stated — `status` answers for one repository, `fleet` for every repository at or below the
  working directory. The usage requirement gains the rule that a subcommand's own options are listed
  in the Options block.

## Impact

- **New files**: `src/fleet-dash.js`, `commands/fleet.md`, `tests/fleet-dash-render.test.js`,
  `tests/fleet-dash-cmd.test.js`, and the `tests/golden/fleet-dash-*.txt` frames — namespaced away
  from `status`'s existing `tests/golden/fleet.txt`.
- **Modified files**:
  - `src/cli.js`: the `fleet` handler, a `COMMANDS` entry, one `USAGE` row, the `--depth` option, and
    the widened `Io` typedef.
  - `src/help.js`: one row in the card's COMMANDS block, and "four verbs" becomes "five".
  - `tests/commands.test.js`: `DECLARED` gains `'fleet.md'`.
  - `tests/bang-lines.test.js`: the pinned list of commands that shell out to the CLI gains
    `'fleet.md'`, plus the two cases that cover it.
  - `tests/help.test.js`: the usage pin admits the appended row and the `--depth` option.
  - `tests/index.js`: registers the two new suites.
  - `README.md`, `docs/guide/03-reference.md`: the command tables, the flag table, and the
    installed-commands sentence.
- **Dependencies**: none added. `package.json` stays at zero dependencies and one script.
- **Stateful surfaces**: `new`, `bay`, `next`, `status` and `help` behave exactly as before, apart
  from the one reworded line on the help card and in the usage.
