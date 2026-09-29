import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

import { runLive } from '../src/live.js';
import { BAR_WIDTH, bar } from '../src/fleet-dash.js';
import { LEGS } from '../src/legs.js';

/**
 * What the first frame costs is asserted as an *ordering* wherever an ordering will say it: the
 * first write must reach the surface before the slow lane resolves, which is the property the
 * contract's 500ms target exists to protect and the only one that holds on a loaded machine.
 *
 * The wall-clock ceiling below is the backstop for the other half — the work that is *not* deferred.
 * It is deliberately an order of magnitude above what the render costs, because a threshold tight
 * enough to catch a regression in a pure string builder is a threshold that fails in CI for reasons
 * that have nothing to do with this repository.
 */

const NOW = 1_780_000_000;

const HOUR = 3600;
const DAY = 24 * HOUR;

/** The contract's target: the first frame, ten dockets across three repositories, under this. */
const FIRST_PAINT_MS = 500;

/** @returns {Promise<void>} */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A scheduler that never fires: these tests are about the first frame, not the cadence. */
const idleSchedule = () => () => {};

/**
 * @param {string} branch
 * @param {(() => Promise<object|null>)|null} pending
 * @returns {import('../src/fleet.js').Docket}
 */
function docket(branch, pending) {
  return {
    branch,
    path: `/bays/${branch.replace(/\//g, '-')}`,
    state: {
      leg: 'execute',
      index: 5,
      completed: [],
      skipped: [],
      progress: null,
      progressPending: pending,
      branch,
      docketOpen: true,
      changeId: null,
      warnings: [],
    },
    openedAt: NOW - 4 * DAY,
    idleAt: NOW - 6 * HOUR,
    stackedOn: null,
    pane: null,
    activity: null,
  };
}

/**
 * Ten dockets spread across three repositories — the shape the contract states its target for.
 *
 * @param {(branch:string) => (() => Promise<object|null>)|null} pending
 * @returns {import('../src/scan.js').FleetModel}
 */
function fleetOfTen(pending) {
  const names = ['alpha', 'beta', 'gamma'];
  const repos = names.map((name, index) => ({
    root: `/projects/${name}`,
    name,
    trunk: 'main',
    bookings: new Map(),
    dockets: Array.from({ length: index === 0 ? 4 : 3 }, (_, n) => {
      const branch = `feat/${name}-${n}`;
      return docket(branch, pending(branch));
    }),
    warnings: [],
  }));
  return { root: '/projects', inRepo: false, scanned: 3, repos, tmuxAvailable: false, psAvailable: false };
}

/**
 * @param {{scan:() => import('../src/scan.js').FleetModel, out:(text:string)=>void}} options
 * @returns {{code:Promise<number>, stdin:PassThrough}}
 */
function start(options) {
  const stdin = new PassThrough();
  const code = runLive(
    '/projects',
    { scan: options.scan, schedule: idleSchedule },
    {
      out: options.out,
      err: () => {},
      now: () => NOW,
      isTTY: true,
      stdin,
      signals: () => ({ tmux: null, history: [] }),
    },
  );
  return { code, stdin };
}

describe('the first frame', () => {
  it('is written before the slow lane resolves, not after it', async () => {
    /** @type {string[]} */
    const order = [];
    /** @type {(() => void)[]} */
    const releases = [];

    const session = start({
      scan: () =>
        fleetOfTen(
          () => () =>
            new Promise((resolve) => {
              order.push('slow-asked');
              releases.push(() => {
                order.push('slow-landed');
                resolve({ done: 4, total: 9, source: 'tasks-md', changeId: 'add-thing' });
              });
            }),
        ),
      out: (text) => {
        if (text.includes('FLEET')) order.push('first-paint');
      },
    });

    // Synchronously after the call, before anything has been given a chance to resolve.
    assert.deepEqual(order.slice(0, 1), ['first-paint'], order.join(','));
    assert.equal(order.includes('slow-landed'), false);

    await settle();
    for (const release of releases) release();
    await settle();

    assert.equal(releases.length, 10, 'every docket should have been asked exactly once');
    assert.ok(order.indexOf('first-paint') < order.indexOf('slow-landed'), order.join(','));

    session.stdin.write('q');
    assert.equal(await session.code, 0);
  });

  it('carries whole-leg bars, so nothing waits on a task count that has not arrived', async () => {
    /** @type {string[]} */
    const writes = [];
    const count = { done: 1, total: 9, source: 'tasks-md', changeId: 'x' };
    const session = start({
      scan: () => fleetOfTen(() => async () => count),
      out: (text) => writes.push(text),
    });

    // Derived rather than written out as literal bars: the whole-leg and interpolated forms only
    // differ at some leg counts, and at eight legs `4 of 9` at leg 5 truncates to the same cell as
    // no count at all. A literal pattern would then match either frame and this would pass on a
    // first frame that had waited. The guard fails loudly if the fixture stops discriminating.
    const wholeLeg = bar(5, LEGS.length, null, BAR_WIDTH);
    const interpolated = bar(5, LEGS.length, count, BAR_WIDTH);
    assert.notEqual(wholeLeg, interpolated, 'the fixture no longer tells the two bar forms apart');

    const first = writes.join('');
    // Mutually exclusive by the guard above, so each one rules the other out.
    assert.ok(first.includes(wholeLeg), first);
    assert.equal(first.includes(interpolated), false, 'the first frame waited for a task count');

    await settle();
    assert.ok(writes.join('').includes(interpolated), 'the count never filled in');

    session.stdin.write('q');
    assert.equal(await session.code, 0);
  });

  it('is on the surface well inside the target, with the slow lane still outstanding', async () => {
    /** @type {number|null} */
    let painted = null;
    const began = performance.now();

    const session = start({
      scan: () => fleetOfTen(() => () => new Promise(() => {})),
      out: (text) => {
        if (text.includes('FLEET')) painted ??= performance.now() - began;
      },
    });

    assert.notEqual(painted, null, 'nothing was painted at all');
    assert.ok(painted < FIRST_PAINT_MS, `first paint took ${painted}ms, over the ${FIRST_PAINT_MS}ms target`);

    session.stdin.write('q');
    assert.equal(await session.code, 0);
  });
});
