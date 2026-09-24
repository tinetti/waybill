import { scanFleet } from './scan.js';
import { renderFleetDashboard } from './fleet-dash.js';
import { diffFrames, enterLive, exitLive, withRawStdin } from './paint.js';

/**
 * The live fleet view: when to call the renderer, what to do with the string it returns, and how to
 * hand the terminal back afterwards.
 *
 * Nothing below this file moves for live mode. The renderer stays a pure function of (model, now),
 * the scan stays the scan, and the one-shot path in `src/cli.js` is the Phase 4 code unchanged — the
 * whole live path hangs off one `io.isTTY` branch, which is what keeps `fleet | grep` and every
 * golden file honest.
 */

/** The fast lane: local git, cheap enough to ask twice a tick and the reason to have a tick at all. */
const FAST_MS = 2000;

/**
 * The slow lane: the execute leg's openspec task counts, one deferred lookup per docket.
 *
 * Five times the fast cadence, because this lane spawns a subprocess *per docket* — at the fast
 * cadence, ten dockets across three repositories would have `openspec` running more or less
 * continuously for a number that changes a few times an hour.
 */
const SLOW_MS = 10_000;

/**
 * The tmux and `ps` reads stay on the fast lane, resolving the spec's open item.
 *
 * Both are a single machine-wide call inside `scanFleet` (`src/scan.js:285-288`) rather than one per
 * docket, so they cost the same whether the fleet holds one docket or thirty — which is the property
 * that makes them cheap enough to keep, and openspec's absence of it is what makes openspec slow.
 * Keeping them here also means the pane and activity columns track a pane you open *while watching*,
 * which is the columns' whole purpose.
 */

/** @typedef {import('./scan.js').FleetModel} FleetModel */

/** Written below the frame in live mode only. A refresh hint in a pipe would be noise. */
const FOOTER = '⟳ live · q quit · r refresh';

const QUIT_KEYS = new Set(['q', 'Q', '\u0003']);
const REFRESH_KEYS = new Set(['r', 'R']);

/**
 * @param {() => void} fn
 * @param {number} ms
 * @returns {() => void} cancel
 */
function defaultSchedule(fn, ms) {
  const timer = setInterval(fn, ms);
  return () => clearInterval(timer);
}

/**
 * A docket's identity across scans: the repository it is in and the branch it is.
 *
 * The branch alone is not enough — two repositories in one `~/Projects` sweep routinely both have a
 * `main`-adjacent `feat/login`, and a shared key would show one's task count against the other's bar.
 *
 * @param {import('./scan.js').RepoFleet} repo
 * @param {import('./fleet.js').Docket} docket
 * @returns {string}
 */
function docketKey(repo, docket) {
  return `${repo.root}\u0000${docket.branch}`;
}

/**
 * Run the fleet view until the operator leaves it.
 *
 * ## Two lanes
 *
 * The first frame is painted from fast-lane data alone, synchronously, before a single `openspec`
 * has been asked anything — that is the contract's 500ms target, and it is why the scan runs with
 * `deferProgress`. The slow lane is kicked immediately afterwards and fills the task counts in when
 * they land, one repaint later.
 *
 * ## Merge, never replace
 *
 * Counts are remembered in `counts` and re-applied to every subsequent fast scan, because a fast
 * scan knows nothing about task counts and would otherwise blank the bars it had just filled. A slow
 * lane that fails leaves the previous numbers exactly where they were: a column flickering between
 * populated and empty is worse than a column that is briefly out of date.
 *
 * ## One refresh at a time
 *
 * A tick that fires while a refresh is in flight is dropped, not queued. Across enough repositories
 * a scan can outlast its own cadence, and queueing would turn that into an unbounded pile of
 * subprocesses rather than a view that simply updates less often than it hoped to.
 *
 * @param {string} cwd
 * @param {{depth?:number, scan?:(options:object) => FleetModel,
 *          schedule?:(fn:() => void, ms:number) => () => void, fastMs?:number, slowMs?:number}} opts
 *   `scan` and `schedule` are the test seams: with both injected the loop is driven by a manual clock
 *   over a synthetic fleet, so no case here needs a real timer or a real repository.
 * @param {import('./cli.js').Io} io
 * @returns {Promise<number>} exit code
 */
export function runLive(cwd, opts, io) {
  const {
    depth,
    scan = (options) => scanFleet(cwd, options),
    schedule = defaultSchedule,
    fastMs = FAST_MS,
    slowMs = SLOW_MS,
  } = opts ?? {};

  const scanOptions = depth === undefined ? { deferProgress: true } : { depth, deferProgress: true };
  /** @type {import('./paint.js').Surface} */
  const surface = { write: (text) => io.out(text) };

  /**
   * Slow-lane results, by docket, outliving every fast scan that does not know them.
   *
   * @type {Map<string, import('./inference.js').Progress>}
   */
  const counts = new Map();

  /** @type {FleetModel|null} */
  let model = null;
  /** @type {string|null} */
  let painted = null;
  let busy = false;
  let over = false;

  return new Promise((resolve) => {
    /** @type {(() => void)[]} */
    const stops = [];
    /** @type {() => void} */
    let restore = () => {};

    /**
     * @param {number} code
     * @param {Error|null} error
     * @returns {void}
     */
    const settle = (code, error) => {
      if (over) return;
      over = true;
      for (const stop of stops) stop();
      restore();
      try {
        exitLive(surface);
      } catch {
        // The surface is what failed in the first place, on this path. Nothing left to say to it.
      }
      if (error !== null) io.err(`waybill: ${error.message}\n`);
      resolve(code);
    };

    /** @param {Error} error @returns {void} */
    const fail = (error) => {
      // A pager that has gone away is not an error to report — `| head` ending the stream early is
      // how a pager says it has read enough.
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EPIPE') settle(0, null);
      else settle(1, error);
    };

    /**
     * Apply everything the slow lane has learned to a freshly scanned model.
     *
     * @param {FleetModel} next mutated in place
     * @returns {FleetModel}
     */
    const fill = (next) => {
      for (const repo of next.repos) {
        for (const docket of repo.dockets) {
          if (docket.state.progress) continue;
          const known = counts.get(docketKey(repo, docket));
          if (known !== undefined) docket.state.progress = known;
        }
      }
      return next;
    };

    /** @returns {void} */
    const paint = () => {
      const frame = `${renderFleetDashboard(/** @type {FleetModel} */ (model), io.now())}\n${FOOTER}\n`;
      const patch = painted === null ? frame : diffFrames(painted, frame);
      if (patch !== '') surface.write(patch);
      painted = frame;
    };

    /** @returns {void} */
    const refresh = () => {
      if (busy || over) return;
      busy = true;
      try {
        /** @type {FleetModel} */
        let next;
        try {
          next = scan(scanOptions);
        } catch (error) {
          // A repository removed between two ticks is not a reason to take the terminal down: the
          // last good frame stays up, and the next tick will simply not list it. A scan that fails
          // before there *is* a frame is a different thing entirely — there is nothing to stay up,
          // and swallowing it would leave the operator watching a blank screen with no cursor.
          if (model === null) throw error;
          return;
        }
        model = fill(next);
        paint();
      } catch (error) {
        fail(/** @type {Error} */ (error));
      } finally {
        busy = false;
      }
    };

    /** @returns {Promise<void>} */
    const slowLane = async () => {
      if (busy || over || model === null) return;
      busy = true;
      try {
        /** @type {Promise<void>[]} */
        const pending = [];
        for (const repo of model.repos) {
          for (const docket of repo.dockets) {
            const ask = docket.state.progressPending;
            if (typeof ask !== 'function') continue;
            const key = docketKey(repo, docket);
            pending.push(
              Promise.resolve()
                .then(ask)
                .then(
                  (progress) => {
                    if (progress) counts.set(key, progress);
                  },
                  () => {
                    // Merge, never replace: a lookup that failed says nothing about the number it
                    // failed to fetch, so the one already on screen stands.
                  },
                ),
            );
          }
        }
        if (pending.length === 0) return;

        await Promise.all(pending);
        if (over) return;
        fill(model);
        paint();
      } catch (error) {
        fail(/** @type {Error} */ (error));
      } finally {
        busy = false;
      }
    };

    /** @param {string} key @returns {void} */
    const onKey = (key) => {
      if (over) return;
      if (QUIT_KEYS.has(key)) {
        // Ctrl-C leaves the same way `q` does, and with the same code. This is a viewer; being
        // interrupted is an ordinary way to be finished with it, not a failure.
        settle(0, null);
        return;
      }
      if (REFRESH_KEYS.has(key)) refresh();
      // Anything else is ignored in silence. A dashboard that beeps at a stray arrow key is a
      // nuisance, and an error line would corrupt the frame it was printed over.
    };

    try {
      // Before the cursor is hidden and before raw mode is entered, so there is no instant at which
      // the terminal has been taken and nothing is registered to give it back.
      restore = withRawStdin(io.stdin, onKey, (error) => (error === null ? settle(0, null) : fail(error)));

      enterLive(surface);
      refresh();
      if (over) return;

      void slowLane();
      stops.push(schedule(refresh, fastMs), schedule(() => void slowLane(), slowMs));
    } catch (error) {
      fail(/** @type {Error} */ (error));
    }
  });
}
