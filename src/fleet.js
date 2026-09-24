import { defaultBranch, listWorktrees } from './repo.js';
import { resolveLeg } from './inference.js';

/**
 * @typedef {{branch:string, path:string, state:import('./inference.js').Inference,
 *            openedAt?:number|null, idleAt?:number|null, stackedOn?:string|null,
 *            pane?:{session:string, windowIndex:string, windowName:string}|null,
 *            activity?:import('./procs.js').Activity}} Docket
 *   `state` is the whole inference rather than a flattened leg and index, because the fleet view
 *   also renders execute's task progress and attributes each docket's warnings to the branch they
 *   came from — both of which live on the inference and neither of which the caller can rebuild.
 *
 *   The five optional fields are the fleet view's own, hung on by `scan.js` after this function
 *   has returned: `openedAt` is the unix seconds of the merge-base commit with the trunk, `idleAt`
 *   the unix seconds of the branch tip's committer date, and `stackedOn` the sibling branch this
 *   one was cut from, or `null` when it was cut from the trunk. `pane` is the tmux pane sitting in
 *   this docket's bay, matched on exact path, and `activity` what is running in it. Absent from a
 *   plain `fleet` call, which is every caller that asks where one docket stands rather than how the
 *   whole fleet looks.
 *
 *   Unix seconds, never a formatted age: the model has no clock, so a golden file of it is stable.
 */

/**
 * Every effort in flight, seen from anywhere in the repository.
 *
 * A docket, from outside it, is a bay on disk. That is already the tool's own definition of
 * in-flight — leg 2 makes the bay mandatory, and leg 8 is stamped only once the bay is gone — and
 * it is the definition that gives every docket a *directory*, so each one is resolved from its own
 * working tree and unstaged and untracked papers count exactly as they do for the operator standing
 * in it. Any looser definition (every local branch, every unmerged branch) admits dockets with no
 * worktree, whose stamps could only be read from the committed diff: a branch mid-refine with
 * uncommitted papers would report an earlier leg than it is.
 *
 * The counterpart property, which nothing here arranges: a merged branch whose bay still stands
 * shows up at leg 8, so this doubles as the list of what has not been tidied up, and a docket drops
 * off the moment its bay is removed — because that is exactly when it is genuinely complete.
 *
 * @param {string} cwd anywhere in the repository — the trunk, or another bay
 * @param {Map<string, import('./bookings.js').Booking>} [bookings]
 * @param {{deferProgress?:boolean, skipStampCmd?:boolean}} [options] forwarded to `resolveLeg`
 *   unchanged: a fleet of ten dockets is exactly where paying per docket for a subprocess, or for
 *   somebody's configured shell command, stops being affordable.
 * @returns {Docket[]} in git's order, which sorts by bay directory name rather than creation time —
 *   deterministic for a given set of bays, which is what lets the rendered fleet have a golden file
 */
export function fleet(cwd, bookings, options = {}) {
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
      state: resolveLeg(record.path, bookings, options),
    });
  }
  return dockets;
}
