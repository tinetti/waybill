import { defaultBranch, listWorktrees } from './repo.js';
import { resolveLeg } from './inference.js';

/**
 * @typedef {{branch:string, path:string, state:import('./inference.js').Inference}} Docket
 *   `state` is the whole inference rather than a flattened leg and index, because the fleet view
 *   also renders execute's task progress and attributes each docket's warnings to the branch they
 *   came from — both of which live on the inference and neither of which the caller can rebuild.
 */

/**
 * Every effort in flight, seen from anywhere in the repository.
 *
 * A docket, from outside it, is a bay on disk. That is already the tool's own definition of
 * in-flight — leg 2 makes the bay mandatory, and leg 7 is stamped only once the bay is gone — and
 * it is the definition that gives every docket a *directory*, so each one is resolved from its own
 * working tree and unstaged and untracked papers count exactly as they do for the operator standing
 * in it. Any looser definition (every local branch, every unmerged branch) admits dockets with no
 * worktree, whose stamps could only be read from the committed diff: a branch mid-refine with
 * uncommitted papers would report an earlier leg than it is.
 *
 * The counterpart property, which nothing here arranges: a merged branch whose bay still stands
 * shows up at leg 7, so this doubles as the list of what has not been tidied up, and a docket drops
 * off the moment its bay is removed — because that is exactly when it is genuinely complete.
 *
 * @param {string} cwd anywhere in the repository — the trunk, or another bay
 * @param {Map<string, import('./bookings.js').Booking>} [bookings]
 * @returns {Docket[]} in git's order, which sorts by bay directory name rather than creation time —
 *   deterministic for a given set of bays, which is what lets the rendered fleet have a golden file
 */
export function fleet(cwd, bookings) {
  const base = defaultBranch(cwd);
  // git lists the main checkout first, and a repository is not a docket in its own fleet.
  const [, ...linked] = listWorktrees(cwd);

  /** @type {Docket[]} */
  const dockets = [];
  for (const record of linked) {
    // Detached HEAD. A docket with no branch has nothing to hang itself on, and this is the same
    // guard inference already needs where `currentBranch` comes back null.
    if (record.branch === null) continue;
    // `git worktree add` will happily check the trunk out twice; a second trunk is not an effort.
    if (record.branch === base) continue;
    // Registered, but the directory was deleted out from under git. Resolving a leg against a path
    // that is not there would warn rather than fail — a docket that reads as stalled, not as gone.
    if (record.prunable) continue;

    dockets.push({
      branch: record.branch,
      path: record.path,
      state: resolveLeg(record.path, bookings),
    });
  }
  return dockets;
}
