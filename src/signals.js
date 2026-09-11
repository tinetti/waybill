import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * What the operator's terminal says they are working on, for ordering the `bay --list` menu.
 *
 * Every source here is a hint and nothing more: each one is read best-effort, bounded, and silent
 * on failure, because a menu that could not be ranked is still a menu, and a picker that failed
 * because tmux was not running would be a worse picker than one that never asked.
 *
 * iTerm is deliberately not a source. The only way to read a tab title is `osascript`, which
 * raises a macOS Automation permission prompt the first time it runs and then answers for the
 * *frontmost* window — not necessarily the one this command was invoked from. A hint that can stall
 * the command on a dialog, and then be wrong, costs more than the ordering it would buy.
 */

/**
 * @typedef {{session:string, window:string, pane:string}} TmuxNames
 *   `pane` is the pane *title*, which programs set for themselves (tmux defaults it to the host
 *   name), so it is the weakest of the three.
 */

/**
 * @typedef {{tmux:TmuxNames|null, history:string[]}} Signals
 *   `history` holds branch names, most recent mention first, each at most once.
 */

/**
 * How much of the shell history is read: the most recent lines only. Enough for the last day or
 * so of work, and small enough that a branch touched months ago cannot outrank today's — history
 * is shared across every shell the operator has open, so its old end is somebody else's context.
 */
const HISTORY_LINES = 500;

/**
 * The most bytes read off the end of a history file to find those lines. History files grow
 * without bound; reading a whole one to use its last 500 lines would put a multi-megabyte read on
 * the path of every `/waybill:bay`.
 */
const HISTORY_TAIL_BYTES = 256 * 1024;

/** How long tmux is given to answer before the menu is drawn without it. */
const TMUX_TIMEOUT_MS = 1000;

/** `git checkout`/`git switch` flags whose next word is the branch being created. */
const CREATE_FLAGS = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan']);

/**
 * Strip one layer of matching quotes, which is all an interactive command line usually carries
 * around a branch name.
 *
 * @param {string} word
 * @returns {string}
 */
function unquote(word) {
  return /^(['"]).*\1$/.test(word) && word.length >= 2 ? word.slice(1, -1) : word;
}

/**
 * The branch one simple command names, if it names one.
 *
 * Deliberately shallow — words split on whitespace, no `git -C` or alias resolution. A missed
 * mention costs one row its promotion; a parser clever enough to read every shell construct would
 * cost far more than the ranking is worth. And every name returned here is only ever *matched
 * against* existing branches, so a false positive such as `git checkout src/file.js` finds nothing
 * to promote.
 *
 * @param {string[]} words
 * @returns {string|null}
 */
function branchIn(words) {
  const at = words.findIndex((word) => word === 'git' || word === 'waybill' || word === 'wyb');
  if (at === -1) return null;
  const [tool, verb, ...rest] = words.slice(at);
  const name = (word) => (word && !word.startsWith('-') ? word : null);

  if (tool !== 'git') {
    if (verb !== 'bay') return null;
    for (let index = 0; index < rest.length; index += 1) {
      if (rest[index] === '--bay-dir') index += 1;
      else if (!rest[index].startsWith('-')) return rest[index];
    }
    return null;
  }

  if (verb === 'checkout' || verb === 'switch') {
    return CREATE_FLAGS.has(rest[0]) ? name(rest[1]) : name(rest[0]);
  }
  // Only a bare `git branch <name>`: `-d`, `-D` and `-m` name a branch on its way *out*.
  if (verb === 'branch') return name(rest[0]);
  if (verb === 'worktree' && rest[0] === 'add') {
    const flag = rest.findIndex((word) => word === '-b' || word === '-B');
    return flag === -1 ? null : name(rest[flag + 1]);
  }
  return null;
}

/**
 * Every branch a shell history names, most recent first, each at most once.
 *
 * zsh's extended format prefixes each line with `: <epoch>:<duration>;`, which is stripped so the
 * command itself is what gets read; bash's plain format needs nothing. A line is split on `&&`,
 * `||`, `;` and `|` first, so `cd app && git switch -c feat/x` is read as the two commands it is.
 *
 * @param {string} text the history, oldest line first — the order both shells write it in
 * @returns {string[]}
 */
export function historyBranches(text) {
  /** @type {string[]} */
  const found = [];
  for (const line of text.split('\n').reverse()) {
    const command = line.replace(/^: \d+:\d+;/, '');
    const named = command
      .split(/&&|\|\||[;|]/)
      .map((segment) => branchIn(segment.trim().split(/\s+/).filter(Boolean).map(unquote)))
      .filter((branch) => branch !== null)
      .reverse();
    for (const branch of named) if (!found.includes(branch)) found.push(branch);
  }
  return found;
}

/**
 * The last {@link HISTORY_LINES} lines of the first history file that exists.
 *
 * `HISTFILE` first, when the environment carries one; otherwise zsh's default, then bash's. zsh
 * does not export `HISTFILE`, so from a `` ! `` line the defaults under `HOME` are what is
 * actually read — which is why they are there, and why `HOME` comes from `env` rather than from
 * `os.homedir()`: the tests hand in a `HOME` of their own.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function historyTail(env) {
  const home = env.HOME;
  const files = env.HISTFILE
    ? [env.HISTFILE]
    : home
      ? [path.join(home, '.zsh_history'), path.join(home, '.bash_history')]
      : [];

  for (const file of files) {
    let fd;
    try {
      fd = fs.openSync(file, 'r');
    } catch {
      continue;
    }
    try {
      const size = fs.fstatSync(fd).size;
      const length = Math.min(size, HISTORY_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      const lines = buffer.toString('utf8').split('\n');
      // A read that started mid-file started mid-line; that first fragment is not a command.
      if (length < size) lines.shift();
      return lines.slice(-HISTORY_LINES - 1).join('\n');
    } catch {
      return '';
    } finally {
      fs.closeSync(fd);
    }
  }
  return '';
}

/**
 * This pane's session name, window name and pane title, or `null` outside tmux or when tmux does
 * not answer in time.
 *
 * `TMUX_PANE` targets the pane this process was started in. Without it `display-message` answers
 * for whichever pane the client is looking at, which is the wrong one whenever the operator has
 * moved on while the command runs.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {TmuxNames|null}
 */
function tmuxNames(env) {
  if (!env.TMUX) return null;
  const target = env.TMUX_PANE ? ['-t', env.TMUX_PANE] : [];
  const result = spawnSync(
    'tmux',
    ['display-message', '-p', ...target, '#{session_name}\t#{window_name}\t#{pane_title}'],
    { env, encoding: 'utf8', timeout: TMUX_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (result.error || result.status !== 0) return null;
  const [session = '', window = '', pane = ''] = result.stdout.replace(/\n$/, '').split('\t');
  return { session, window, pane };
}

/**
 * Everything the terminal says, read once.
 *
 * `env` is a parameter rather than `process.env` read directly, so a test can hand in a `PATH`
 * with a stub `tmux` and a `HOME` with a history of its own without touching the real process.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Signals}
 */
export function gatherSignals(env = process.env) {
  return { tmux: tmuxNames(env), history: historyBranches(historyTail(env)) };
}
