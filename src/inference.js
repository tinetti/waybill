import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS, cleanupIsDone, ideateIsDone, bayIsDone } from './legs.js';
import { evaluateBooking, loadBookings } from './bookings.js';
import { changedPaths, checkoutRoot, currentBranch, defaultBranch, superprojectRoot } from './repo.js';
import { discoverChangeId, executeProgress } from './progress.js';

/**
 * The bookings Waybill ships with, used when a caller supplies none. Exported so the CLI can load
 * the same map it hands to {@link resolveLeg} and derive the inspection's paper paths from it,
 * rather than keeping a second copy of this path.
 */
export const BUILTIN_BOOKINGS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bookings');

/**
 * @typedef {{leg:string|null, index:number, completed:string[], skipped:string[],
 *            progress?:{done:number,total:number,source:string,changeId:string|null},
 *            booking?:import('./bookings.js').Booking, branch:string|null, docketOpen:boolean,
 *            changeId:string|null, warnings:string[]}} Inference
 */

/**
 * @param {import('./legs.js').Leg} leg
 * @param {import('./legs.js').RepoState} state
 * @param {Map<string, import('./bookings.js').Booking>} bookings
 * @param {string[]} warnings collected in place
 * @returns {boolean}
 */
function legIsDone(leg, state, bookings, warnings) {
  if (leg.id === 'bay') return bayIsDone(state);
  if (leg.id === 'cleanup') return cleanupIsDone(state);

  const booking = bookings.get(leg.id);
  if (!booking) return false;

  const result = evaluateBooking(booking, state.root, state.changed);
  warnings.push(...result.warnings);
  return result.done;
}

/**
 * Where this repository stands, derived from nothing but repository reality.
 *
 * The walk runs the leg list in order and stops at the first incomplete leg rather than jumping
 * to the last complete one. That is deliberate: the operator is allowed to do any leg by hand,
 * and skipping ahead silently would hide it. Work done out of order surfaces in `skipped` instead.
 *
 * Repository and stamp failures never throw: a directory outside any repository, a detached
 * HEAD, and a stamp that cannot be executed are all reported through `warnings`, because a
 * wrapper that crashes is worse than a wrapper that admits it does not know. Loading the built-in
 * bookings is the one exception — it sits in the loader tier, where a malformed booking is a bug
 * and throws with the offending file and key.
 *
 * @param {string} cwd
 * @param {Map<string, import('./bookings.js').Booking>} [bookings] defaults to the built-ins
 * @returns {Inference}
 */
export function resolveLeg(cwd, bookings) {
  /** @type {string[]} */
  const warnings = [];
  bookings ??= loadBookings(BUILTIN_BOOKINGS, { knownLegs: LEGS.map((leg) => leg.id) });

  // Inside a submodule every git query answers for the submodule's own tree, so the legs would be
  // resolved against a repository the operator's change does not live in. Anchor on the
  // superproject instead, and say so — a silently redirected answer is its own failure mode.
  const superproject = superprojectRoot(cwd);
  if (superproject !== null) {
    warnings.push(`${cwd} is inside a submodule; resolving against the superproject ${superproject}`);
  }
  const anchor = superproject ?? cwd;

  const root = checkoutRoot(anchor);
  if (root === null) {
    warnings.push(`not a git repository: ${cwd}`);
    return {
      leg: LEGS[0].id,
      index: 1,
      completed: [],
      skipped: [],
      booking: bookings.get(LEGS[0].id),
      branch: null,
      docketOpen: false,
      changeId: null,
      warnings,
    };
  }

  const branch = currentBranch(anchor);
  const base = defaultBranch(anchor);
  // A docket is the branch: nothing is in flight while we stand on the trunk. The `branch` guard is
  // load-bearing — `currentBranch` is null on a detached HEAD, and `null !== 'main'` would
  // otherwise open a docket with no branch to hang it on.
  const docketOpen = Boolean(branch) && branch !== base;

  // `git diff --name-only` prints paths relative to the repository root, and `stampedByPath`
  // derives its own relative paths from `repoRoot` (== `root`) — querying anywhere else risks the
  // two sets disagreeing.
  const changedList = changedPaths(root, base);
  if (changedList === null) {
    warnings.push(`cannot determine what ${branch ?? 'HEAD'} changed against ${base}; no leg will stamp`);
  }
  const changed = changedList === null ? null : new Set(changedList);

  /** @type {import('./legs.js').RepoState} */
  const state = { cwd: anchor, root, branch, base, docketOpen, changed };

  // Every leg but `ideate` is judged on its own; `ideate` is judged on what came after it.
  const done = LEGS.map((leg, i) => (i === 0 ? false : legIsDone(leg, state, bookings, warnings)));
  done[0] = ideateIsDone(state, done.some(Boolean));

  const current = done.indexOf(false);
  const leg = current === -1 ? null : LEGS[current].id;
  const lastComplete = done.lastIndexOf(true);

  const result = {
    leg,
    index: current === -1 ? LEGS.length : current + 1,
    completed: LEGS.filter((_, i) => done[i]).map((entry) => entry.id),
    // Holes: incomplete legs that later work has already run past. The current leg is one of them
    // by construction and is excluded — it is already reported as `leg`, and naming it twice would
    // have the waybill say "do the bay leg" and "you skipped the bay leg" at once.
    skipped: LEGS.filter((_, i) => !done[i] && i > current && i < lastComplete).map((entry) => entry.id),
    booking: leg === null ? undefined : bookings.get(leg),
    branch: state.branch,
    docketOpen: state.docketOpen,
    changeId: discoverChangeId(root),
    warnings,
  };

  if (leg === 'execute') {
    result.progress = executeProgress(root, result.changeId);
    // The filesystem walk only sees changes that already carry a `tasks.md`; `openspec list --json`
    // names active changes regardless. When only the CLI found one, take its id — phase 3
    // interpolates `changeId` into the waybill's command, and an empty one beside a progress line
    // for a named change is worse than no progress at all.
    result.changeId ??= result.progress.changeId;
  }
  return result;
}
