import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveLeg } from '../src/inference.js';
import { BUILTIN_BOOKINGS, loadBookings } from '../src/bookings.js';
import { LEGS } from '../src/legs.js';
import { scanFleet } from '../src/scan.js';
import {
  addWorktree,
  cleanupAll,
  createRepo,
  git,
  pathWithout,
  stubBin,
  tempRoot,
  withEnv,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';
import { CHANGE_ID, executeFixture } from './fixtures/execute.js';
import { specsFixture } from './fixtures/specs.js';

after(cleanupAll);

const KNOWN_LEGS = LEGS.map((leg) => leg.id);

/** A `PATH` with the real openspec CLI removed, so a developer's install cannot decide a result. */
const absent = () => pathWithout('openspec');

/**
 * `withPath` restores the variable the moment its callback *returns*, which is before an awaited
 * promise settles — and the deferred lane spawns its subprocess after the turn. So the stub has to
 * stay on `PATH` across the await.
 *
 * @template T
 * @param {string} value
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withPathAsync(value, fn) {
  const previous = process.env.PATH;
  process.env.PATH = value;
  try {
    return await fn();
  } finally {
    process.env.PATH = previous;
  }
}

/**
 * A stub `openspec` answering `--version`, then running `script` for every other invocation.
 *
 * @param {string} script
 * @returns {string} a `PATH` with the stub first and the real CLI removed
 */
function stubPath(script) {
  const dir = stubBin('openspec', ['if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi', script].join('\n'));
  return `${dir}${path.delimiter}${absent()}`;
}

const listJson = (rows) => `echo '${JSON.stringify({ changes: rows, root: { path: '.', source: 'x' } })}'`;

describe('FleetModel', () => {
  it('reports the scan root, the repositories under it, and how many were scanned', () => {
    const root = tempRoot();
    const repo = createRepo({ root, name: 'alpha' });
    addWorktree(repo, 'feat/one');

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(root, { depth: 1 }));

    assert.deepEqual(Object.keys(model).sort(), [
      'inRepo',
      'psAvailable',
      'repos',
      'root',
      'scanned',
      'tmuxAvailable',
    ]);
    assert.equal(model.root, root);
    assert.equal(model.inRepo, false);
    assert.equal(model.scanned, 1);
    // Whether either source answered depends on the machine the suite runs on — a developer inside
    // tmux and a CI container disagree — so only the shape is asserted here. What the flags *mean*
    // is pinned against stubs in `fleet-dash-signals` and `fleet-dash-agent`.
    assert.equal(typeof model.tmuxAvailable, 'boolean');
    assert.equal(typeof model.psAvailable, 'boolean');

    const [entry] = model.repos;
    assert.deepEqual(Object.keys(entry).sort(), ['bookings', 'dockets', 'name', 'root', 'trunk', 'warnings']);
    assert.equal(entry.root, repo);
    assert.equal(entry.name, 'alpha');
    assert.equal(entry.trunk, 'main');
    assert.equal(entry.bookings.get('execute').command, '/spec:apply');
    assert.deepEqual(entry.dockets.map((docket) => docket.branch), ['feat/one']);
    assert.deepEqual(entry.warnings, []);
  });

  it('says it was inside a repository when the operator was standing in one', () => {
    const repo = createRepo();
    addWorktree(repo, 'feat/one');

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(repo));

    assert.equal(model.inRepo, true);
    assert.deepEqual(model.repos.map((entry) => entry.root), [repo]);
  });

  it('falls back to the built-in bookings for a repository whose overlay is malformed', () => {
    const root = tempRoot();
    const repo = createRepo({ root, name: 'broken' });
    addWorktree(repo, 'feat/one');
    writeFile(path.join(repo, '.waybill', 'bookings', 'bad.md'), '---\nleg: contract\n---\nno command\n');
    git(repo, ['config', 'waybill.bookingsdir', '.waybill/bookings']);

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(root, { depth: 1 }));
    const [entry] = model.repos;

    assert.equal(entry.bookings.get('contract').command, '/ideation:ideation');
    assert.equal(entry.warnings.length, 1);
    assert.match(entry.warnings[0], /bookings/);
  });
});

describe('deferred execute progress', () => {
  it('leaves the synchronous path exactly as it was', () => {
    const state = withPath(absent(), () => resolveLeg(executeFixture().dir));

    assert.equal(state.leg, 'execute');
    assert.deepEqual(state.progress, { done: 1, total: 3, source: 'tasks-md', changeId: CHANGE_ID });
    assert.equal(state.progressPending, undefined);
  });

  it('returns no progress and a pending thunk when asked to defer', () => {
    const state = withPath(absent(), () => resolveLeg(executeFixture().dir, undefined, { deferProgress: true }));

    assert.equal(state.leg, 'execute');
    assert.equal(state.progress, null);
    assert.equal(typeof state.progressPending, 'function');
  });

  it('attaches no thunk on a leg that has no progress to report', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/one');

    const state = withPath(absent(), () => resolveLeg(bay, undefined, { deferProgress: true }));

    assert.notEqual(state.leg, 'execute');
    assert.equal(state.progressPending, null);
  });

  it('resolves the thunk to the value the synchronous path produces', async () => {
    const stub = stubPath(listJson([{ name: CHANGE_ID, completedTasks: 5, totalTasks: 9 }]));

    const synchronous = withPath(stub, () => resolveLeg(executeFixture().dir)).progress;
    const deferred = await withPathAsync(stub, () => {
      const state = resolveLeg(executeFixture().dir, undefined, { deferProgress: true });
      return state.progressPending();
    });

    assert.deepEqual(synchronous, { done: 5, total: 9, source: 'openspec', changeId: CHANGE_ID });
    assert.deepEqual(deferred, synchronous);
  });

  it('spawns nothing while the leg walk runs', () => {
    const sentinel = path.join(tempRoot(), 'openspec-ran');
    const stub = stubPath(`touch ${sentinel}\n${listJson([{ name: CHANGE_ID, completedTasks: 5, totalTasks: 9 }])}`);

    withPath(stub, () => resolveLeg(executeFixture().dir, undefined, { deferProgress: true }));

    assert.equal(fs.existsSync(sentinel), false, 'deferring must not pay for the subprocess anyway');
  });

  it('resolves to null rather than throwing when the CLI fails and nothing is on disk', async () => {
    // Bookings that put the docket at `execute` with no change of its own on disk — the only way
    // to reach the leg with nothing for either source to count.
    const bookings = new Map([
      ...loadBookings(BUILTIN_BOOKINGS, { knownLegs: KNOWN_LEGS }),
      [
        'specs',
        {
          leg: 'specs',
          command: '/s',
          model: 'm',
          stampPath: 'docs/ideation/*/contract.md',
          body: '',
          path: '<specs>',
        },
      ],
      ['execute', { leg: 'execute', command: '/e', model: 'm', stampCmd: 'exit 1', body: '', path: '<execute>' }],
    ]);
    const stub = stubPath('exit 1');

    const deferred = await withPathAsync(stub, () => {
      const state = resolveLeg(specsFixture().dir, bookings, { deferProgress: true });
      assert.equal(state.leg, 'execute');
      assert.equal(state.changeId, null);
      return state.progressPending();
    });

    assert.equal(deferred, null);
  });

  it('memoizes the thunk so a refresh does not spawn a second lookup', async () => {
    const stub = stubPath(listJson([{ name: CHANGE_ID, completedTasks: 5, totalTasks: 9 }]));

    await withPathAsync(stub, async () => {
      const state = resolveLeg(executeFixture().dir, undefined, { deferProgress: true });
      const first = state.progressPending();
      assert.equal(state.progressPending(), first, 'a second call must reuse the first promise');
      assert.deepEqual(await first, { done: 5, total: 9, source: 'openspec', changeId: CHANGE_ID });
    });
  });
});
