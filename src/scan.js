import fs from 'node:fs';
import path from 'node:path';

import { LEGS } from './legs.js';
import { BUILTIN_BOOKINGS, loadBookings, resolveBookings } from './bookings.js';
import { defaultBranch, mainCheckout } from './repo.js';
import { fleet } from './fleet.js';
import { branchTips, openedAt } from './age.js';
import { stackParents } from './stack.js';

/**
 * @typedef {{root:string, name:string, trunk:string,
 *            bookings:Map<string, import('./bookings.js').Booking>,
 *            dockets:import('./fleet.js').Docket[], warnings:string[]}} RepoFleet
 *   One discovered repository and the efforts in flight in it. `root` is the main checkout, which
 *   is also the dedup key; `bookings` are resolved from that root rather than from the scan's cwd.
 */

/**
 * @typedef {{root:string, inRepo:boolean, scanned:number, repos:RepoFleet[]}} FleetModel
 *   `scanned` counts every repository found, *before* the ones with nothing in flight are dropped:
 *   an empty `repos` beside `scanned: 0` is "there is nothing here", and beside `scanned: 12` it is
 *   "everything is clean", and a dashboard that cannot tell those apart reads a failed scan as
 *   success.
 */

/** How many directory levels below the cwd the walk descends. `~/Projects/<org>/<repo>` needs 2. */
const DEFAULT_DEPTH = 4;

/** The legs a booking may be declared for, resolved once rather than per repository. */
const KNOWN_LEGS = { knownLegs: LEGS.map((leg) => leg.id) };

/**
 * @param {string} dir
 * @returns {import('node:fs').Dirent[]} empty for a directory that cannot be read — a
 *   permission-denied subtree is not a fleet error
 */
function readdirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * The main checkout of the repository rooted at `dir`, or `null` when git will not say.
 *
 * A `.git` *directory* is the main checkout by definition. A `.git` *file* is a linked worktree —
 * a bay — and the only thing that collapses `waybill.baydir=..` back into one project is asking
 * git which checkout it belongs to. Deduplicating on the discovered path instead would report a
 * project once per bay, with its dockets repeated in each.
 *
 * The answer is resolved through symlinks for the same reason: `~/Projects/current -> foo` is an
 * ordinary thing to have, and the dedup key has to name the project once however it was reached.
 *
 * @param {string} dir
 * @returns {string|null}
 */
function repoAt(dir) {
  /** @type {import('node:fs').Stats} */
  let stats;
  try {
    stats = fs.statSync(path.join(dir, '.git'));
  } catch {
    return null;
  }

  try {
    return fs.realpathSync(stats.isDirectory() ? dir : mainCheckout(dir));
  } catch {
    return null;
  }
}

/**
 * Directory names the walk never descends into.
 *
 * `node_modules` alone is what keeps the walk bounded in practice — a single install can hold
 * thousands of directories and the occasional vendored `.git`. Dot-directories go too: the default
 * bay container is `.claude/worktrees`, so skipping them means the ordinary layout never even has
 * to be deduplicated, and nothing of interest to a fleet lives in a hidden directory anyway.
 *
 * @param {string} name
 * @returns {boolean}
 */
function skipDir(name) {
  return name === 'node_modules' || name.startsWith('.');
}

/**
 * The main checkout containing `cwd`, or `null` when `cwd` is in no repository.
 *
 * Distinct from {@link repoAt}, which only probes for a `.git` beside a directory: `cwd` may be an
 * ordinary subdirectory well inside a checkout.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
function containingRepo(cwd) {
  try {
    return mainCheckout(cwd);
  } catch {
    return null;
  }
}

/**
 * Every repository at or beneath `cwd`, as main-checkout paths, sorted and deduplicated.
 *
 * Inside a repository the answer is that one repository: the operator standing in a checkout is
 * asking about it, not about whatever else happens to share its parent directory. This is the first
 * Waybill code path that also has to answer *outside* one, so failing there is not an option.
 *
 * The walk halts at every repository it finds rather than descending into it. A checkout vendored
 * inside another is that project's business, and a submodule already resolves to its superproject
 * everywhere else in the tool.
 *
 * @param {string} cwd
 * @param {{depth?:number}} [options] `depth` counts directory levels below `cwd`, so `1` is the
 *   immediate children and nothing else
 * @returns {string[]} absolute paths, lexicographically ordered so a scan of unchanged directories
 *   always produces the same fleet in the same order
 */
export function discoverRepos(cwd, options = {}) {
  const here = containingRepo(cwd);
  if (here !== null) return [here];

  const depth = options.depth ?? DEFAULT_DEPTH;
  /** @type {Set<string>} */
  const found = new Set();
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {string} dir
   * @param {number} level how many levels below `cwd` `dir` sits
   * @returns {void}
   */
  function descend(dir, level) {
    // `dir` only ever yields candidates one level below itself, so the bound is checked against
    // where its children would land — `depth: 1` is the immediate children and nothing under them.
    if (level >= depth) return;
    // Real paths, so a symlink pointing back up the tree is walked once rather than forever.
    /** @type {string} */
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);

    for (const entry of readdirSafe(dir)) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (skipDir(entry.name)) continue;
      const child = path.join(dir, entry.name);

      const repo = repoAt(child);
      if (repo !== null) {
        found.add(repo);
        continue;
      }
      descend(child, level + 1);
    }
  }

  descend(cwd, 0);
  return [...found].sort();
}

/**
 * The bookings in force for a repository, falling back to the built-ins when its overlay is
 * malformed. One broken overlay in a projects tree costs that repository its overlay, not the whole
 * scan — but silently substituting different legs would misreport the repository, so it says so.
 *
 * @param {string} root
 * @param {string[]} warnings collected in place
 * @returns {Map<string, import('./bookings.js').Booking>}
 */
function bookingsFor(root, warnings) {
  try {
    return resolveBookings(root, KNOWN_LEGS);
  } catch (error) {
    warnings.push(`${root}: bookings overlay ignored: ${error.message}`);
    return loadBookings(BUILTIN_BOOKINGS, KNOWN_LEGS);
  }
}

/**
 * Hang the git-derived facts the fleet view needs off every docket in one repository: how old it is
 * and which sibling it is stacked on.
 *
 * Done here rather than in `fleet`, whose callers — `waybill next`, the picker — ask only where one
 * docket stands and would pay a merge-base per pair for an answer they never read.
 *
 * The tips are one call for the whole repository; the merge-bases cannot be batched. Every field
 * degrades to `null` rather than throwing, so a repository git will not talk about still lists its
 * dockets with dashes where the dates would be.
 *
 * @param {string} root the main checkout
 * @param {string} trunk
 * @param {import('./fleet.js').Docket[]} dockets mutated in place
 * @param {string[]} warnings collected in place
 * @returns {void}
 */
function decorate(root, trunk, dockets, warnings) {
  const tips = branchTips(root);
  const parents = stackParents(
    root,
    dockets.map((docket) => docket.branch),
    trunk,
    warnings,
  );

  for (const docket of dockets) {
    docket.openedAt = openedAt(root, docket.branch, trunk);
    docket.idleAt = tips.get(docket.branch) ?? null;
    docket.stackedOn = parents.get(docket.branch) ?? null;
  }
}

/**
 * Every repository in play and every effort in flight in each.
 *
 * Multi-repo mode — a cwd outside any repository — differs from single-repo mode in exactly two
 * ways, both of them about what *looking* is allowed to cost. Bookings are resolved once per
 * repository rather than once per scan, because `waybill.bookingsdir` is a per-repository setting
 * and one resolution would apply one project's legs to every other. And `stampCmd` is not executed
 * at all: it is arbitrary shell, and a dashboard of `~/Projects` must not be a way to run every
 * command every project has configured.
 *
 * @param {string} cwd
 * @param {{depth?:number, deferProgress?:boolean}} [options]
 * @returns {FleetModel}
 */
export function scanFleet(cwd, options = {}) {
  const { depth = DEFAULT_DEPTH, deferProgress = false } = options;

  const here = containingRepo(cwd);
  const inRepo = here !== null;
  const roots = inRepo ? [here] : discoverRepos(cwd, { depth });
  // Single-repo mode keeps today's behaviour exactly: the operator is standing in the one
  // repository whose commands these are.
  const skipStampCmd = !inRepo;

  /** @type {RepoFleet[]} */
  const repos = [];
  for (const root of roots) {
    /** @type {string[]} */
    const warnings = [];
    const bookings = bookingsFor(root, warnings);
    const dockets = fleet(root, bookings, { deferProgress, skipStampCmd });
    // A repository with nothing in flight is not news. It is still `scanned`, so the footer can
    // say how much was looked at.
    if (dockets.length === 0) continue;

    const trunk = defaultBranch(root);
    decorate(root, trunk, dockets, warnings);
    repos.push({ root, name: path.basename(root), trunk, bookings, dockets, warnings });
  }

  return { root: cwd, inRepo, scanned: roots.length, repos };
}
