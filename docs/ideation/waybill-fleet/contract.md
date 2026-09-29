# Waybill Fleet Contract

**Created**: 2026-09-24
**Readiness**: All 5 gates ready
**Status**: Approved
**Supersedes**: None

## Problem Statement

Waybill's only fleet view today is `waybill status` run from a repository's trunk, which reaches
`renderFleet()` at `src/cli.js:328` and prints one line per docket in that single repository —
`feat/work-laptop-readiness · leg 5 of 7 (specs)`. That is the entire picture. There is no age, no
indication of which docket has stalled, no signal about which is closest to done, no record of which
branches were cut from which, and no visibility whatsoever beyond the current repository.

The operator runs 5–10 dockets at once, spread across several repositories under `~/Projects`. Four
concrete failures follow. Stalled dockets go unnoticed — a branch sits untouched for days and nothing
surfaces it until it is stumbled back into. There is no signal for which docket to advance next, so
selection is guesswork. Branches cut from other branches get merged out of order, producing conflicts
or a broken trunk, because nothing anywhere records that B was stacked on A. And starting the day
means running `status` in each repository in turn, checking git by hand, and reconstructing the whole
picture mentally.

None of this is blocked by missing data. Waybill is stateless by design
(`docs/guide/02-glossary.md:44` — "reads the stamps off the repository every time and keeps no state
file"), and `fleet()` at `src/fleet.js:31` already enumerates every open docket with its branch,
worktree path and resolved leg. Progress exists as leg index/7 for every docket and as done/total
tasks for the execute leg (`src/progress.js:149`). Age and stacking are one git call each. The view
simply has never been written.

## Goals

1. One command, run from any directory, lists every open docket in every git repository at or beneath
   the working directory to a configurable depth defaulting to 4 — missing no repository with an open
   docket, showing no repository without one, and counting a repository exactly once however many of
   its bays fall inside the scan.
2. Every docket row carries three facts absent from any waybill surface today: a progress bar, time
   since the branch opened, and time since it was last touched.
3. Each docket additionally shows its stacked-branch parent where one exists, and whether a tmux pane
   is open on its bay together with what is running there — with all three degrading to blank rather
   than to a false claim when tmux or ps is absent or unreadable.
4. In live mode the first frame paints before the slow lane — openspec task counts and the ps process
   walk — has resolved, targeting 500ms at 10 dockets across 3 repositories; the one-shot path instead
   waits for complete data, because a single frame printed early would omit task counts permanently
   rather than filling them in.
5. In a TTY the view self-updates every ~2s until dismissed with `q`, with `r` forcing an immediate
   repaint and slower data filling in after the first frame; piped or redirected it prints exactly one
   frame and exits 0, so `fleet | grep` and every golden-file test work unchanged.
6. Ships with zero new dependencies, no build step and exactly one package script, leaving the
   zero-dependency assertion at `tests/commands.test.js:540-553` passing without modification.

## Success Criteria

- [ ] Run inside a repository, `fleet` lists that repository's open dockets and no others — check:
      `node --test tests/fleet-dash-cmd.test.js` — exits 0
- [ ] Run outside any repository, `fleet` discovers repositories in subdirectories, halts descent at
      each repository it finds, and aggregates their dockets; `--depth 1` finds a top-level repository
      and misses one nested two levels down — check: `node --test tests/fleet-dash-scan.test.js` — exits 0
- [ ] A repository whose bays sit inside the scan root (the supported `waybill.baydir=..` /
      `WAYBILL_BAY_DIR` sibling layout, `src/repo.js:119-135`) is reported exactly once, deduplicated
      by main checkout — check: `node --test tests/fleet-dash-scan.test.js` — exits 0
- [ ] Bookings are resolved per discovered repository root, so a repository with a `.waybill/bookings`
      overlay reports its own legs — check: `node --test tests/fleet-dash-scan.test.js` — exits 0
- [ ] Repositories with zero open dockets are absent from the body, and a footer reports how many were
      scanned — check: `node --test tests/fleet-dash-scan.test.js` — exits 0
- [ ] The execute leg's openspec task count is off the synchronous path — check:
      `node --test tests/fleet-dash-model.test.js` — exits 0
- [ ] The progress bar renders leg index of 7 with the execute leg's slice filled proportionally by
      done/total, falling back to the whole-leg bar when the count has not arrived — check:
      `node --test tests/fleet-dash-render.test.js` — exits 0
- [ ] Within a repository, dockets are ordered most-idle first, and repositories are grouped rather
      than interleaved — check: `node --test tests/fleet-dash-render.test.js` — exits 0
- [ ] Both age columns are correct: opened from the merge-base commit date, idle from the branch tip's
      committer date — check: `node --test tests/fleet-dash-age.test.js` — exits 0
- [ ] The renderer stays pure and clock-free per `src/waybill.js:286` — check:
      `node --test tests/fleet-dash-render.test.js` — exits 0
- [ ] A branch cut from another open docket is identified as stacked on it and renders nested — check:
      `node --test tests/fleet-dash-deps.test.js` — exits 0
- [ ] A tmux pane is matched by exact `pane_current_path`, never by fuzzy name match — check:
      `node --test tests/fleet-dash-signals.test.js` — exits 0 (tmux stubbed via `stubBin`)
- [ ] Agent detection walks the process tree from `pane_pid`; a known agent is named, any other
      busiest descendant is shown by command, and an absent ps degrades to blank — check:
      `node --test tests/fleet-dash-agent.test.js` — exits 0 (ps stubbed via `stubBin`)
- [ ] With stdout not a TTY the command prints exactly one frame, emits no ANSI escape bytes, and
      exits 0, matching goldens namespaced away from status's existing `tests/golden/fleet.txt` —
      check: `node --test tests/fleet-dash-cmd.test.js` — exits 0
- [ ] In live mode the first frame is written before the slow lane resolves, while the one-shot path
      waits for complete data — check: `node --test tests/fleet-dash-perf.test.js` — exits 0
- [ ] In live mode the view repaints on the injected clock's ~2s tick, `r` forces an immediate repaint,
      and `q` exits 0 restoring cooked mode and the cursor including on SIGINT — check:
      `node --test tests/fleet-dash-live.test.js` — exits 0
- [ ] Every new suite file is registered in the manual barrel `tests/index.js` — check:
      `for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done` — exits 0
- [ ] The mechanically-enforced prose surfaces are updated (`tests/guide.test.js:197` requires every
      `commands/*.md` to appear in `docs/guide/03-reference.md`; `:200-202` the same for every
      `--flag`) — check: `node --test tests/guide.test.js tests/commands.test.js tests/help.test.js` — exits 0
- [ ] `waybill status` behavior is unchanged — check:
      `node --test tests/cli.test.js tests/waybill.test.js tests/fleet.test.js` — exits 0, and
      `git diff --exit-code main -- tests/cli.test.js tests/waybill.test.js tests/fleet.test.js tests/golden/status.txt tests/golden/fleet.txt tests/golden/fleet-empty.txt` — exits 0

## Scope Boundaries

### In Scope

**MVP**

- `waybill fleet` CLI verb wired into `COMMANDS` and `USAGE`, plus `commands/fleet.md`, its entry in
  `DECLARED` at `tests/commands.test.js:32-43`, and its `/waybill:fleet` row in `docs/guide/03-reference.md`
- An OpenSpec change with a MODIFIED `command-surface` requirement admitting the fifth verb, stacked
  on the pending `add-help-card` delta
- Single-repository mode — cwd inside a repo renders that repo's fleet
- Multi-repository scan when cwd is not a repository, `--depth` defaulting to 4, halting descent at
  each repository, deduplicating by main checkout, resolving bookings per discovered repo root
- Execute-leg progress made deferrable so the openspec lookup is off the synchronous critical path
- Repositories with no open dockets hidden, with a scanned-count footer
- Progress bar — leg index/7 with the execute leg interpolated by task done/total when available
- Age columns: opened (merge-base date) and idle (tip committer date), with `now` injected
- Grouping by repository, sorted by staleness within each
- Pure one-shot render on a non-TTY stdout, goldens namespaced `tests/golden/fleet-dash-*.txt`
- `Io` seam extended with TTY detection, clock and stdin injection points

**Full**

- Stacked-branch detection via `git merge-base` between open dockets in the same repository
- tmux pane presence via a single `tmux list-panes -a -F` call matched on exact `pane_current_path`
- Agent detection by descendant-process walk from `pane_pid` using one `ps` call
- Live TTY mode: paint layer with frame diffing, ~2s refresh, progressive fill of slow data
- `q` to quit and `r` to force refresh via raw stdin, restoring cooked mode and cursor on every exit
  path including SIGINT

**Stretch**

- Progress indicator on stderr when a scan exceeds 0.5s, keeping stdout golden-clean

### Out of Scope

- Any change to `waybill status`, including its trunk-side fleet list — explicitly excluded by the
  operator; guarded by asserting its suites and goldens are unchanged rather than by forbidding diffs
- The existing fuzzy tmux name matching in `src/picker.js` and `src/signals.js` — left byte-identical;
  the fleet view adds its own exact-path join rather than unifying the two
- Persisted preferences or any configuration file — every session starts fresh, keeping the
  no-state-file property intact
- Project on/off toggles and the interactive filter/tree mode — cut once cwd-relative auto-detection
  removed the need to select projects by hand
- A selection or cursor model, and acting on a selected docket — interaction is capped at `q` and `r`
- HTML output — waybill prints strings; a generated artifact is stale the moment it is written
- `--json` output from `fleet` — follows the standing rejection at `src/cli.js:305`; `next --json` is
  the machine-readable surface
- Any version bump in `package.json` or `.claude-plugin/plugin.json` — release PRs own versioning
- Windows support for the tmux and ps surfaces — those columns degrade to blank elsewhere

### Future Considerations

- The filter/toggle mode, reintroduced on top of the `q`/`r` raw-stdin machinery once it exists
- Hybrid refresh — `fs.watch` on each `.git` plus a slow interval sweep — if the 2s poll proves too
  costly across many repositories
- A selection cursor plus keys that act on the highlighted docket: attach its tmux window, advance a
  leg, retire a merged docket — the step that would make this a command center rather than a dashboard

## Execution Plan

### Dependency Graph

```
Phase 1: Fleet model, multi-repo discovery, deferrable progress   (blocking)
  ├── Phase 2: Age and stacked-branch dependencies        (blocked by 1)
  └── Phase 3: tmux and agent signals                     (blocked by 1)
        │
        └── Phase 4: Pure renderer, bars, and the fleet verb
              (hard prereq: Phase 2 · SOFT prereq: Phase 3 — columns render blank if 3 is deferred)
                └── Phase 5: Live paint layer             (blocked by 4)
                      └── Phase 6: Human gate — run it against your real ~/Projects
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs
independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/waybill-fleet/contract.md
```

**Or run phases manually** in dependency order:

**Strategy**: Hybrid

1. **Phase 1** — Fleet model, multi-repo discovery, deferrable progress _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-1.md
   ```

2. **Phases 2 & 3** — parallel after Phase 1
   See the agent team prompt below, or run sequentially:

   ```bash
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-2.md
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-3.md
   ```

3. **Phase 4** — Pure renderer, bars, and the fleet verb _(blocked by Phase 2; Phase 3 is soft)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-4.md
   ```

4. **Phase 5** — Live paint layer _(blocked by Phase 4)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-5.md
   ```

5. **Phase 6** — Human gate, no agent _(blocked by Phase 5)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-fleet/spec-phase-6-gate.md
   ```

   This phase is a checklist for a human to run against a real machine. Fixtures cannot verify scan
   depth, dedup, sort order or agent detection against real tmux sessions and a real `~/Projects`.

### Agent Team Prompt

```
Phases 2 (Age and stacked-branch dependencies) and 3 (tmux and agent signals) both depend only on
Phase 1 and are independent of each other — run them in parallel, then converge on Phase 4. Phase 1
must land first; Phase 5 must wait for Phase 4. Phase 3 delivers Full-tier items only and is a SOFT
prereq for Phase 4: if it stalls, Phase 4 proceeds with its tmux and agent columns rendering blank,
which the contract already requires as the degraded behavior.

Coordinate on shared files (Phases 2 and 3 modify all three):
  - src/scan.js     — each phase appends its own decoration step to the per-repo assembly.
                      Append, never restructure.
  - src/fleet.js    — both extend the Docket typedef, which is APPEND-ONLY. Neither may change
                      the fields Phase 1 defined.
  - tests/index.js  — each registers its own suites. Do not reorder or remove the other's lines.
Only one teammate modifies a shared file at a time.

Neither Phase 2 nor Phase 3 may edit src/cli.js, src/help.js, commands/, README.md,
docs/guide/03-reference.md, tests/commands.test.js or openspec/ — those belong to Phase 4.
src/picker.js and src/signals.js are out of scope entirely and must stay byte-identical.
```

---

_This contract was generated from brain dump input. Approved at Full scope on 2026-09-24._
