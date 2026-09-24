# Implementation Spec: Waybill Fleet — Phase 3

**Contract**: ./contract.md
**Estimated Effort**: M
**Prerequisite**: Phase 1 (FleetModel exists)
**Parallel with**: Phase 2 — coordinate on `src/fleet.js` and the model typedef; only one of you edits a shared file at a time
**Risk**: High — both data sources are environment-dependent

## Technical Approach

Phase 3 answers, per docket: is a tmux pane sitting in this bay, and is something running in it?
Both facts come from outside git, which is what makes this the riskiest phase and why the contract
requires both to **degrade to blank rather than to a false claim**. A dashboard that says "no agent
running" when one is, or names an agent that isn't, is worse than a dashboard that says nothing.

**The tmux join is exact, and that is the whole point.** Waybill already reads tmux, but only for the
*current* pane and only by fuzzy name matching: `src/signals.js:182-186` runs
`tmux display-message -p` against `$TMUX_PANE` for `#{session_name}`, `#{window_name}`,
`#{pane_title}`, and `src/picker.js:100` matches those strings against branch-name spellings. That
heuristic is so unreliable the repo maintains a 47-entry denylist for it (`src/picker.js:70-75`) and
its own comments call pane title "the weakest of the three" (`src/signals.js:20-22`). The fleet view
does not need any of that, because it has something better: every docket already carries its worktree
`path` (`src/fleet.js:50`). One `tmux list-panes -a -F` with `#{pane_current_path}` gives an exact
path match for the entire fleet in a single call. **This is a second, independent integration — the
existing picker/signals matching is explicitly out of scope and must not be touched.**

**Agent detection needs a process-tree walk, not a command string.** `#{pane_current_command}` reports
the pane's foreground process, which for Claude Code launched from a shell is `node` — and `node`,
`claude`, `codex`, and `aider` are *already* in the denylist precisely because they are useless as
signals. The honest answer is to take `#{pane_pid}` from the same tmux call, take one
`ps -eo pid,ppid,comm,args` snapshot of the machine, build a pid→children index, and walk down from
each pane's pid looking for a known agent binary. One `ps` for the whole fleet, regardless of docket
count.

The output has two tiers, per the interview: a **known agent is named**, and anything else shows the
busiest non-shell descendant by command. That second tier is what distinguishes "a long test run is
happening here" from "this pane is idle", and both are useful.

## Feedback Strategy

**Inner-loop command**: `node --test tests/fleet-dash-signals.test.js`

**Playground**: `stubBin` from `tests/helpers/repo-fixture.js:149`, which shadows a binary on `PATH`
with a script. Both `tmux` and `ps` are stubbed to emit fixed fixture output, so every case — including
"tmux absent", "tmux errors", "ps truncated" — is reproducible without a real tmux server.

**Why this approach**: These are the two least testable surfaces in the project, and the existing
`stubBin` harness turns them into pure string-parsing problems. Anything not stubbed is untestable and
will rot.

## File Changes

### New Files

| File Path                          | Purpose                                                              |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `src/panes.js`                     | One `tmux list-panes -a -F` call, parsed; exact path→pane join        |
| `src/procs.js`                     | One `ps` snapshot, pid→children index, descendant walk, agent naming  |
| `tests/fleet-dash-signals.test.js` | Pane parsing, exact path matching, absent/broken tmux                 |
| `tests/fleet-dash-agent.test.js`   | Process-tree walk, agent naming, busiest-descendant fallback, degradation |

### Modified Files

| File Path        | Changes                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `src/scan.js`    | Decorate dockets with `pane` and `activity` after the `RepoFleet` is assembled                 |
| `src/fleet.js`   | Extend the `Docket` typedef with `pane` and `activity` (append-only; Phase 2 adds its own)     |
| `tests/index.js` | Register `./fleet-dash-signals.test.js` and `./fleet-dash-agent.test.js`                       |

### Deleted Files

None. **`src/signals.js` and `src/picker.js` are not modified** — see Out of Scope in the contract.

## Implementation Details

### Pane discovery and the exact-path join

**Pattern to follow**: `src/signals.js:179-190` for the spawn/guard/timeout/parse shape — reuse the
structure, not the data.

**Overview**: One tmux call lists every pane on the machine with the fields the fleet needs; dockets
join to panes on exact worktree path.

```js
/** @typedef {{
 *   session: string, windowIndex: string, windowName: string,
 *   paneId: string, panePid: number, paneCurrentPath: string, paneCurrentCommand: string
 * }} Pane */

/** @returns {Pane[]} empty array when tmux is absent or fails — never null-and-throw */
export function listPanes(env) {}

/** @returns {Map<string, Pane>} realpath -> pane */
export function panesByPath(panes) {}
```

Call shape:

```
tmux list-panes -a -F '#{session_name}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_pid}\t#{pane_current_path}\t#{pane_current_command}'
```

**Key decisions**:

- **`-a` (all sessions), not the current pane.** The fleet spans everything running on the machine;
  `$TMUX_PANE` is irrelevant here and must not be used.
- **No `env.TMUX` guard.** `src/signals.js:180` returns early when `$TMUX` is unset because it asks
  about the *current* pane. The fleet view asks about the *server*, which is worth querying even when
  waybill itself is running outside tmux. An absent server simply yields an empty list.
- **Compare realpaths.** A bay reached through a symlinked home directory has a different literal
  path than `git worktree list` reports. Resolve both sides with `fs.realpathSync` before comparing,
  and tolerate a trailing-slash difference.
- **Exact match only — never fall back to fuzzy.** If the path does not match, the docket has no
  pane. Guessing from a window name is what the existing picker does, and reproducing it here would
  reintroduce the false positives the denylist exists to suppress.
- **Timeout and failure are non-events.** Reuse the 1000ms timeout constant's spirit
  (`src/signals.js:44`); a non-zero exit, a missing binary, or a timeout yields `[]`.

**Implementation steps**:

1. Write `tests/fleet-dash-signals.test.js` with a failing test that stubs `tmux` to emit two
   tab-separated pane rows and asserts both parse.
2. Implement `listPanes` with the spawn, timeout, and empty-on-failure contract.
3. Implement `panesByPath` with realpath normalisation.
4. Join in `src/scan.js`; dockets with no pane get `pane: null`.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-signals.test.js` with `stubBin('tmux', script)`.
- **Experiment**: Stub five scenarios — (a) two panes, one matching a docket's bay exactly; (b) a pane
  whose path is the bay reached via a symlink; (c) a pane whose *window name* matches a branch but
  whose path does not, which must NOT match; (d) tmux exits non-zero; (e) tmux is absent from `PATH`.
  Assert exact joins for (a) and (b), no join for (c), and empty-not-throw for (d) and (e).
- **Check command**: `node --test tests/fleet-dash-signals.test.js`

### Process-tree agent detection

**Overview**: One `ps` snapshot per invocation, indexed by parent pid, walked downward from each
pane's pid.

```js
/** @typedef {{pid:number, ppid:number, comm:string, args:string}} Proc */
/** @typedef {{kind:'agent', name:string} | {kind:'busy', command:string} | null} Activity */

/** @returns {Proc[]} empty array on any failure */
export function snapshot() {}

/** @returns {Activity} */
export function activityFor(panePid, index) {}

export const KNOWN_AGENTS = ['claude', 'codex', 'aider', 'cursor-agent', 'gemini', 'opencode'];
```

Call shape: `ps -eo pid=,ppid=,comm=,args=` — no header, parsed positionally with `args` taking the
remainder of the line.

**Key decisions**:

- **One `ps` for the machine, not one per pane.** Cost is constant in docket count.
- **Match on the basename of `comm`, and on argv[0]'s basename from `args`.** A Claude Code process
  may appear as `node` in `comm` with the real entry point in `args`; checking both catches it.
  Never match on a substring of the whole `args` string — a shell running
  `grep claude somefile` would false-positive.
- **Skip shells when choosing the busiest descendant.** `zsh`, `bash`, `sh`, `fish` and the pane's own
  pid are not activity. If every descendant is a shell, the pane is idle and `activity` is `null`.
- **Depth-bounded walk.** Cap descent (say 8 levels) so a pathological process tree cannot stall the
  scan.
- **Agents win over busy.** If a known agent appears anywhere in the subtree, report it, even if a
  noisier process is deeper.
- **`ps` unavailable means blank, not "idle".** The renderer must distinguish "we looked and nothing
  was running" from "we could not look". Return `null` for both but record a model-level flag so the
  column header can be omitted entirely when `ps` failed.

**Implementation steps**:

1. Write `tests/fleet-dash-agent.test.js` with a failing test: a stubbed `ps` tree where pid 100 is a
   pane shell and pid 101 is `claude` under it reports `{kind:'agent', name:'claude'}`.
2. Implement `snapshot` with positional parsing and empty-on-failure.
3. Build the pid→children index and the bounded walk.
4. Add known-agent matching on both `comm` and argv[0] basenames.
5. Add the busiest-descendant fallback with shell filtering.
6. Join in `src/scan.js`.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-agent.test.js` with `stubBin('ps', script)` emitting a fixed tree.
- **Experiment**: Six trees — (a) shell only → `null`; (b) shell → `claude` → agent; (c) shell →
  `node` whose args are a Claude entry point → agent; (d) shell → `npm` → `node` running tests →
  `{kind:'busy'}`; (e) a shell running `grep claude foo.txt` → must NOT report an agent; (f) `ps`
  absent → `null` plus the unavailable flag.
- **Check command**: `node --test tests/fleet-dash-agent.test.js`

## Data Model

Append-only additions to `Docket`, plus one model-level flag.

```js
/** @typedef {{
 *   ...,                  // Phases 1 and 2
 *   pane?: {session:string, windowIndex:string, windowName:string}|null,
 *   activity?: Activity   // {kind:'agent',name} | {kind:'busy',command} | null
 * }} Docket */

/** @typedef {{
 *   ...,                       // Phase 1
 *   tmuxAvailable?: boolean,   // false when the tmux call failed or found no server
 *   psAvailable?: boolean      // false when ps could not be read
 * }} FleetModel */
```

## Testing Requirements

### Unit Tests

| Test File                          | Coverage                                                     |
| ---------------------------------- | -------------------------------------------------------------- |
| `tests/fleet-dash-signals.test.js` | Pane parsing, exact/realpath join, name-match rejection, failure |
| `tests/fleet-dash-agent.test.js`   | Tree index, bounded walk, agent naming, busy fallback, failure |

**Key test cases**:

- Two panes parse; the one whose `pane_current_path` equals a docket's bay joins to it.
- A bay reached via symlink still joins after realpath normalisation.
- A pane whose window name matches the branch but whose path does not produces **no** join.
- Absent tmux, non-zero tmux, and a tmux timeout each yield an empty pane list and `tmuxAvailable: false`.
- A pane with only a shell descendant reports `null` activity.
- A `claude` descendant is reported as an agent.
- A `node` descendant whose argv[0] basename is a known agent is reported as an agent.
- A shell running `grep claude foo.txt` is **not** reported as an agent.
- A long `npm test` run is reported as `{kind:'busy'}`.
- Absent `ps` yields `null` activity plus `psAvailable: false`.
- A process tree 20 levels deep terminates at the depth cap.

### Manual Testing

- [ ] With a real Claude Code session open in a bay, confirm it is detected and named.
- [ ] With a plain shell in a bay, confirm it reports idle, not a false agent.
- [ ] Outside tmux entirely, confirm the columns are blank and nothing errors.

## Error Handling

| Error Scenario                          | Handling Strategy                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| tmux binary absent                       | Empty pane list, `tmuxAvailable: false`, columns omitted                |
| tmux server not running                  | Same as absent — empty list, no error                                   |
| tmux call times out                      | Empty list; never block the scan on it                                  |
| `pane_current_path` is a deleted directory | `realpathSync` throws — catch per pane, skip that pane, keep the rest   |
| `ps` absent or denied                    | Empty snapshot, `psAvailable: false`, activity column omitted           |
| `ps` output truncated mid-line           | Drop the unparseable line, keep the rest                                |
| Pane pid no longer exists                | No descendants found → `null` activity; correct, not an error           |

## Failure Modes

| Component | Failure Mode                          | Trigger                                          | Impact                                                  | Mitigation                                                     |
| --------- | ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Panes     | False join by name                    | Fuzzy fallback reintroduced "to be helpful"       | Wrong bay attributed to a pane — the exact bug the picker denylist exists for | Exact path only; explicit test that a name match does not join |
| Panes     | Missed join through a symlink         | Bay under a symlinked `$HOME`                     | Pane column blank when a pane is genuinely open           | `realpathSync` both sides; symlink fixture case                  |
| Panes     | Stale pane data                       | Pane closed between the tmux call and the render  | Shows a pane that just closed                             | Accept — refreshed within one live tick                          |
| Procs     | `node` reported as an agent           | Matching `comm` alone                             | Every shell running any node tool looks like an agent     | Match agent basenames on `comm` AND argv[0]; explicit test        |
| Procs     | `grep claude` false positive          | Substring match against whole `args`              | Confident wrong claim about what is running               | Basename-only matching; dedicated test case                       |
| Procs     | "No agent" vs "could not look" conflated | `ps` failure rendered as idle                  | Operator trusts an absence that was never checked         | `psAvailable` flag; omit the column instead of printing blank     |
| Procs     | Walk stalls                           | Pathological or cyclic-looking process tree       | Scan hangs                                                | Depth cap plus a visited-pid set                                  |

## Validation Commands

```bash
# Scoped inner loop
node --test tests/fleet-dash-signals.test.js
node --test tests/fleet-dash-agent.test.js

# The existing fuzzy matching must be untouched
node --test tests/picker.test.js tests/signals.test.js
git diff --exit-code main -- src/picker.js src/signals.js

# Phase 1 still intact
node --test tests/fleet-dash-scan.test.js tests/fleet-dash-model.test.js

# Barrel registration
for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done

# Whole suite
node --test tests/
```

## Open Items

- [ ] Confirm the `KNOWN_AGENTS` list against what the operator actually runs. The initial list is a
      guess extrapolated from the existing denylist at `src/picker.js:70-75`.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
