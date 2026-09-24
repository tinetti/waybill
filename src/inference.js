import { LEGS, WRAPPER_STAMPS, ideateIsDone } from './legs.js';
import { BUILTIN_BOOKINGS, evaluateBooking, loadBookings } from './bookings.js';
import { changedPaths, checkoutRoot, currentBranch, defaultBranch, superprojectRoot } from './repo.js';
import { discoverChangeId, executeProgress } from './progress.js';

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
 * @param {() => ReturnType<typeof executeProgress>} progress the docket's execute progress, on demand
 * @param {boolean} deferred whether some earlier leg is already open
 * @returns {boolean}
 */
function legIsDone(leg, state, bookings, warnings, progress, deferred) {
  // The walk names no leg. A wrapper-owned leg judges itself through the table `src/legs.js`
  // declares; everything else is judged purely by its booking's stamp, so a new leg is a line in
  // `LEGS` and a booking, with nothing to edit here.
  const wrapper = WRAPPER_STAMPS.get(leg.id);
  if (wrapper) return wrapper(state);

  const booking = bookings.get(leg.id);
  if (!booking) return false;

  // A `stampCmd` is the one stamp that can cost something — a subprocess, and for the review leg a
  // network round trip to a forge. Behind an open leg it cannot change the position, so it is not
  // run at all: reported not-done and left unasked. Without this the route's only network stamp
  // fires under every command at every leg, and on a machine carrying no forge CLI prints a
  // warning naming a leg the operator has not reached.
  //
  // The cost is bounded and deliberate: a hole at a `stampCmd` leg goes unseen, where a hole at a
  // `stampPath` leg still surfaces in `skipped`. Path stamps stay eager precisely so out-of-order
  // detection survives — every leg it covers today is one.
  if (deferred && booking.stampCmd) return false;

  const result = evaluateBooking(booking, state.root, state.changed);
  warnings.push(...result.warnings);
  if (!result.done || !leg.progress) return result.done;

  // A stamp cannot count checkboxes, and a shell command that tries sees every change on disk,
  // inherited ones included. So a progress leg is also held to the branch-scoped count the waybill
  // prints: a change of the docket's own still in flight keeps the leg open, and `0 of 0` is not
  // finished. With no active change of its own — archived, or never scaffolded — the stamp decides.
  const { done, total, changeId } = progress();
  return changeId === null || (total > 0 && done === total);
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
    // Named remedies rather than a bare complaint: this is the only signal an operator gets for a
    // tool that has silently stopped stamping, and the two fixes are the two shapes of the cause —
    // a base branch that was never fetched, and an `origin/HEAD` pointing somewhere it should not.
    warnings.push(
      `cannot determine what ${branch ?? 'HEAD'} changed against ${base}; no leg will stamp — ` +
        `run \`git fetch origin ${base}:${base}\`, or \`git remote set-head origin -a\` if ${base} ` +
        'is not this repository\'s default branch',
    );
  }
  const changed = changedList === null ? null : new Set(changedList);

  /** @type {import('./legs.js').RepoState} */
  const state = { cwd: anchor, root, branch, base, docketOpen, changed };

  // Asked for at most once, and only when a progress leg's stamp passes or the walk stops on it:
  // with the openspec CLI on PATH it costs a subprocess.
  /** @type {ReturnType<typeof executeProgress>|undefined} */
  let progress;
  const executeState = () => (progress ??= executeProgress(root, docketOpen ? undefined : null, changed));

  // Every leg but `ideate` is judged on its own; `ideate` is judged on what came after it.
  //
  // `deferred` tracks whether the walk has passed an open leg yet, so a costly stamp behind one is
  // never run. `ideate` is skipped here and judged below, so it must not set the flag — the walk
  // would otherwise defer every stamp on the route.
  let deferred = false;
  const done = LEGS.map((leg, i) => {
    if (i === 0) return false;
    const complete = legIsDone(leg, state, bookings, warnings, executeState, deferred);
    if (!complete) deferred = true;
    return complete;
  });
  done[0] = ideateIsDone(state, done.some(Boolean));

  // With no docket open there is no position to report, so the walk's verdict is discarded — the
  // walk still runs, because the warnings it collects are worth having either way. It cannot simply
  // be trusted: `stampCmd` is unscoped by design, so a booking whose command matches papers left in
  // history stamps its leg, which back-stamps `ideate` through `laterComplete` and leaves the
  // position mid-workflow — handing the operator a `/waybill:start <change-id>` that cannot succeed.
  // The whole vector is cleared, not just the position: `next --json` would otherwise report
  // `docketOpen: false` beside a list of legs a docket that does not exist had supposedly finished,
  // and the header and the payload have to agree.
  if (!docketOpen) done.fill(false);

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
    // A change inherited from the trunk would be interpolated into the waybill as the docket's own —
    // `/spec:propose <shipped id>` — so only a change the branch's diff touches is named, the same
    // scope the path stamps use. No docket, no change in flight.
    changeId: docketOpen ? discoverChangeId(root, changed) : null,
    warnings,
  };

  if (leg === 'execute') {
    result.progress = executeState();
    // The filesystem walk only sees changes that already carry a `tasks.md`; `openspec list --json`
    // names active changes regardless. When only the CLI found one, take its id — phase 3
    // interpolates `changeId` into the waybill's command, and an empty one beside a progress line
    // for a named change is worse than no progress at all. The CLI's pick is branch-scoped too.
    result.changeId ??= result.progress.changeId;
  }
  return result;
}
