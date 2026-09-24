## 1. Failing tests first (red)

- [x] 1.1 Add `'fleet.md'` to `DECLARED` in `tests/commands.test.js` and watch
  `agrees with the declared set in both directions` fail. That is the red step for the wiring.
- [x] 1.2 Create `tests/fleet-dash-render.test.js` covering purity, the bar's leg fill and its
  execute interpolation, the `m/h/d/w` age ladder at each boundary, grouping, the staleness sort,
  stacked nesting in dependency order, cycles, column omission, truncation, and the two goldens.
  Register it in `tests/index.js`.
- [x] 1.3 Create `tests/fleet-dash-cmd.test.js` covering verb dispatch, `--depth`, argument
  rejection, the single non-TTY frame, and the CLI goldens. Register it in `tests/index.js`.

## 2. The pure renderer

- [x] 2.1 Add `src/fleet-dash.js` exporting `renderFleetDashboard(model, now)`, `bar` and
  `humanAge`. No `Date.now()` anywhere in the module.
- [x] 2.2 Implement the fixed-width column layout: one header row above the first repository group,
  repositories at one indent, dockets at two, stacked children nested with `└`.
- [x] 2.3 Drive the pane and activity columns off `tmuxAvailable` / `psAvailable`, omitting them
  rather than printing blanks.
- [x] 2.4 Bless the goldens with `UPDATE_GOLDEN=1` and read the diff before committing.

## 3. Verb wiring

- [x] 3.1 Add `commands/fleet.md` with the guarded `!` line, wrapped in
  `2>&1 || echo "waybill: exited $?"`, and add it to the pinned list in `tests/bang-lines.test.js`.
- [x] 3.2 Add the `fleet` handler, its `COMMANDS` entry, its `USAGE` row and the `--depth` option.
  No `repoRoot` gate: the verb answers outside a repository.
- [x] 3.3 Widen the `Io` typedef with `isTTY`, `now` and `stdin`, and default all three in `run`.
- [x] 3.4 Add the help-card row and re-run the `fits one screen` test against `MAX_LINES`.
- [x] 3.5 Add the `/waybill:fleet` row and the `--depth` row to `docs/guide/03-reference.md`, and the
  command-table row and installed-commands sentence to `README.md`.

## 4. Validation

- [x] 4.1 `node --test tests/fleet-dash-render.test.js tests/fleet-dash-cmd.test.js` passes.
- [x] 4.2 `node --test tests/guide.test.js tests/commands.test.js tests/help.test.js
  tests/bang-lines.test.js` passes.
- [x] 4.3 `waybill status` is untouched: `node --test tests/cli.test.js tests/waybill.test.js
  tests/fleet.test.js` passes, and `git diff --exit-code main -- tests/cli.test.js
  tests/waybill.test.js tests/fleet.test.js tests/golden/status.txt tests/golden/fleet.txt
  tests/golden/fleet-empty.txt` exits 0.
- [x] 4.4 `node --test tests/` passes.
- [x] 4.5 `openspec validate add-fleet-verb --strict` passes.
