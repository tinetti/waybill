# Waybill on the Work Laptop Contract

**Created**: 2026-09-22
**Readiness**: All 5 gates ready
**Status**: Approved
**Supersedes**: None

## Problem Statement

Waybill is usable on this laptop today only by accident and only in an old form. Claude Code exposes a plugin's `bin/` directory on PATH, so the `waybill` CLI here resolves to `~/.claude/plugins/cache/tinetti/waybill/0.3.1/bin/waybill` — the CLI is silently version-pinned to whatever plugin build is cached, five minor releases behind the 0.8.0 working tree. That is why this machine offers `/waybill:start` and not `/waybill:new` or `/waybill:bay`, and why `wyb` does not resolve at all: there is no `bin/wyb` file, only a `package.json` bin alias that requires a real `npm link`.

Three documented setup steps were never performed here. `openspec` is not installed, so legs 5 and 6 fall back to parsing `tasks.md` silently (`src/openspec.js:12,31-33`). `~/.claude/commands/spec/` does not exist, so the bare `/spec:propose` and `/spec:apply` those legs emit cannot resolve (`README.md:335-347`). And `glab auth status` returns 401 against gitlab.com while work runs on a self-hosted instance — so the forge CLI is present but points nowhere useful. None of these failures announce themselves.

Nothing on this machine is hostile to waybill. `glab`, `gh`, `jq`, `tmux` and Node 26 are all present; the `ideation` plugin is installed; `/mar`, `/mr-review` and `/cpr` all exist. This is staleness and missed setup, not a corporate-environment problem.

The deeper gap is that the route does not describe how work actually ships here. Waybill's stock route runs execute → cleanup, but work is GitLab and Jira: commit, push, open an MR, get it reviewed, then merge. A route with a hole at the step you repeat most is a route you drift off. And there is no way to discover any of this except by hand — waybill ships no doctor, preflight or setup command (`src/cli.js:588-593`).

## Goals

1. `waybill doctor` exists as both a CLI verb and a slash command, reports every prerequisite and setup gap with the exact remediation command for each, and exits 0 on this machine once setup is complete.
2. This laptop runs the current waybill release with every setup step done: plugin updated off 0.3.1, `wyb` resolving outside the plugin cache, `openspec` installed, `~/.claude/commands/spec/` populated, and `glab` authenticated against the self-hosted work host.
3. Waybill's route carries a stock eighth `review` leg whose done-signal is forge-detecting, so it stamps correctly on GitLab work repos and on waybill's own GitHub repo without either forge CLI being mandatory.
4. The review stamp distinguishes three states, never conflating them: no MR yet, MR open and unreviewed, and the forge CLI present but unusable (401, wrong host, missing binary).
5. The stock route is runnable on a machine with no user-supplied review skill — `/waybill:review` depends on nothing the plugin does not ship.
6. The leg count is derived from `LEGS` everywhere: no test literal, README sample, guide sentence or help card asserts a fixed total.
7. A machine-local overlay at `~/.waybill/bookings` binds review, bay and cleanup to this machine's GitLab and Jira carriers, leaving the personal machine's route untouched, and one real work ticket traverses all eight legs.

## Success Criteria

- [ ] `waybill doctor` exits 0 on this machine, run against the working tree rather than whichever binary PATH resolves — check: `node bin/waybill doctor` — exits 0
- [ ] Doctor exits non-zero and names a remediation command when a prerequisite is missing — check: `node --test tests/doctor.test.js` — exits 0, one case per gap asserting both the non-zero exit and the remediation string
- [ ] An absent bookings overlay is informational, never failing — check: `node --test tests/doctor.test.js` — exits 0, including a case asserting exit 0 with the overlay absent
- [ ] Doctor reports "cannot locate plugin cache" rather than a green check when the cache layout does not match — check: `node --test tests/doctor.test.js` — exits 0, including a `withEnv` case relocating the config dir
- [ ] `commands/doctor.md` ships and is declared — check: `node --test tests/commands.test.js` — exits 0 (`tests/commands.test.js:112` asserts both-directions parity)
- [ ] The full suite passes after every phase; no golden fixture left stale — check: `node --test tests/` — exits 0
- [ ] A stampCmd whose binary is missing produces a visible warning naming the binary — check: `node --test tests/bookings.test.js` — exits 0; `grep -c 'missing binary' tests/bookings.test.js` — at least 1
- [ ] `~` expands in the env tiers and in the `waybill.baydir` git tier — check: `node --test tests/repo.test.js tests/bookings.test.js` — exits 0; `grep -cE 'tilde|expand' tests/repo.test.js tests/bookings.test.js` — each at least 1
- [ ] The leg count is derived from LEGS; bay stays anchor and cleanup stays terminus — check: `node --test tests/legs.test.js tests/inference.test.js` — exits 0
- [ ] No prose surface claims a seven-leg route, in digit or word form — check: `grep -rniE 'of 7|7/7|7[- ]legs|seven[- ]legs?|seven-leg' README.md docs/guide/ src/ commands/ bookings/` — returns no matches
- [ ] `/waybill:review` opens a PR with only `gh`, an MR with only `glab`, warns when neither is present, and reports auth failure distinctly from "no MR yet" — check: `node --test tests/review.test.js` — exits 0, driving all four cases through `stubBin`
- [ ] A `review` scenario fixture exists and the fixture-count invariant holds — check: `node --test tests/inference.test.js` — exits 0
- [ ] With `waybill.bookingsdir` set the route names `/mr-review`, `/mar`, `/ideation:ideation` at specs and `/ideation:execute-spec` at execute; unset, the stock bookings resolve including `/spec:propose` and `/spec:apply` — check: `node --test tests/bookings-overlay.test.js` — exits 0
- [ ] The work route's execute leg does not stamp while any `- [ ]` remains in its phase specs, so specs and execute cannot complete together — check: `node --test tests/bookings-overlay.test.js` — exits 0, asserting `execute` carries a `stampCmd` and `specs` does not
- [ ] The installed plugin reports the eight-leg route before any overlay is written — check: `node ${CLAUDE_PLUGIN_ROOT}/src/cli.js help` — names 8 legs (the exact entry point slash commands run, per `commands/status.md:33`; deliberately not `command -v waybill`, which `npm link` makes ambiguous)
- [ ] `wyb` resolves to the npm-linked working tree — check: `command -v wyb` — prints a path outside `~/.claude/plugins/cache`
- [ ] One real work ticket traverses all eight legs — **judgment call**: at each leg, the waybill named the command you would have reached for anyway

## Scope Boundaries

### In Scope

**MVP**

- Machine setup to a known-good baseline: plugin updated off 0.3.1, `npm link` for `wyb`, `openspec` installed, `~/.claude/commands/spec/` symlinked, `glab` authenticated against the self-hosted work host
- `waybill doctor` — CLI verb plus `/waybill:doctor`, report-only, printing the exact remediation command per failure

**Full**

- Exit 127 from a stampCmd becomes a visible warning naming the missing binary
- `~` expansion in the `WAYBILL_BAY_DIR` / `WAYBILL_BOOKINGS_DIR` env tiers and the `waybill.baydir` git tier
- De-hardcode the leg count; declarative wrapper-stamp pairing; new `tests/legs.test.js`
- Stock eighth `review` leg (`owner: 'booking'`) with a three-state forge-detecting done-signal
- `/waybill:review` wrapper — detect the forge, push, open the PR/MR, hand off
- Cut and publish the release carrying the eight-leg route, then install and confirm it here
- Work bookings overlay at `~/.waybill/bookings`, rebooking five legs: `review` to `/mr-review`, `cleanup` to `/mar`, `bay` to Jira-prefixed branch names, and — because work uses ideation and not OpenSpec — `specs` to `/ideation:ideation` and `execute` to `/ideation:execute-spec`
- A `review` scenario fixture, and the six-hit prose sweep

### Out of Scope

- `after:` frontmatter splicing to add non-stock legs — once `review` ships stock, nothing in scope declares a non-stock leg; building the extension point now means building it with no consumer, on the critical path, against a deliberate invariant
- `waybill doctor --fix` — several remediations mutate state outside any repo
- Generalising the hardcoded `origin` remote — every remote in play is already named origin
- Committing `.waybill/bookings` into work repos — personal tool config does not belong in a corporate repo
- Changing Waybill's *shipped* legs 5 and 6 — the OpenSpec legs stay the stock opinion and this machine keeps `openspec` installed for them; the ideation route is an overlay, not a fork
- Restoring `n of m` progress on an ideation execute leg — the count reads `openspec/changes/` (`src/progress.js:6`); `0 of 0` is accepted, and generalising it is a code change with no consumer until the overlay is in daily use
- A scripted live GitLab dry-run harness — needs a throwaway project, network and real MR creation
- Doctor pre-flighting an overlay's stampCmd binaries — the exit-127 fix already surfaces this at route time

### Future Considerations

- `after:` frontmatter splicing, if and when an overlay genuinely needs a non-stock leg
- Configurable remote name (`src/repo.js:202,306`)
- Squash-merge detection in cleanup (`commands/cleanup.md:52-64`)
- Backing up or versioning the machine-local overlay, untracked by design and lost with the machine
- Bay exclusion via `.git/info/exclude` is per-clone and does not travel between machines (`src/bay.js:88`)

## Execution Plan

### Dependency Graph

```
Phase 1: Machine setup to a known-good baseline  [GATE, blocking]
  │
  │   (independent of 1)
Phase 2: Portability fixes — exit-127 and tilde expansion
  ├── Phase 3: waybill doctor
  └── Phase 4: De-hardcode the leg count  [blocking]
        └── Phase 5: Stock review leg and /waybill:review  [blocking]
              └── Phase 6: Release and install the eight-leg route  [GATE, blocking]
                    │         (also blocked by Phase 1)
                    └── Phase 7: Work overlay and the live run
```

Phases 3 and 4 share only Phase 2 as a blocker and are technically parallelizable, but Phase 3 and Phase 5 collide on `src/help.js`, `tests/golden/help.txt`, `docs/guide/03-reference.md` and the `DECLARED` array in `tests/commands.test.js`. Land order is 3 before 5, and running the chain sequentially avoids a golden re-bless race.

### Execution Steps

**Run the project** (recommended):

```bash
/ideation:autopilot docs/ideation/waybill-work-laptop/contract.md
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Machine setup to a known-good baseline _(gate, blocking — `/plugin` commands and `glab auth` are human steps)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-1.md
   ```

2. **Phase 2** — Portability fixes: exit-127 and tilde expansion

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-2.md
   ```

3. **Phase 3** — waybill doctor _(blocked by Phase 2)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-3.md
   ```

4. **Phase 4** — De-hardcode the leg count _(blocked by Phase 2, blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-4.md
   ```

5. **Phase 5** — Stock review leg and /waybill:review _(blocked by Phase 4, blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-5.md
   ```

6. **Phase 6** — Release and install the eight-leg route _(gate, blocked by Phases 5 and 1)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-6.md
   ```

7. **Phase 7** — Work overlay and the live run _(blocked by Phase 6)_

   ```bash
   /ideation:execute-spec docs/ideation/waybill-work-laptop/spec-phase-7.md
   ```

---

_This contract was generated from brain dump input, revised against three adversarial plan critics, and corrected against seven implementation specs._
