import fs from 'node:fs';
import path from 'node:path';

import { LEGS } from './legs.js';
import { BUILTIN_BOOKINGS, loadBookings, resolveBookings } from './bookings.js';
import { defaultBranch, mainCheckout } from './repo.js';
import { fleet, hasOpenDocket } from './fleet.js';
import { branchTips, openedAt } from './age.js';
import { stackParents } from './stack.js';
import { listPanes, paneFor, panesByPath } from './panes.js';
import { activityFor, childIndex, snapshot } from './procs.js';

/**
 * @typedef {{root:string, name:string, trunk:string,
 *            bookings:Map<string, import('./bookings.js').Booking>,
 *            dockets:import('./fleet.js').Docket[], warnings:string[]}} RepoFleet
 *   One discovered repository and the efforts in flight in it. `root` is the main checkout, which
 *   is also the dedup key; `bookings` are resolved from that root rather than from the scan's cwd.
 */

/**
 * @typedef {{root:string, inRepo:boolean, scanned:number, repos:RepoFleet[],
 *            tmuxAvailable:boolean, psAvailable:boolean}} FleetModel
 *   `inRepo` is true only when the scan resolved to the single repository holding the cwd — the
 *   operator standing in a project of their own. Standing in a checkout that merely contains the
 *   real projects is a multi-repository scan, and reads false.
 *
 *   `scanned` counts every repository found, *before* the ones with nothing in flight are dropped:
 *   an empty `repos` beside `scanned: 0` is "there is nothing here", and beside `scanned: 12` it is
 *   "everything is clean", and a dashboard that cannot tell those apart reads a failed scan as
 *   success.
 *
 *   The two availability flags exist for the same reason at the column level. A blank pane column
 *   means "no pane is open on this bay"; a blank one because tmux never answered means nothing at
 *   all, and rendering the two identically invites the operator to trust an absence that was never
 *   checked. False here is the renderer's signal to omit the column rather than to print it empty.
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
 * Inside a repository with a docket open the answer is that one repository: the operator standing
 * in a checkout that has work in flight is asking about it, not about whatever else happens to
 * share its parent directory. This is the first Waybill code path that also has to answer *outside*
 * one, so failing there is not an option.
 *
 * The walk halts at every repository that has a docket open rather than descending into it. A
 * checkout vendored inside a project that is being worked on is that project's business, and a
 * submodule already resolves to its superproject everywhere else in the tool.
 *
 * A checkout with nothing in flight is not treated as a project at all, and the walk goes straight
 * through it — including the one holding the cwd. A projects directory kept under version control
 * is an ordinary arrangement, and halting at it hid every real repository underneath: on a machine
 * whose `~/Projects` is itself a checkout, the scan the whole view exists for found nothing. The
 * cost is that a dormant project vendoring a checkout now reports the vendored one, which is the
 * lesser of the two wrongs — it over-reports where the old rule silently under-reported everything.
 *
 * @param {string} cwd
 * @param {{depth?:number}} [options] `depth` counts directory levels below `cwd`, so `1` is the
 *   immediate children and nothing else
 * @returns {string[]} absolute paths, lexicographically ordered so a scan of unchanged directories
 *   always produces the same fleet in the same order
 */
export function discoverRepos(cwd, options = {}) {
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
        // Recorded either way; the docket is only what decides whether to look inside it.
        if (hasOpenDocket(repo)) continue;
      }
      descend(child, level + 1);
    }
  }

  // The repository holding the cwd is always part of the answer, and when it has work of its own
  // it is the whole of it. With nothing in flight it is a container rather than a project, so it is
  // counted and then walked through like any other.
  const here = containingRepo(cwd);
  if (here !== null) {
    found.add(here);
    if (hasOpenDocket(here)) return [here];
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
 * Hang the two environment-derived facts off every docket: the tmux pane sitting in its bay, and
 * what is running in that pane.
 *
 * Separate from {@link decorate} because the inputs are: those come from one repository's git, these
 * from one snapshot of the whole machine, taken once per scan and passed in.
 *
 * Both degrade to `null`, never to a guess. A docket with no pane is not asked what is running in
 * it — there is no pid to ask about, and answering anyway would mean naming a process that belongs
 * to somebody else's terminal.
 *
 * @param {import('./fleet.js').Docket[]} dockets mutated in place
 * @param {Map<string, import('./panes.js').Pane>} byPath
 * @param {Map<number, import('./procs.js').Proc[]>} children
 * @returns {void}
 */
function decorateSignals(dockets, byPath, children) {
  for (const docket of dockets) {
    const pane = paneFor(byPath, docket.path);
    docket.pane =
      pane === null ? null : { session: pane.session, windowIndex: pane.windowIndex, windowName: pane.windowName };
    docket.activity = pane === null ? null : activityFor(pane.panePid, children);
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

  // Discovery owns the question of which repositories a cwd means, including what standing inside
  // one implies. Asking `containingRepo` here as well once gave this function a second, simpler
  // copy of that rule, and the copy went on short-circuiting after the real one had learned to
  // walk through a checkout with nothing in flight.
  const roots = discoverRepos(cwd, { depth });
  const here = containingRepo(cwd);
  // Single-repo mode keeps today's behaviour exactly: the operator is standing in the one
  // repository whose commands these are, so running its configured stamp commands is running their
  // own. That holds only when the scan came back as that one repository — standing in a container
  // whose children are the real projects is a multi-repository scan like any other.
  const inRepo = here !== null && roots.length === 1 && roots[0] === here;
  const skipStampCmd = !inRepo;

  // One tmux call and one ps snapshot for the entire scan. Both describe the machine rather than
  // any one repository, so paying for them per repository — or worse, per docket — would buy the
  // same answer several times over. Empty means the source could not be read, which is a fact the
  // model carries rather than one it hides.
  const panes = listPanes();
  const byPath = panesByPath(panes);
  const procs = snapshot();
  const children = childIndex(procs);

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
    decorateSignals(dockets, byPath, children);
    repos.push({ root, name: path.basename(root), trunk, bookings, dockets, warnings });
  }

  return {
    root: cwd,
    inRepo,
    scanned: roots.length,
    repos,
    tmuxAvailable: panes.length > 0,
    psAvailable: procs.length > 0,
  };
}
