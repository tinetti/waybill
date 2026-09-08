import fs from 'node:fs';

import { inBay, isMerged, resolveBayPath } from './repo.js';

/**
 * @typedef {{id:string, owner:'booking'|'wrapper', progress?:boolean}} Leg
 */

/**
 * @typedef {{cwd:string, root:string, branch:string|null, base:string, docketOpen:boolean}} RepoState
 *   `root` is the working tree the stamps resolve against; `base` is the default branch.
 */

/**
 * The leg model. Fixed and exported rather than configurable: "7/7 legs" is a standing invariant
 * the success criteria are stated against, and the fixture directory is counted against this list.
 *
 * `owner` says who supplies the *stamp*, not who supplies the waybill — the two wrapper-owned
 * legs still take their command and model from a booking, because the anchor and the terminus
 * must be relied on while everything they hand to is swappable.
 *
 * @type {Leg[]}
 */
export const LEGS = [
  { id: 'ideate', owner: 'booking' },
  { id: 'bay', owner: 'wrapper' },
  { id: 'refine', owner: 'booking' },
  { id: 'contract', owner: 'booking' },
  { id: 'specs', owner: 'booking' },
  { id: 'execute', owner: 'booking', progress: true },
  { id: 'cleanup', owner: 'wrapper' },
];

/**
 * Where the current branch's bay would live, or `null` when there is no branch to derive it
 * from — a detached HEAD and a directory outside any repository both land here.
 *
 * @param {RepoState} state
 * @returns {string|null}
 */
function bayPath(state) {
  if (!state.branch) return null;
  try {
    return resolveBayPath(state.branch, state.cwd);
  } catch {
    return null;
  }
}

/**
 * The `bay` leg is done once the isolated tree exists — either we are standing in it, or it
 * sits where {@link resolveBayPath} says it should.
 *
 * @param {RepoState} state
 * @returns {boolean}
 */
export function bayIsDone(state) {
  if (inBay(state.cwd)) return true;
  const target = bayPath(state);
  return target !== null && fs.existsSync(target);
}

/**
 * The `cleanup` leg is done once the work has landed and its tree is gone.
 *
 * Standing on the default branch is explicitly *not* done: there is no feature branch to fold back
 * in yet, and treating that as a completed cleanup would make the `ideate` rule below fire in every
 * untouched repository.
 *
 * "No bay remains" is judged against the resolved bay path only, deliberately matching
 * {@link bayIsDone}: a bay the operator registered somewhere else reads as cleaned up while it
 * is still checked out. Asking `git worktree list --porcelain` instead would answer for every path,
 * but then the two wrapper stamps would disagree about what "the bay" is, and the leg Waybill
 * anchors on is the one {@link resolveBayPath} names.
 *
 * That both stamps go through the same resolver is what keeps them agreeing once the location is
 * configurable: change `waybill.baydir` and they move together, to the same directory.
 *
 * @param {RepoState} state
 * @returns {boolean}
 */
export function cleanupIsDone(state) {
  const { branch, base } = state;
  if (!branch || branch === base) return false;
  if (!isMerged(branch, base, state.cwd)) return false;
  const target = bayPath(state);
  return target !== null && !fs.existsSync(target);
}

/**
 * The `ideate` leg leaves no papers by design — a rough-ideation conversation writes nothing —
 * so it is judged by what it must have preceded: any later leg being complete, or a docket being
 * open at all.
 *
 * @param {RepoState} state
 * @param {boolean} laterComplete whether any leg after this one is complete
 * @returns {boolean}
 */
export function ideateIsDone(state, laterComplete) {
  return laterComplete || state.docketOpen;
}
