import { tryGit } from './repo.js';
import { trunkBase } from './age.js';

/**
 * Above this many open dockets in one repository, stacking is skipped for it.
 *
 * Detection is one `merge-base` per ordered pair, so the cost is O(N²) processes: 10 dockets is 90
 * cheap calls, 25 is 600, and past that a scan of somebody's projects tree would visibly stall for
 * an answer nobody can read anyway. The number is a guard against pathology, not a tuning knob.
 */
export const STACK_PAIR_CAP = 25;

/**
 * Whether `ancestor` is reachable from `descendant`.
 *
 * @param {string} repoRoot
 * @param {string} ancestor
 * @param {string} descendant
 * @returns {boolean}
 */
function isAncestor(repoRoot, ancestor, descendant) {
  return tryGit(repoRoot, ['merge-base', '--is-ancestor', ancestor, descendant]) !== null;
}

/**
 * The sibling docket `branch` was cut from, or `null` when it was cut from the trunk.
 *
 * The rule is a merge-base comparison and nothing else — no persisted state, which is what makes
 * dependencies affordable in a tool that keeps none. `branch` is stacked on a sibling when their
 * merge-base is a strict descendant of where `branch` left the trunk: that can only happen if the
 * sibling had already diverged when `branch` was cut from it.
 *
 * Reachability decides it, never dates. A rebase rewrites committer dates wholesale, so a
 * date comparison would report a freshly restacked child as cut from trunk.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} trunk the trunk branch *name*
 * @param {string[]} siblings the other open dockets in this repository; `branch` may be among them
 * @returns {string|null}
 */
export function stackedOn(repoRoot, branch, trunk, siblings) {
  const base = trunkBase(repoRoot, branch, trunk);
  if (base === null) return null;
  const tip = tryGit(repoRoot, ['rev-parse', branch]);
  if (tip === null) return null;

  /** @type {{branch:string, base:string}|null} */
  let nearest = null;
  for (const sibling of siblings) {
    if (sibling === branch) continue;
    const shared = tryGit(repoRoot, ['merge-base', sibling, branch]);
    if (shared === null || shared === base) continue;
    // Everything this docket has is already in the sibling, so it is behind the sibling rather than
    // stacked on it — and two bays cut at the same commit are behind each other, which without this
    // guard is a two-docket cycle the renderer would then have to break.
    if (shared === tip) continue;
    if (!isAncestor(repoRoot, base, shared)) continue;

    // Nearest parent wins, so a three-deep chain reports its immediate parent rather than its root:
    // of two candidates, the one whose merge-base descends from the other is the nearer. Candidates
    // that are incomparable keep the earlier sibling, so the answer does not depend on iteration
    // order beyond the caller's own ordering.
    if (nearest === null || (shared !== nearest.base && isAncestor(repoRoot, nearest.base, shared))) {
      nearest = { branch: sibling, base: shared };
    }
  }
  return nearest === null ? null : nearest.branch;
}

/**
 * Flatten any docket that sits on a parent cycle, in place.
 *
 * Git history is a DAG, so a true cycle cannot arise from {@link stackedOn}'s rule — but the
 * renderer walks this map recursively, and a bug in nearest-parent selection that produced one
 * would hang it rather than misdraw it. The guard is cheap; the failure it prevents is not.
 *
 * @param {Map<string, string|null>} parents branch -> parent branch, mutated where a cycle is cut
 * @returns {string[]} one note per cycle broken, empty for the acyclic forest that is the norm
 */
export function breakCycles(parents) {
  /** @type {string[]} */
  const notes = [];
  /** Branches already known to reach a root, so each chain is walked once. @type {Set<string>} */
  const settled = new Set();

  for (const start of parents.keys()) {
    /** @type {Set<string>} */
    const walked = new Set();
    let current = start;
    while (current !== null && !settled.has(current)) {
      if (walked.has(current)) {
        notes.push(`stacked-branch cycle through ${current}; rendering it unstacked`);
        parents.set(current, null);
        break;
      }
      walked.add(current);
      current = parents.get(current) ?? null;
    }
    for (const branch of walked) settled.add(branch);
  }
  return notes;
}

/**
 * Every docket in one repository resolved to its parent, in one pass.
 *
 * Within a repository only: cross-repo stacking is meaningless, and `siblings` is always drawn from
 * a single fleet.
 *
 * @param {string} repoRoot
 * @param {string[]} branches every open docket's branch, in the fleet's own order
 * @param {string} trunk
 * @param {string[]} warnings collected in place, as the rest of the scan does
 * @returns {Map<string, string|null>} branch -> parent branch, with an entry for every input
 */
export function stackParents(repoRoot, branches, trunk, warnings) {
  if (branches.length > STACK_PAIR_CAP) {
    warnings.push(
      `${repoRoot}: ${branches.length} open dockets is above the cap of ${STACK_PAIR_CAP}; ` +
        'stacked-branch dependencies not computed',
    );
    return new Map(branches.map((branch) => [branch, null]));
  }

  /** @type {Map<string, string|null>} */
  const parents = new Map(branches.map((branch) => [branch, stackedOn(repoRoot, branch, trunk, branches)]));
  for (const note of breakCycles(parents)) warnings.push(`${repoRoot}: ${note}`);
  return parents;
}
