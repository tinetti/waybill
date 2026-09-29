# Implementation Spec: Waybill Fleet — Phase 1

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 1 builds the data layer the other four phases decorate and render. It adds one new module,
`src/scan.js`, which answers a single question: given a working directory, what repositories are in
play and what dockets are open in each? Inside a repository the answer is that repository. Outside
one, it is every repository discovered beneath the cwd to a bounded depth. This is the first waybill
code path that runs with no repository at all, so `repoRoot()` cannot be the gatekeeper it is for
every other verb (`src/cli.js:73`, callers at `:246`, `:321`, `:458`, `:540`).

Three hazards drive the design, all of them discovered during the interview rather than invented
here. First, **bays are repositories too**. A linked worktree has a `.git` *file*, not a directory,
and the supported `waybill.baydir=..` layout (`src/repo.js:119-135`) places bays as siblings of
their main checkout — directly inside a typical scan root. A naive `.git` probe therefore finds the
same project several times and reports its dockets once per bay. Discovery must resolve every hit to
its main checkout and deduplicate on that. Second, **bookings are per-repository**:
`resolveBookings` reads `waybill.bookingsdir` from the given cwd's git config
(`src/bookings.js:114`), and `src/cli.js:324` resolves them exactly once. In multi-repo mode the scan
cwd is outside every repository, so a single resolution would silently apply built-in bookings to a
repository that has an overlay and misreport its legs. Third, **`evaluateBooking` can execute a
subprocess** — a booking's `stampCmd` (`src/bookings.js:318`). A scan of `~/Projects` would otherwise
run every scanned repository's configured stamp commands as a side effect of looking at them.

The fourth piece of this phase is unrelated to discovery but blocks the render phases: **execute-leg
progress must come off the synchronous path**. Today `fleet()` → `resolveLeg()` → `executeProgress()`
shells out to the external `openspec` CLI once per docket with a 2s timeout
(`src/inference.js:117,156` → `src/progress.js:149` → `src/openspec.js`). Ten dockets on the execute
leg is a potential 20s serial stall. Phase 1 introduces a `deferProgress` option that returns the
model without task counts plus the pending lookups as resolvable thunks, so callers choose when — and
whether concurrently — to pay for them.

Everything stays synchronous-by-default and zero-dependency. The deferred lane uses promises only at
the call sites that opt in; `spawnSync` remains the mechanism, wrapped so a batch can be run
concurrently via `Promise.all` over `setImmediate`-scheduled calls.

## Feedback Strategy

**Inner-loop command**: `node --test tests/fleet-dash-scan.test.js`

**Playground**: The existing fake-repo fixture harness, `tests/helpers/repo-fixture.js` — `createRepo`
(`:70`), `addWorktree` (`:121`), `tempRoot` (`:53`), `stubBin` (`:149`), `cleanupAll` (`:270`). It
already neutralises `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` and deletes `WAYBILL_BAY_DIR` at import
(`:15-17`), which is exactly what a discovery test needs so a developer's machine config cannot
decide the result.

**Why this approach**: This phase is pure data logic with no rendered output, so a scoped test file is
the tightest loop available; the fixture harness can build a multi-repo tree on disk in milliseconds.

## File Changes

### New Files

| File Path                          | Purpose                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/scan.js`                      | Repository discovery, dedup by main checkout, per-repo booking resolution, FleetModel assembly |
| `tests/fleet-dash-scan.test.js`    | Discovery, depth, dedup, per-repo bookings, clean-repo filtering                            |
| `tests/fleet-dash-model.test.js`   | FleetModel shape and the deferred-progress lane                                             |

### Modified Files

| File Path            | Changes                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/inference.js`   | `resolveLeg(cwd, bookings, opts)` gains `opts.deferProgress`; when set, `progress` is `null` and a `progressPending` thunk is attached    |
| `src/progress.js`    | Export `executeProgress` in a form callable standalone against a repo root + change id, so the deferred lane can run it later             |
| `src/bookings.js`    | `evaluateBooking(booking, repoRoot, changed, opts)` gains `opts.skipStampCmd`; path-based stamps still evaluate                           |
| `src/fleet.js`       | `fleet(cwd, bookings, opts)` forwards `deferProgress` and `skipStampCmd` to `resolveLeg`                                                  |
| `tests/index.js`     | Register `./fleet-dash-scan.test.js` and `./fleet-dash-model.test.js` — unregistered suites never run on Node 26                          |

### Deleted Files

None.

## Implementation Details

### Repository discovery

**Pattern to follow**: `src/repo.js:71-89` (`listWorktrees`, porcelain parsing) and `src/repo.js:45`
(main checkout resolution).

**Overview**: Walk the directory tree beneath a non-repo cwd, stop descending at every repository
found, and resolve each hit to its main checkout so bays collapse into their parent project.

```js
/** @typedef {{root:string, name:string, bookings:Booking[], dockets:Docket[]}} RepoFleet */
/** @typedef {{repos:RepoFleet[], scanned:number, root:string}} FleetModel */

/** @returns {string[]} deduplicated main-checkout absolute paths */
export function discoverRepos(cwd, { depth = 4 } = {}) {}

/** @returns {FleetModel} */
export function scanFleet(cwd, { depth = 4, deferProgress = false } = {}) {}
```

**Key decisions**:

- **Dedup key is the main checkout, not the discovered path.** A `.git` *file* means a linked
  worktree; resolve it through `git worktree list --porcelain` (first entry is the main checkout,
  `src/repo.js:45`) and key the Set on that. A `.git` *directory* is already a main checkout. This is
  what makes `waybill.baydir=..` safe.
- **Halt descent at a repository.** Once a directory is identified as a repo, do not recurse into it.
  Nested repos beneath a repo are not part of the fleet; submodules are already handled by the
  existing superproject redirect (`src/cli.js:74`).
- **Skip `node_modules` and dot-directories** during the walk, except that a directory's own `.git`
  is what identifies it. Without this the walk is unbounded in practice.
- **Depth counts directory levels below cwd**, so `--depth 1` means immediate children only. Default
  4 covers the `~/Projects/<org>/<repo>` layout this very repo uses with room to spare.
- **Bookings resolve per discovered repo root** via `resolveBookings(repoRoot, KNOWN_LEGS)` — one call
  per repository, never one call for the scan.
- **`skipStampCmd` is on during multi-repo scans.** Executing arbitrary configured commands across
  every project under `~/Projects` as a side effect of *looking* is not acceptable. Path-based stamps
  (`stampedByPath`, `src/bookings.js:221`) still evaluate, so leg inference degrades gracefully rather
  than breaking. Single-repo mode keeps today's behavior and runs `stampCmd`.

**Implementation steps**:

1. Write `tests/fleet-dash-scan.test.js` with a describe block and one failing smoke test that builds
   two repos under a temp root and asserts `discoverRepos` returns both.
2. Implement the bounded walk with the `node_modules`/dot-dir skip and halt-at-repo rule.
3. Add main-checkout resolution and the dedup Set; add the `waybill.baydir=..` fixture case.
4. Add the in-repo short circuit: if `cwd` is inside a repo, return just that main checkout.
5. Assemble `RepoFleet` per root — `resolveBookings` then `fleet()` from that root.
6. Filter out repos with zero dockets, retaining `scanned` as the pre-filter count.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-scan.test.js` using `createRepo`/`addWorktree`/`tempRoot`, with
  `after(cleanupAll)`.
- **Experiment**: A temp root containing (a) a plain repo with one docket, (b) a repo with
  `waybill.baydir=..` and two bays as siblings, (c) a repo with zero dockets, (d) a repo nested two
  levels down, (e) a `node_modules` directory containing a stray `.git`. Assert: 4 repos discovered
  at depth 4, 3 shown, `scanned === 4`; the sibling-bay repo appears exactly once; `--depth 1` misses
  (d); the `node_modules` hit is never visited.
- **Check command**: `node --test tests/fleet-dash-scan.test.js`

### Deferred execute progress

**Pattern to follow**: `src/inference.js:36-37` (the archived-change / `changeId === null` rule) and
`src/openspec.js` (2s timeout, silent fallback).

**Overview**: Split the openspec task-count lookup out of leg resolution so callers decide when to
pay for it, and can pay for all of them concurrently.

```js
/** @typedef {{done:number,total:number,source:'openspec'|'tasks-md',changeId:string|null}} Progress */
/** @typedef {() => Promise<Progress|null>} ProgressPending */

// resolveLeg(cwd, bookings, { deferProgress: true })
//   → Inference with progress:null and progressPending:ProgressPending|null
```

**Key decisions**:

- **The deferred value is a thunk, not a started promise.** Nothing runs until a caller invokes it, so
  the one-shot path can `Promise.all` the batch and the live path can schedule it on the slow lane.
- **Leg inference must not depend on the task count.** It already mostly doesn't — `src/inference.js:36`
  treats `changeId === null` as done-by-stamp. Where the count *is* needed to decide the execute leg's
  done-ness, deferring means the leg resolves as not-done until the count arrives; the renderer shows
  the whole-leg bar in the interim. Confirm this against the existing inference tests.
- **Failures stay silent, as today.** A missing `openspec` binary, a timeout, or a non-zero exit
  resolves to `null`, and the bar falls back to whole-leg. Never surface a stack trace into a
  dashboard row.

**Implementation steps**:

1. Add a failing test in `tests/fleet-dash-model.test.js`: with `deferProgress`, `progress` is `null`
   and `progressPending` is a function; invoking it yields the same value the synchronous path returns.
2. Thread `opts` through `resolveLeg` and `fleet` without changing either default.
3. Extract the standalone progress call in `src/progress.js`.
4. Verify `node --test tests/inference.test.js tests/fleet.test.js` still passes untouched — the
   default path must be byte-identical in behavior.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-model.test.js` with `stubBin` shadowing `openspec` to a script that
  sleeps then emits known JSON.
- **Experiment**: Resolve a docket on the execute leg three ways — synchronous (today's path),
  deferred-then-invoked, and deferred-with-the-stub-failing. Assert the first two produce equal
  `progress`, and the third yields `null` rather than throwing.
- **Check command**: `node --test tests/fleet-dash-model.test.js`

## Data Model

```js
/** @typedef {import('./fleet.js').Docket} Docket */

/** One discovered repository and its open dockets. */
/** @typedef {{
 *   root: string,          // absolute main-checkout path
 *   name: string,          // basename(root), used as the group heading
 *   trunk: string,         // trunk branch name
 *   bookings: Booking[],   // resolved from this root, not the scan cwd
 *   dockets: Docket[]      // open dockets, each carrying branch/path/state
 * }} RepoFleet */

/** The whole scan result. */
/** @typedef {{
 *   root: string,          // the cwd the scan started from
 *   inRepo: boolean,       // true when cwd was inside a repository
 *   scanned: number,       // repos found, BEFORE clean ones are filtered out
 *   repos: RepoFleet[]     // only repos with >=1 open docket
 * }} FleetModel */
```

Phases 2 and 3 decorate `Docket` with additional fields; both must treat `FleetModel` as append-only
and neither may change the shape above.

## Testing Requirements

### Unit Tests

| Test File                        | Coverage                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| `tests/fleet-dash-scan.test.js`  | Discovery, depth bound, halt-at-repo, dedup, per-repo bookings, filter |
| `tests/fleet-dash-model.test.js` | FleetModel shape, deferred progress thunk, failure degradation         |

**Key test cases**:

- Inside a repo, the scan returns exactly that repo regardless of depth.
- Outside a repo, two sibling repos are both found at depth 1.
- A repo nested two levels down is found at depth 4 and missed at depth 1.
- A repo with `waybill.baydir=..` and two sibling bays appears exactly once, with its dockets not
  duplicated.
- A repo with an overlay at `.waybill/bookings` reports the overlay's legs, while a sibling repo
  without one reports built-in legs, in the same scan.
- A repo with zero open dockets is absent from `repos` but counted in `scanned`.
- A `.git` inside `node_modules` is never visited.
- `deferProgress` yields `progress: null` plus a thunk that reproduces the synchronous value.
- A failing/absent `openspec` binary resolves the thunk to `null` without throwing.
- `skipStampCmd` prevents stamp-command execution — assert with a `stubBin` script that writes a
  sentinel file, and check the file does not exist.

### Manual Testing

- [ ] Run the discovery function against the real `~/Projects` and confirm the repo count is right.
- [ ] Confirm no project appears twice, including any with a non-default bay directory.

## Error Handling

| Error Scenario                               | Handling Strategy                                                    |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Unreadable directory during the walk (EACCES) | Skip that subtree silently; a permission-denied dir is not a fleet error |
| Symlink loop in the scan tree                 | Track visited real paths; never follow a symlink back into the tree   |
| `git worktree list` fails for a discovered repo | Drop that repo from the fleet, still count it in `scanned`          |
| `openspec` binary absent or times out         | Thunk resolves `null`; bar degrades to whole-leg                      |
| A repo's bookings overlay is malformed        | Fall back to built-in bookings for that repo only, record a warning   |

## Failure Modes

| Component     | Failure Mode                        | Trigger                                          | Impact                                              | Mitigation                                                       |
| ------------- | ----------------------------------- | ------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- |
| Discovery     | Same project listed once per bay    | `waybill.baydir=..` puts bays in the scan root   | Duplicated dockets, wrong counts, unusable view      | Dedup on main checkout resolved via porcelain; explicit fixture   |
| Discovery     | Unbounded walk                      | Deep tree, `node_modules`, vendored checkouts    | Scan takes minutes; command unusable                 | Depth bound, halt-at-repo, skip `node_modules`/dot-dirs           |
| Discovery     | Empty result reads as "all clean"   | cwd has no repos beneath it at all               | Silent blank output that looks like success          | `scanned` in the footer distinguishes 0-scanned from 0-with-dockets |
| Bookings      | Overlay ignored                     | Bookings resolved once from the scan cwd         | Wrong leg reported for repos with overlays           | Resolve per repo root; fixture with one overlay and one without   |
| Bookings      | Arbitrary command execution         | `stampCmd` runs for every scanned repo           | Side effects across the whole projects tree          | `skipStampCmd` during multi-repo scans; sentinel-file test        |
| Progress lane | Leg misreported while count pending | Execute-leg done-ness depends on the task count  | Docket shows not-done briefly, then corrects         | Accept and document; bar shows whole-leg until the count lands    |
| Progress lane | Thunk invoked twice                 | Live mode refreshes before the first call settles | Duplicate openspec subprocesses per docket          | Memoize the thunk's promise on first invocation                   |

## Validation Commands

```bash
# Scoped inner loop
node --test tests/fleet-dash-scan.test.js
node --test tests/fleet-dash-model.test.js

# Prove the default path is unchanged
node --test tests/inference.test.js tests/fleet.test.js tests/bookings.test.js

# Barrel registration — unregistered suites never run on Node 26
for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done

# Whole suite
node --test tests/
```

## Open Items

- [ ] Confirm whether execute-leg done-ness can be decided without the task count in every case, or
      whether a docket can flip from not-done to done when the deferred count lands. If it can, the
      renderer must tolerate a leg index changing between frames.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
