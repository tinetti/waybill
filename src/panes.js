import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Which tmux panes are sitting in which bay, for the fleet view.
 *
 * Deliberately a second, independent tmux integration rather than an extension of `signals.js`.
 * That one asks what *this* pane is called, so it can guess which branch the operator means, and it
 * guesses by matching names — badly enough that `picker.js` carries a denylist of window names the
 * guess must never be trusted on. This one asks a different question of a different subject: which
 * of the server's panes is sitting in a directory the fleet already knows the exact path of. The
 * join is `realpath === realpath` and nothing else, so it is either right or absent, never a guess.
 *
 * Unifying the two would drag the name matching into a surface whose whole value is that it does
 * not do any.
 */

/**
 * @typedef {{session:string, windowIndex:string, windowName:string, paneId:string, panePid:number,
 *            paneCurrentPath:string, paneCurrentCommand:string}} Pane
 *   `windowIndex` stays a string: it is an identifier for `tmux select-window -t`, not a number to
 *   do arithmetic on, and tmux allows a window base index other than zero.
 */

/** How long tmux is given to answer before the fleet is drawn without it — `signals.js:44`'s rule. */
const TMUX_TIMEOUT_MS = 1000;

/** The fields, in the order {@link parsePanes} reads them back out. */
const FORMAT = [
  '#{session_name}',
  '#{window_index}',
  '#{window_name}',
  '#{pane_id}',
  '#{pane_pid}',
  '#{pane_current_path}',
  '#{pane_current_command}',
].join('\t');

/**
 * A directory as the join compares it: fully resolved, with any trailing slash gone.
 *
 * Both sides need this. A bay under a symlinked `$HOME` is reported one way by `git worktree list`
 * and another by tmux, and the two spellings name the same directory — a literal comparison would
 * report no pane where a pane is plainly open.
 *
 * @param {string} dir
 * @returns {string|null} `null` for a directory that cannot be resolved, which for a pane means the
 *   directory it was sitting in has been deleted out from under it
 */
function resolved(dir) {
  try {
    return fs.realpathSync(dir).replace(/(?!^)\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Every pane tmux reports, parsed.
 *
 * @param {string} stdout
 * @returns {Pane[]} rows that are not the seven expected fields, or whose pid is not a number, are
 *   dropped rather than throwing: a fleet view is not worth failing over a line tmux mangled
 */
function parsePanes(stdout) {
  /** @type {Pane[]} */
  const panes = [];
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const fields = line.split('\t');
    if (fields.length !== 7) continue;
    const [session, windowIndex, windowName, paneId, pid, paneCurrentPath, paneCurrentCommand] = fields;
    const panePid = Number(pid);
    // `Number('')` is 0, so an empty field would otherwise pass for a pid and index nothing.
    if (!Number.isInteger(panePid) || panePid <= 0) continue;
    panes.push({ session, windowIndex, windowName, paneId, panePid, paneCurrentPath, paneCurrentCommand });
  }
  return panes;
}

/**
 * Every pane on the tmux server, from one call.
 *
 * `-a` rather than a target: the fleet spans every session on the machine, so `$TMUX_PANE` — which
 * `signals.js` is right to use, because it asks about the pane it was started in — is the wrong
 * question here. For the same reason there is no `$TMUX` guard: waybill run from a plain terminal
 * still wants to know what the server is holding, and a server that is not running simply answers
 * with nothing.
 *
 * @param {NodeJS.ProcessEnv} [env] a parameter so a test can hand in a `PATH` with a stub tmux
 * @returns {Pane[]} empty when tmux is absent, has no server, fails, or does not answer in time —
 *   every one of which is a non-event for a column that degrades to blank
 */
export function listPanes(env = process.env) {
  const result = spawnSync('tmux', ['list-panes', '-a', '-F', FORMAT], {
    env,
    encoding: 'utf8',
    timeout: TMUX_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) return [];
  return parsePanes(result.stdout);
}

/**
 * The panes indexed by the directory they are sitting in.
 *
 * The first pane in a directory wins, so two panes side by side in one bay resolve to the same
 * answer on every scan — tmux lists in a stable order, and an arbitrary-but-stable choice is what
 * lets the rendered fleet have a golden file.
 *
 * @param {Pane[]} panes
 * @returns {Map<string, Pane>} resolved directory -> pane
 */
export function panesByPath(panes) {
  /** @type {Map<string, Pane>} */
  const byPath = new Map();
  for (const pane of panes) {
    const key = resolved(pane.paneCurrentPath);
    if (key === null || byPath.has(key)) continue;
    byPath.set(key, pane);
  }
  return byPath;
}

/**
 * The pane sitting in `dir`, or `null`.
 *
 * Exact only. There is no fallback to a window or session name that looks like the branch: that is
 * the picker's guess, and reproducing it here would attribute somebody else's pane to a bay and
 * then say so with confidence.
 *
 * @param {Map<string, Pane>} byPath from {@link panesByPath}
 * @param {string} dir
 * @returns {Pane|null}
 */
export function paneFor(byPath, dir) {
  const key = resolved(dir);
  return key === null ? null : (byPath.get(key) ?? null);
}
