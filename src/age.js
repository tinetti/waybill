import { tryGit } from './repo.js';

/**
 * @typedef {{openedAt:number|null, idleAt:number|null}} DocketAge
 *   Two numbers rather than one, because they answer different questions: `openedAt` is how long
 *   this line of work has existed — cycle time — and `idleAt` is how long since anyone touched it.
 *   Both are unix seconds. No clock enters this module: turning a timestamp into "4d" belongs to the
 *   renderer, which is injected its own `now`, and storing a formatted age here would make every
 *   golden file expire overnight.
 */

/**
 * Git's own output parsed as unix seconds, or `null` for anything else.
 *
 * `Number(null)` and `Number('')` are both `0` — the epoch, and a plausible-looking date — so the
 * absent case has to be rejected before the conversion rather than after it.
 *
 * @param {string|null} value
 * @returns {number|null}
 */
function toSeconds(value) {
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Every local branch's tip date, from one call.
 *
 * The committer date, not the author date. Author date survives a rebase, so a branch replayed onto
 * a new trunk minutes ago would report as untouched for as long as its original commits were old —
 * exactly backwards for a column whose job is to raise the neglect alarm.
 *
 * Batched deliberately: `for-each-ref` covers a whole repository in one process, where a `git log`
 * per branch would pay a process per docket for the same answer.
 *
 * @param {string} repoRoot
 * @returns {Map<string, number>} branch name -> unix seconds; empty when git will not answer, which
 *   leaves every docket's idle time `null` rather than failing the scan
 */
export function branchTips(repoRoot) {
  /** @type {Map<string, number>} */
  const tips = new Map();
  const listing = tryGit(repoRoot, ['for-each-ref', '--format=%(refname:short)%09%(committerdate:unix)', 'refs/heads']);
  if (listing === null) return tips;

  for (const line of listing.split('\n')) {
    // Split at the last tab, not the first: git forbids control characters in a ref name, but the
    // date is unambiguously the final field either way.
    const tab = line.lastIndexOf('\t');
    if (tab === -1) continue;
    const seconds = toSeconds(line.slice(tab + 1));
    if (seconds === null) continue;
    tips.set(line.slice(0, tab), seconds);
  }
  return tips;
}

/**
 * The commit where `branch` left the trunk, as a sha.
 *
 * Shared with stacking, which needs the same commit to decide whether a sibling's merge-base is
 * newer than it. The `origin/` retry is the one at `repo.js`'s `changedPaths`, and for the same
 * reason: `git clone -b feat/x` leaves no local trunk branch, so the name `defaultBranch` correctly
 * answers with is not a rev in an entirely ordinary clone.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} trunk the trunk branch *name*, not a ref
 * @returns {string|null} `null` when the two share no history, or when either rev is unknown
 */
export function trunkBase(repoRoot, branch, trunk) {
  return (
    tryGit(repoRoot, ['merge-base', trunk, branch]) ?? tryGit(repoRoot, ['merge-base', `origin/${trunk}`, branch])
  );
}

/**
 * When this line of work began: the date of the commit `branch` was cut from.
 *
 * Not the date of the branch's own first commit, which would report a branch cut months ago and
 * committed to yesterday as a day old. Not batchable — `merge-base` takes exactly two revs — so
 * this is one process per docket, which at the handful of dockets a fleet holds is affordable.
 *
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} trunk
 * @returns {number|null} unix seconds, or `null` when there is no merge-base to date
 */
export function openedAt(repoRoot, branch, trunk) {
  const base = trunkBase(repoRoot, branch, trunk);
  if (base === null) return null;

  return toSeconds(tryGit(repoRoot, ['show', '-s', '--format=%ct', base]));
}
