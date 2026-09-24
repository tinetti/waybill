import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { KNOWN_AGENTS, activityFor, childIndex, snapshot } from '../src/procs.js';
import { scanFleet } from '../src/scan.js';
import {
  addWorktree,
  cleanupAll,
  createRepo,
  pathWithout,
  stubBin,
  tempRoot,
  withEnv,
  withPath,
} from './helpers/repo-fixture.js';

after(cleanupAll);

/** The pane's own process, which every tree here hangs off. */
const PANE_PID = 100;

/**
 * One `ps -eo pid=,ppid=,comm=,args=` line, padded the way ps pads its numeric columns.
 *
 * @param {number} pid
 * @param {number} ppid
 * @param {string} comm
 * @param {string} [args] defaults to `comm` alone, which is what an argument-less process prints
 * @returns {string}
 */
function proc(pid, ppid, comm, args) {
  return `${String(pid).padStart(6)} ${String(ppid).padStart(6)} ${comm} ${args ?? comm}`;
}

/**
 * A `PATH` whose `ps` prints `rows` and from which the real ps has been removed, so the machine's
 * own process table cannot answer an assertion about a stubbed one.
 *
 * @param {string[]} rows
 * @param {string} [script] a whole stub body, replacing the rows — for the failure cases
 * @returns {string}
 */
function stubPs(rows, script) {
  const body = script ?? (rows.length === 0 ? 'exit 0' : `printf '%s\\n' ${rows.map((line) => `'${line}'`).join(' ')}`);
  return `${stubBin('ps', body)}${path.delimiter}${pathWithout('ps')}`;
}

/**
 * The activity a stubbed process table reports for the pane at {@link PANE_PID}.
 *
 * @param {string[]} rows
 * @returns {import('../src/procs.js').Activity}
 */
function activity(rows) {
  const procs = withPath(stubPs(rows), () => snapshot());
  return activityFor(PANE_PID, childIndex(procs));
}

/** The pane shell every tree starts from. */
const shell = proc(PANE_PID, 1, 'zsh', '-zsh');

describe('snapshot', () => {
  it('parses pid, ppid, comm and the whole remaining args', () => {
    const procs = withPath(stubPs([proc(101, PANE_PID, 'node', '/usr/bin/node --test tests/ --watch')]), () => snapshot());

    assert.deepEqual(procs, [
      { pid: 101, ppid: PANE_PID, comm: 'node', args: '/usr/bin/node --test tests/ --watch' },
    ]);
  });

  it('drops a line truncated before its args and keeps the rest', () => {
    const procs = withPath(stubPs(['   777    1', 'nonsense', proc(101, PANE_PID, 'zsh')]), () => snapshot());

    assert.deepEqual(procs.map((entry) => entry.pid), [101]);
  });

  it('keeps a process that has no args at all, rather than breaking the chain below it', () => {
    const procs = withPath(stubPs([`   101 ${String(PANE_PID).padStart(6)} defunct`]), () => snapshot());

    assert.deepEqual(procs, [{ pid: 101, ppid: PANE_PID, comm: 'defunct', args: '' }]);
  });

  it('is empty rather than throwing when ps is not installed', () => {
    assert.deepEqual(withPath(pathWithout('ps'), () => snapshot()), []);
  });

  it('runs ps under the environment it is handed, not the one this process is running under', () => {
    const procs = snapshot({ PATH: stubPs([proc(101, PANE_PID, 'handed')]) });

    assert.deepEqual(procs.map((entry) => entry.comm), ['handed']);
  });

  it('is empty rather than throwing when ps exits non-zero', () => {
    assert.deepEqual(withPath(stubPs([], 'exit 1'), () => snapshot()), []);
  });
});

describe('activityFor', () => {
  it('is null for a pane holding nothing but a shell', () => {
    assert.equal(activity([shell, proc(101, PANE_PID, 'zsh')]), null);
  });

  it('is null for a pane whose pid no longer has any descendant at all', () => {
    assert.equal(activity([shell]), null);
  });

  it('names a known agent running under the pane', () => {
    assert.deepEqual(activity([shell, proc(101, PANE_PID, 'claude', 'claude --resume 0293feef')]), {
      kind: 'agent',
      name: 'claude',
    });
  });

  it('names an agent whose comm is node but whose argv[0] is the agent entry point', () => {
    const tree = [shell, proc(101, PANE_PID, 'node', '/Users/dev/.local/bin/codex --model gpt')];

    assert.deepEqual(activity(tree), { kind: 'agent', name: 'codex' });
  });

  it('does not call a shell running `grep claude foo.txt` an agent', () => {
    const tree = [shell, proc(101, PANE_PID, 'grep', 'grep claude foo.txt')];

    assert.deepEqual(activity(tree), { kind: 'busy', command: 'grep' }, 'a substring of args is not a process');
  });

  it('reports the command the operator invoked when a long run is under way', () => {
    const tree = [
      shell,
      proc(101, PANE_PID, 'npm', 'npm test'),
      proc(102, 101, 'node', '/usr/bin/node --test tests/'),
    ];

    assert.deepEqual(activity(tree), { kind: 'busy', command: 'npm' });
  });

  it('prefers an agent deep in the tree over a busy process right under the pane', () => {
    const tree = [
      shell,
      proc(101, PANE_PID, 'npm', 'npm test'),
      proc(102, 101, 'zsh', 'zsh -c claude'),
      proc(103, 102, 'claude', 'claude'),
    ];

    assert.deepEqual(activity(tree), { kind: 'agent', name: 'claude' });
  });

  it('never reports the pane process itself as its own activity', () => {
    assert.equal(activity([proc(PANE_PID, 1, 'claude', 'claude')]), null);
  });

  it('stops at the depth cap rather than walking a pathological tree to its end', () => {
    const deep = [shell];
    for (let level = 1; level <= 20; level += 1) {
      deep.push(proc(PANE_PID + level, PANE_PID + level - 1, level === 12 ? 'claude' : 'worker'));
    }

    assert.deepEqual(
      activity(deep),
      { kind: 'busy', command: 'worker' },
      'an agent below the cap is out of reach, which is the cost of the cap being real',
    );
  });

  it('terminates on a process table that repeats a pid, rather than walking the loop it implies', () => {
    const tree = [shell, proc(101, PANE_PID, 'worker'), proc(102, 101, 'worker'), proc(101, 102, 'worker')];

    assert.deepEqual(activity(tree), { kind: 'busy', command: 'worker' });
  });

  it('is null when ps said nothing, which is not the same as nothing running', () => {
    assert.equal(activityFor(PANE_PID, childIndex([])), null);
  });
});

describe('KNOWN_AGENTS', () => {
  it('names the coding agents a bay is opened for', () => {
    assert.ok(KNOWN_AGENTS.includes('claude'));
    assert.deepEqual([...KNOWN_AGENTS].sort(), [...KNOWN_AGENTS], 'kept sorted so an addition is a one-line diff');
  });
});

describe('docket decoration', () => {
  /**
   * A `PATH` carrying both stubs, since a scan asks tmux where the panes are before it asks ps what
   * is in them.
   *
   * @param {string} bay
   * @param {string[]} rows the process table
   * @returns {string}
   */
  function stubBoth(bay, rows) {
    const pane = ['work', '0', 'shell', '%1', String(PANE_PID), bay, 'zsh'].join('\t');
    const tmux = stubBin('tmux', `printf '%s\\n' '${pane}'`);
    const ps = stubBin('ps', rows.length === 0 ? 'exit 1' : `printf '%s\\n' ${rows.map((line) => `'${line}'`).join(' ')}`);
    // Both stubs shadow the real binaries rather than removing them, which is enough here: every
    // assertion is about what the stub said, and neither real binary is ever reached.
    return [tmux, ps, process.env.PATH].join(path.delimiter);
  }

  /**
   * @param {string} cwd
   * @returns {ReturnType<typeof scanFleet>}
   */
  function scan(cwd) {
    return withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(cwd));
  }

  it('hangs the agent running in a bay off that docket', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    const bay = addWorktree(repo, 'feat/one');
    const stub = stubBoth(bay, [shell, proc(101, PANE_PID, 'claude', 'claude')]);

    const model = withPath(stub, () => scan(repo));

    assert.equal(model.psAvailable, true);
    assert.deepEqual(model.repos[0].dockets[0].activity, { kind: 'agent', name: 'claude' });
  });

  it('reports ps unavailable rather than calling every bay idle', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    const bay = addWorktree(repo, 'feat/one');

    const model = withPath(stubBoth(bay, []), () => scan(repo));

    assert.equal(model.psAvailable, false);
    assert.equal(model.repos[0].dockets[0].activity, null);
    assert.notEqual(model.repos[0].dockets[0].pane, null, 'the pane is still known; only what is in it is not');
  });

  it('leaves activity blank for a docket with no pane, without asking about a pid it does not have', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    const bay = addWorktree(repo, 'feat/one');
    addWorktree(repo, 'feat/two');
    const stub = stubBoth(bay, [shell, proc(101, PANE_PID, 'claude', 'claude')]);

    const model = withPath(stub, () => scan(repo));
    const byBranch = new Map(model.repos[0].dockets.map((docket) => [docket.branch, docket]));

    assert.equal(byBranch.get('feat/two').pane, null);
    assert.equal(byBranch.get('feat/two').activity, null);
  });
});
