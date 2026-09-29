import { spawnSync } from 'node:child_process';

/**
 * What is running inside a pane, read from the process tree rather than from the pane.
 *
 * tmux's own `#{pane_current_command}` answers with the pane's foreground process, which for an
 * agent started from a shell is `node` — a word so uninformative that `picker.js` already lists it,
 * with `claude`, `codex` and `aider`, among the names it refuses to draw a conclusion from. The
 * honest answer is one level down: take the pane's pid, take one snapshot of the machine's process
 * table, and walk the descendants.
 *
 * Two tiers, and the difference between them matters. A known agent is *named*, because "claude is
 * running here" is the fact the fleet view exists to show. Anything else is reported by command,
 * because "a test run is happening in this bay" and "this bay is idle" are different situations and
 * a dashboard that renders them identically has lost the more useful half.
 */

/** @typedef {{pid:number, ppid:number, comm:string, args:string}} Proc */

/**
 * @typedef {{kind:'agent', name:string} | {kind:'busy', command:string} | null} Activity
 *   `null` is "nothing is running here" *and* "we could not look" — the two are told apart by the
 *   model's `psAvailable`, because the renderer must be able to omit the column entirely rather
 *   than print a blank that reads as an answer.
 */

/**
 * The agents worth naming.
 *
 * Extrapolated from the denylist at `src/picker.js:70-75` — the names that arrive as window titles
 * and pane commands often enough to be worth suppressing there are the ones worth recognising here.
 * Kept sorted so adding one is a one-line diff.
 */
export const KNOWN_AGENTS = ['aider', 'claude', 'codex', 'cursor-agent', 'gemini', 'opencode'];

/**
 * Shells, which are where a pane sits when nothing is happening in it.
 *
 * A shell is never the answer: it is the thing the answer would be running under.
 */
const SHELLS = new Set(['bash', 'fish', 'sh', 'zsh']);

/**
 * How far below a pane the walk descends.
 *
 * Every real tree is two or three deep — shell, tool, the tool's worker. The cap is a guard against
 * a process table that describes something pathological, not a tuning knob: a scan that stalls
 * walking one bay has failed at the one thing a dashboard is for.
 */
const MAX_DEPTH = 8;

/**
 * `pid ppid comm args...`, with `args` taking everything left on the line.
 *
 * `args` is optional because a defunct process has none, and dropping one would break the chain
 * between a pane and whatever is still running below it.
 */
const PS_LINE = /^\s*(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*\S))?\s*$/;

/**
 * The last path segment of a command, as the name to match on.
 *
 * A login shell is `-zsh` rather than `zsh`, and macOS truncates `comm` to a fixed width, so a long
 * path can arrive ending in its own separator — both spellings resolve to nothing useful unless
 * they are handled here.
 *
 * @param {string} command
 * @returns {string} empty when there is no segment left to name
 */
function basename(command) {
  const last = command.replace(/\/+$/, '').split('/').pop() ?? '';
  return last.startsWith('-') ? last.slice(1) : last;
}

/**
 * The names one process answers to: its `comm`, and the `argv[0]` its args begin with.
 *
 * Both, because neither alone is enough. `comm` is the executable, which for an agent launched
 * through node is `node`; `argv[0]` is what was invoked, which is the agent. And *only* these two —
 * never a substring of the whole args string, which would read `grep claude foo.txt` as an agent
 * and say so with the same confidence as the real thing.
 *
 * @param {Proc} proc
 * @returns {string[]}
 */
function names(proc) {
  return [basename(proc.comm), basename(proc.args.split(/\s+/)[0] ?? '')].filter((name) => name !== '');
}

/**
 * One snapshot of the machine's process table.
 *
 * One call for the whole fleet, not one per pane: the cost of knowing what is running everywhere is
 * a constant, and it has to be, because the alternative is a `ps` per docket.
 *
 * @param {NodeJS.ProcessEnv} [env] a parameter for the same reason `listPanes` takes one: so a test
 *   can hand in a `PATH` with a stub `ps` without touching the real process
 * @returns {Proc[]} empty when ps is absent, denied or fails — the caller reports that as "could
 *   not look", which is a different answer from "nothing is running"
 */
export function snapshot(env = process.env) {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], {
    env,
    encoding: 'utf8',
    // A process table is megabytes on a busy machine, and the default cap would truncate it.
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) return [];

  /** @type {Proc[]} */
  const procs = [];
  for (const line of result.stdout.split('\n')) {
    const match = PS_LINE.exec(line);
    // A line ps truncated mid-write describes no process; the rest of the table still does.
    if (match === null) continue;
    procs.push({ pid: Number(match[1]), ppid: Number(match[2]), comm: match[3], args: match[4] ?? '' });
  }
  return procs;
}

/**
 * The process table indexed by parent, which is the only direction the walk reads it in.
 *
 * @param {Proc[]} procs
 * @returns {Map<number, Proc[]>} pid -> its children, in the order ps listed them
 */
export function childIndex(procs) {
  /** @type {Map<number, Proc[]>} */
  const children = new Map();
  for (const proc of procs) {
    const siblings = children.get(proc.ppid);
    if (siblings === undefined) children.set(proc.ppid, [proc]);
    else siblings.push(proc);
  }
  return children;
}

/**
 * What is running under the pane at `panePid`.
 *
 * Breadth-first and bounded, which decides both answers it can give. An agent anywhere in reach
 * wins, however deep, because that is the fact worth reporting. Failing that, the *shallowest*
 * non-shell descendant is the command the operator actually invoked — `npm test` rather than the
 * `node` it spawned — which is the more legible label for the same activity.
 *
 * The pane's own process is not a candidate: a pane is not busy with being a pane.
 *
 * @param {number} panePid
 * @param {Map<number, Proc[]>} index from {@link childIndex}
 * @returns {Activity}
 */
export function activityFor(panePid, index) {
  /** @type {Proc[]} */
  let level = index.get(panePid) ?? [];
  /** Pids already walked, so a table that repeats a pid cannot describe a loop. @type {Set<number>} */
  const visited = new Set([panePid]);
  /** The shallowest non-shell seen so far, as the command to report. @type {string|null} */
  let busiest = null;

  for (let depth = 1; depth <= MAX_DEPTH && level.length > 0; depth += 1) {
    /** @type {Proc[]} */
    const next = [];
    for (const proc of level) {
      if (visited.has(proc.pid)) continue;
      visited.add(proc.pid);

      const spellings = names(proc);
      const agent = spellings.find((name) => KNOWN_AGENTS.includes(name));
      if (agent !== undefined) return { kind: 'agent', name: agent };
      if (busiest === null && !spellings.some((name) => SHELLS.has(name))) busiest = spellings[0] ?? null;

      next.push(...(index.get(proc.pid) ?? []));
    }
    level = next;
  }

  return busiest === null ? null : { kind: 'busy', command: busiest };
}
