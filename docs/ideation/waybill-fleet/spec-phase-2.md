# Implementation Spec: Waybill Fleet — Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M
**Prerequisite**: Phase 1 (FleetModel exists)
**Parallel with**: Phase 3 — coordinate on `src/fleet.js` and the model typedef; only one of you edits a shared file at a time

## Technical Approach

Phase 2 adds the two git-derived facts the fleet view needs and waybill has never had: how old each
docket is, and which dockets are stacked on which. Both are pure git, no rendering, no terminal.

**Age is two numbers, not one.** *Opened* is the commit date of the merge-base between the docket's
branch and its trunk — how long this line of work has existed. *Idle* is the committer date of the
branch tip — how long since anyone touched it. The interview picked both because they answer
different questions: opened is cycle time, idle is the neglect alarm that drives the default sort.

**Stacking is a merge-base comparison between open dockets in the same repository.** Branch B is
stacked on A when B's merge-base with A is strictly newer than B's merge-base with trunk — meaning B
was cut from A after A had already diverged. This is the whole dependency model; it needs no
persisted state, which is precisely what makes it acceptable in a tool that keeps none.

The performance shape matters. Tips come from **one batched call per repository** —
`git for-each-ref --format='%(refname:short)%09%(committerdate:unix)' refs/heads` — not one call per
branch. Merge-bases cannot be batched, so they cost one `git merge-base` per docket for the trunk
comparison plus one per ordered pair for stacking. At the stated 5–10 dockets, spread across
repositories, the pair count is small; the spec caps it anyway.

Critically, **no clock enters this phase's output**. The model records absolute Unix timestamps.
Converting a timestamp into "4d" is the renderer's job in Phase 4, using its injected `now`. This is
what keeps `src/waybill.js:286`'s purity contract intact and the golden files byte-stable.

## Feedback Strategy

**Inner-loop command**: `node --test tests/fleet-dash-age.test.js`

**Playground**: `tests/helpers/repo-fixture.js` — `createRepo` (`:70`), `addWorktree` (`:121`), and the
`git` helper (`:1`) for committing at controlled dates via `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`.

**Why this approach**: Both features are deterministic functions of git history, so a fixture repo
built with fixed commit dates gives exact, reproducible expected values — no tolerance windows, no
flake.

## File Changes

### New Files

| File Path                       | Purpose                                                                 |
| ------------------------------- | ------------------------------------------------------------------------ |
| `src/age.js`                    | Batched branch-tip dates and per-docket merge-base dates                |
| `src/stack.js`                  | Stacked-parent detection between open dockets in one repository         |
| `tests/fleet-dash-age.test.js`  | Opened/idle correctness, missing-data degradation                       |
| `tests/fleet-dash-deps.test.js` | Stacked-parent detection, chains, cycles, cross-repo isolation          |

### Modified Files

| File Path        | Changes                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `src/scan.js`    | After assembling each `RepoFleet`, decorate its dockets with `openedAt`/`idleAt` and `stackedOn`         |
| `src/fleet.js`   | Extend the `Docket` typedef with the three new optional fields (append-only; Phase 3 adds more)          |
| `tests/index.js` | Register `./fleet-dash-age.test.js` and `./fleet-dash-deps.test.js`                                      |

### Deleted Files

None.

## Implementation Details

### Branch ages

**Pattern to follow**: `src/repo.js:71-89` — `spawnSync` with a porcelain/format string, tab-split
parsing, `null` on failure.

**Overview**: One batched call per repository yields every branch tip's committer date; one
`merge-base` per docket yields its opened date.

```js
/** @typedef {{openedAt:number|null, idleAt:number|null}} DocketAge */

/** One call per repo. @returns {Map<string, number>} branch -> unix seconds */
export function branchTips(repoRoot) {}

/** One call per docket. @returns {number|null} unix seconds of the merge-base commit */
export function openedAt(repoRoot, branch, trunk) {}
```

**Key decisions**:

- **Unix seconds, not Date objects or formatted strings.** The model stays serialisable and
  clock-free; formatting is Phase 4's problem.
- **Committer date, not author date.** Author date survives rebases and cherry-picks, so it would
  report a rebased branch as stale when it was touched minutes ago. Committer date is the honest
  "when was this last worked on".
- **Batch the tips, accept the per-docket merge-base.** `for-each-ref` covers every branch in one
  process; `merge-base` takes exactly two commits and cannot be batched. One process per docket at
  5–10 dockets is well under the budget.
- **`null` degrades, never throws.** An orphan branch with no merge-base against trunk, or a
  corrupted ref, yields `null`, and the renderer prints a dash.

**Implementation steps**:

1. Write `tests/fleet-dash-age.test.js` with a failing test: a repo whose docket branched at a known
   timestamp and last committed at another reports exactly those two values.
2. Implement `branchTips` with the batched `for-each-ref` and tab-split parsing.
3. Implement `openedAt` via `git merge-base <trunk> <branch>` then
   `git show -s --format=%ct <sha>`, or the single-call `git log -1 --format=%ct $(git merge-base …)`
   equivalent — measure and prefer the single call.
4. Decorate dockets in `src/scan.js` after the `RepoFleet` is assembled.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-age.test.js` with fixture commits at pinned dates via
  `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE`.
- **Experiment**: Build a repo with trunk commits at T0 and T3; a docket branched at T1 with its last
  commit at T2; a second docket branched at T3 with no commits of its own. Assert exact `openedAt`
  and `idleAt` for both, then assert a rebased branch reports the rebase time as `idleAt` and its
  original divergence as `openedAt`.
- **Check command**: `node --test tests/fleet-dash-age.test.js`

### Stacked-branch detection

**Pattern to follow**: `src/fleet.js:31-55` for iterating dockets within one repository.

**Overview**: For each ordered pair of open dockets in a repository, decide whether one was cut from
the other rather than from trunk.

```js
/** @returns {string|null} the branch this docket is stacked on, or null for trunk-cut */
export function stackedOn(repoRoot, branch, trunk, siblings) {}
```

The rule: B is stacked on A when `merge-base(B, A)` is a strict descendant of `merge-base(B, trunk)`.
Equivalently, `merge-base(B, trunk) !== merge-base(B, A)` and `merge-base(B, A)` is reachable from
`merge-base(B, trunk)`. Use `git merge-base --is-ancestor` for the reachability test rather than
comparing dates — dates lie after a rebase.

**Key decisions**:

- **Nearest parent wins.** If B is stacked on both A and C (because C is itself stacked on A), B's
  parent is whichever merge-base is newest — the nearest ancestor. This produces a tree, not a mesh.
- **Cycles are impossible but assert anyway.** Git history is a DAG so a true cycle cannot occur, but
  a bug in nearest-parent selection could produce one. The renderer must not infinitely recurse, so
  detect and break with the docket rendered flat.
- **Within a repository only.** Cross-repo stacking is meaningless; siblings are always drawn from
  the same `RepoFleet`.
- **Cap the pair count.** With N dockets this is O(N²) merge-base calls. At N ≤ 10 that is ≤ 90
  cheap calls. Above a threshold (say 25), skip stacking entirely for that repo and record a warning
  rather than stalling the scan.

**Implementation steps**:

1. Write `tests/fleet-dash-deps.test.js` with a failing test: a repo with trunk, A cut from trunk, and
   B cut from A reports `stackedOn: 'A'` for B and `null` for A.
2. Implement pairwise `merge-base` plus the `--is-ancestor` reachability test.
3. Add nearest-parent selection for a three-deep chain.
4. Add the cycle guard and the pair-count cap.
5. Decorate dockets in `src/scan.js`.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-deps.test.js` with fixture repos built by `createRepo` +
  `addWorktree`.
- **Experiment**: Four shapes in one fixture set — (a) two independent trunk-cut dockets, both
  `null`; (b) B cut from A, B → A; (c) a three-deep chain A→B→C where C reports B, not A; (d) B cut
  from A, then A rebased onto a newer trunk, which must still report B → A because reachability, not
  dates, decides it.
- **Check command**: `node --test tests/fleet-dash-deps.test.js`

## Data Model

Append-only additions to the `Docket` typedef. Phase 3 appends further fields; neither phase may
change what Phase 1 defined.

```js
/** @typedef {{
 *   branch: string,          // Phase 1
 *   path: string,            // Phase 1
 *   state: Inference,        // Phase 1
 *   openedAt?: number|null,  // Phase 2 — unix seconds of the merge-base commit with trunk
 *   idleAt?: number|null,    // Phase 2 — unix seconds of the branch tip's committer date
 *   stackedOn?: string|null  // Phase 2 — sibling branch name, or null when cut from trunk
 * }} Docket */
```

## Testing Requirements

### Unit Tests

| Test File                       | Coverage                                                    |
| ------------------------------- | ------------------------------------------------------------ |
| `tests/fleet-dash-age.test.js`  | `branchTips` batching, `openedAt`, rebase behavior, `null` paths |
| `tests/fleet-dash-deps.test.js` | Pairwise detection, chains, nearest-parent, cycle guard, cap |

**Key test cases**:

- Opened and idle report the exact pinned fixture timestamps.
- A branch with no commits of its own has `idleAt` equal to its merge-base commit's date.
- A rebased branch reports the rebase time as idle, not the original commit time.
- An orphan branch with no merge-base against trunk yields `openedAt: null` and does not throw.
- Two trunk-cut dockets both report `stackedOn: null`.
- B cut from A reports `stackedOn: 'A'`.
- In a three-deep chain, C reports B — the nearest parent, not the root.
- Stacking survives A being rebased (reachability, not dates).
- Dockets in different repositories never stack on each other.
- A repo above the pair-count cap skips stacking and records a warning rather than stalling.

### Manual Testing

- [ ] Run against a real repo with a genuinely stacked branch and confirm the parent is right.

## Error Handling

| Error Scenario                          | Handling Strategy                                             |
| ---------------------------------------- | -------------------------------------------------------------- |
| `for-each-ref` fails                     | All tips `null`; idle column renders as a dash                 |
| `merge-base` finds no common ancestor    | `openedAt: null`, `stackedOn: null`; docket renders unstacked  |
| Branch tip is unreadable or ref is broken | Treat as `null`; do not drop the docket from the fleet         |
| Pair count above the cap                 | Skip stacking for that repo, add a warning to the model        |
| Detected parent cycle                    | Break the cycle, render both dockets flat, add a warning       |

## Failure Modes

| Component | Failure Mode                        | Trigger                                  | Impact                                          | Mitigation                                        |
| --------- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Age       | Rebase reads as stale               | Author date used instead of committer    | A branch touched minutes ago shows as days idle  | Committer date; explicit rebase test case         |
| Age       | Clock leaks into the model          | Formatting "4d" during collection        | Goldens become time-dependent and fail overnight | Store unix seconds only; formatting is Phase 4    |
| Age       | Timezone skew                       | Local-time formats instead of `%(…:unix)` | Off-by-hours ages near midnight                 | Unix seconds everywhere; never parse a local date |
| Stacking  | O(N²) stall                         | A repo with many open dockets            | Scan takes seconds per repo                      | Pair-count cap with a warning                     |
| Stacking  | Wrong parent in a chain             | Root chosen instead of nearest ancestor  | Merge order advice is wrong — the thing it exists to fix | Nearest-parent by reachability; chain test case |
| Stacking  | Infinite recursion while rendering  | A bug produces a parent cycle            | Renderer hangs or blows the stack                | Cycle guard in detection, flat fallback           |

## Validation Commands

```bash
# Scoped inner loop
node --test tests/fleet-dash-age.test.js
node --test tests/fleet-dash-deps.test.js

# Phase 1 still intact
node --test tests/fleet-dash-scan.test.js tests/fleet-dash-model.test.js

# Nothing in the status surface moved
node --test tests/cli.test.js tests/waybill.test.js tests/fleet.test.js

# Barrel registration
for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done

# Whole suite
node --test tests/
```

## Open Items

- [ ] Decide the pair-count cap threshold. 25 dockets in one repository is the working proposal;
      confirm against what the operator actually sees before hardcoding it.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
