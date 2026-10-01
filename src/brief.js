import fs from 'node:fs';
import path from 'node:path';

import { LEGS } from './legs.js';
import { changedMatching } from './bookings.js';
import { changedPaths, defaultBranch } from './repo.js';

/**
 * Where a bay keeps its briefs, relative to the bay. Untracked by construction: the directory
 * carries a `.gitignore` of its own (see {@link ensureHandoff}), so a brief never shows in
 * `git status`, never lands in a diff a stamp reads, and never blocks `git worktree remove`.
 */
export const HANDOFF_DIR = path.join('.waybill', 'handoff');

/** The paper that names a docket's ideation directory — the stock `ideate` leg's own stamp. */
const CONTRACT = 'docs/ideation/*/contract.md';

/**
 * The leg a brief written now would be for, or `null` when none is due.
 *
 * Always the docket's next leg, and only when its booking declares `brief`. No walk of the route:
 * inference has already resolved the first leg not yet done, and that is the session that will run.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string|null}
 */
export function briefTarget(state) {
  if (!state.docketOpen || state.leg === null || !state.booking?.brief) return null;
  return state.leg;
}

/**
 * Keyed by the leg that *reads* the brief, so the lookup at the start of a leg is exact.
 *
 * @param {string} bay absolute path to the bay
 * @param {string} leg
 * @returns {string} absolute path
 */
export function briefPath(bay, leg) {
  return path.join(bay, HANDOFF_DIR, `${leg}.html`);
}

/**
 * @param {string} bay
 * @param {string} leg
 * @returns {boolean}
 */
export function briefExists(bay, leg) {
  return fs.existsSync(briefPath(bay, leg));
}

/**
 * Make the handoff directory ready to take a brief for `leg`, and say where that brief goes.
 *
 * The `.gitignore` sits inside the directory rather than being a line added to the repository's
 * own: Waybill edits no ignore file the operator owns, and `*` there wins even in a repository that
 * commits `.waybill/` wholesale. Idempotent, and it never touches a brief already written.
 *
 * @param {string} bay
 * @param {string} leg
 * @returns {string} absolute path the brief should be written to
 */
export function ensureHandoff(bay, leg) {
  const dir = path.join(bay, HANDOFF_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore) || fs.readFileSync(ignore, 'utf8') !== '*\n') fs.writeFileSync(ignore, '*\n');
  return briefPath(bay, leg);
}

/**
 * The directory of the one contract the docket's own diff carries, or `null` for none and for more
 * than one — two contracts name no single directory, and a guess would be handed on as a fact.
 *
 * @param {string} bay
 * @returns {string|null} repository-relative, forward slashes
 */
function ideationDir(bay) {
  const changed = changedPaths(bay, defaultBranch(bay));
  const contracts = changedMatching(CONTRACT, bay, changed === null ? null : new Set(changed));
  return contracts.length === 1 ? path.posix.dirname(contracts[0]) : null;
}

/**
 * Everything the markdown renderer needs to mention a brief, gathered here so the renderer stays
 * pure. `null` when the next leg takes no brief — the renderer then prints exactly what it always
 * has.
 *
 * @param {string} bay absolute path to the docket's bay
 * @param {import('./inference.js').Inference} state resolved from that bay
 * @returns {import('./waybill.js').BriefContext|null}
 */
export function briefContext(bay, state) {
  const leg = briefTarget(state);
  if (leg === null) return null;

  const completed = new Set(state.completed);
  const position = LEGS.findIndex((entry) => entry.id === leg);
  const following = LEGS.slice(position + 1).find((entry) => !completed.has(entry.id));

  return {
    leg,
    path: briefPath(bay, leg),
    exists: briefExists(bay, leg),
    bay,
    ideationDir: ideationDir(bay),
    skipped: state.skipped,
    after: following?.id ?? null,
  };
}
