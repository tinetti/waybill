import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import { BAR_WIDTH, bar, humanAge, renderFleetDashboard } from '../src/fleet-dash.js';
import { assertGolden } from './helpers/repo-fixture.js';

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

/** A fixed clock. Every age in this suite is stated as a distance back from it. */
const NOW = 1_780_000_000;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * One docket, shaped exactly as `src/scan.js` hands it over.
 *
 * Built longhand rather than through a fixture repository: the renderer is pure, so a synthetic
 * model is the whole input, and driving git to produce one would only make the suite slower and
 * the intent harder to read.
 *
 * @param {string} branch
 * @param {{index:number, leg:string|null, opened?:number|null, idle?:number|null,
 *          progress?:{done:number,total:number}|null, stackedOn?:string|null,
 *          pane?:{session:string,windowIndex:string,windowName:string}|null,
 *          activity?:import('../src/procs.js').Activity}} fields
 * @returns {import('../src/fleet.js').Docket}
 */
function docket(branch, fields) {
  const {
    index,
    leg,
    opened = NOW - 4 * DAY,
    idle = NOW - 6 * HOUR,
    progress = null,
    stackedOn = null,
    pane = null,
    activity = null,
  } = fields;
  return {
    branch,
    path: `/bays/${branch.replace(/\//g, '-')}`,
    state: {
      leg,
      index,
      completed: [],
      skipped: [],
      progress,
      branch,
      docketOpen: true,
      changeId: null,
      warnings: [],
    },
    openedAt: opened,
    idleAt: idle,
    stackedOn,
    pane,
    activity,
  };
}

/**
 * @param {string} name
 * @param {import('../src/fleet.js').Docket[]} dockets
 * @param {string[]} [warnings]
 * @returns {import('../src/scan.js').RepoFleet}
 */
function repo(name, dockets, warnings = []) {
  return { root: `/projects/${name}`, name, trunk: 'main', bookings: new Map(), dockets, warnings };
}

/**
 * @param {import('../src/scan.js').RepoFleet[]} repos
 * @param {{scanned?:number, tmux?:boolean, ps?:boolean, inRepo?:boolean}} [options]
 * @returns {import('../src/scan.js').FleetModel}
 */
function model(repos, options = {}) {
  const { scanned = repos.length, tmux = true, ps = true, inRepo = false } = options;
  return { root: '/projects', inRepo, scanned, repos, tmuxAvailable: tmux, psAvailable: ps };
}

/** @param {string} frame @param {string} heading @returns {string[]} */
const rowsUnder = (frame, heading) => {
  const lines = frame.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `no \`${heading}\` line in:\n${frame}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line === '' || /^\S/.test(line) || /^ {2}\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
};

/** The column header row, wherever it is. @param {string} frame @returns {string} */
const headerRow = (frame) => frame.split('\n').find((line) => line.includes('DOCKET')) ?? '';

describe('humanAge', () => {
  it('walks the m/h/d/w ladder at each boundary', () => {
    /** @type {[number, string][]} */
    const cases = [
      [0, '0m'],
      [59, '0m'],
      [60, '1m'],
      [90, '1m'],
      [59 * MINUTE + 59, '59m'],
      [HOUR, '1h'],
      [90 * MINUTE, '1h'],
      [23 * HOUR + 59 * MINUTE, '23h'],
      [DAY, '1d'],
      [90 * HOUR, '3d'],
      [27 * DAY + 23 * HOUR, '27d'],
      [28 * DAY, '4w'],
      [90 * DAY, '12w'],
    ];
    for (const [ago, expected] of cases) {
      assert.equal(humanAge(NOW - ago, NOW), expected, `${ago}s ago`);
    }
  });

  it('dashes an age that was never resolved, rather than printing NaN', () => {
    for (const absent of [null, undefined, Number.NaN]) {
      assert.equal(humanAge(absent, NOW), '–');
    }
  });

  it('reads a tip dated in the future as no age at all', () => {
    // Clock skew between the machine that committed and the machine rendering. `-3h` in an age
    // column would be read as a bug in waybill rather than as one in somebody's clock.
    assert.equal(humanAge(NOW + 3 * HOUR, NOW), '0m');
  });
});

describe('bar', () => {
  it('fills leg index of seven', () => {
    assert.equal(bar(0, 7, null, 11), '░'.repeat(11));
    assert.equal(bar(7, 7, null, 11), '█'.repeat(11));
    assert.equal([...bar(5, 7, null, 11)].filter((cell) => cell === '█').length, 7);
  });

  it('interpolates the execute leg by its task count', () => {
    // 4 of 9 tasks on leg 6 reads as 5.44 of 7, which is visibly short of the 6 of 7 that the
    // whole-leg fill would claim — the difference this test exists for.
    const interpolated = bar(6, 7, { done: 4, total: 9 }, 11);
    const wholeLeg = bar(6, 7, null, 11);
    assert.notEqual(interpolated, wholeLeg);
    assert.ok(
      [...interpolated].filter((cell) => cell === '█').length <
        [...wholeLeg].filter((cell) => cell === '█').length,
    );
  });

  it('falls back to the whole leg when the count never arrived', () => {
    // `total: 0` is what a deferred or openspec-less lookup answers with. Treating it as 0-of-N
    // would draw a docket days into execute as barely started.
    assert.equal(bar(6, 7, { done: 0, total: 0 }, 11), bar(6, 7, null, 11));
  });

  it('never overruns its width, however the count arrives', () => {
    for (const progress of [{ done: 9, total: 9 }, { done: 12, total: 9 }, { done: -1, total: 9 }]) {
      const drawn = bar(6, 7, progress, 11);
      assert.equal([...drawn].length, 11, JSON.stringify(progress));
      assert.match(drawn, /^█*░*$/);
    }
  });
});

describe('renderFleetDashboard', () => {
  it('is a pure function of the model and the clock', () => {
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])]);
    assert.equal(renderFleetDashboard(fleet, NOW), renderFleetDashboard(fleet, NOW));
    // And the clock genuinely is the parameter: a renderer reaching for `Date.now()` would answer
    // the same for both of these.
    assert.notEqual(renderFleetDashboard(fleet, NOW), renderFleetDashboard(fleet, NOW + 40 * DAY));
  });

  it('heads the frame with the counts, including what was scanned and dropped', () => {
    const fleet = model(
      [
        repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })]),
        repo('emre-team', [docket('fix/b', { index: 3, leg: 'refine' })]),
      ],
      { scanned: 34 },
    );
    assert.equal(renderFleetDashboard(fleet, NOW).split('\n')[0], 'FLEET  2 dockets · 2 repos · 34 scanned');
  });

  it('says it in the singular for one of each', () => {
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])], { scanned: 1 });
    assert.equal(renderFleetDashboard(fleet, NOW).split('\n')[0], 'FLEET  1 docket · 1 repo · 1 scanned');
  });

  it('prints the column header exactly once, above the first repo group', () => {
    const fleet = model([
      repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })]),
      repo('emre-team', [docket('fix/b', { index: 3, leg: 'refine' })]),
    ]);
    const lines = renderFleetDashboard(fleet, NOW).split('\n');
    const headers = lines.filter((line) => line.includes('DOCKET') && line.includes('ACTIVITY'));
    assert.equal(headers.length, 1, lines.join('\n'));
    assert.ok(lines.indexOf(headers[0]) < lines.indexOf('  waybill'));
  });

  it('orders dockets most-idle first within a repo', () => {
    const fleet = model([
      repo('waybill', [
        docket('feat/fresh', { index: 5, leg: 'specs', idle: NOW - 10 * MINUTE }),
        docket('feat/stale', { index: 2, leg: 'bay', idle: NOW - 12 * DAY }),
        docket('feat/middling', { index: 4, leg: 'contract', idle: NOW - 2 * DAY }),
      ]),
    ]);
    assert.deepEqual(
      rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill').map((line) => line.trim().split(/\s+/)[0]),
      ['feat/stale', 'feat/middling', 'feat/fresh'],
    );
  });

  it('groups repos rather than interleaving them, most-stale repo first', () => {
    const fleet = model([
      repo('fresh-repo', [docket('feat/a', { index: 5, leg: 'specs', idle: NOW - HOUR })]),
      repo('stale-repo', [
        docket('feat/b', { index: 5, leg: 'specs', idle: NOW - 30 * DAY }),
        docket('feat/c', { index: 5, leg: 'specs', idle: NOW - MINUTE }),
      ]),
    ]);
    const body = renderFleetDashboard(fleet, NOW)
      .split('\n')
      .filter((line) => /^ {2}\S/.test(line) && !line.includes('DOCKET'));
    assert.deepEqual(body, ['  stale-repo', '  fresh-repo']);
  });

  it('nests a three-deep stack in dependency order, not staleness order', () => {
    // The child is the freshest of the three and the grandchild the stalest, so a subtree that
    // obeyed the staleness sort would come out exactly reversed.
    const fleet = model([
      repo('waybill', [
        docket('feat/base', { index: 5, leg: 'specs', idle: NOW - 3 * DAY }),
        docket('feat/child', { index: 3, leg: 'refine', idle: NOW - MINUTE, stackedOn: 'feat/base' }),
        docket('feat/grandchild', { index: 2, leg: 'bay', idle: NOW - 20 * DAY, stackedOn: 'feat/child' }),
      ]),
    ]);
    const rows = rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill');
    assert.deepEqual(rows.map((line) => line.slice(0, line.search(/[█░]/)).trim()), [
      'feat/base',
      '└ feat/child',
      '└ feat/grandchild',
    ]);
    // Each generation sits one column further in than the last.
    const indents = rows.map((line) => line.length - line.trimStart().length);
    assert.deepEqual(indents, [4, 5, 6]);
  });

  it('renders a docket flat when its parent is not in the fleet', () => {
    const fleet = model([
      repo('waybill', [docket('feat/orphan', { index: 5, leg: 'specs', stackedOn: 'feat/gone' })]),
    ]);
    const rows = rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].startsWith('    feat/orphan'), true, rows[0]);
  });

  it('renders every member of a `stackedOn` cycle exactly once instead of hanging', () => {
    const fleet = model([
      repo('waybill', [
        docket('feat/a', { index: 5, leg: 'specs', stackedOn: 'feat/b' }),
        docket('feat/b', { index: 5, leg: 'specs', stackedOn: 'feat/a' }),
        docket('feat/self', { index: 5, leg: 'specs', stackedOn: 'feat/self' }),
      ]),
    ]);
    const rows = rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill');
    assert.equal(rows.length, 3);
    for (const branch of ['feat/a', 'feat/b', 'feat/self']) {
      assert.equal(rows.filter((line) => line.includes(branch)).length, 1, branch);
    }
  });

  it('omits the pane column entirely when tmux could not be asked', () => {
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])], { tmux: false });
    const frame = renderFleetDashboard(fleet, NOW);
    assert.equal(frame.includes('PANE'), false, frame);
    assert.ok(frame.includes('ACTIVITY'));
  });

  it('omits the activity column entirely when ps could not be asked', () => {
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])], { ps: false });
    const frame = renderFleetDashboard(fleet, NOW);
    assert.equal(frame.includes('ACTIVITY'), false, frame);
    assert.ok(frame.includes('PANE'));
  });

  it('distinguishes "we looked and found nothing" from "we could not look"', () => {
    const looked = renderFleetDashboard(
      model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])]),
      NOW,
    );
    const blind = renderFleetDashboard(
      model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])], { tmux: false, ps: false }),
      NOW,
    );
    const row = (frame) => rowsUnder(frame, '  waybill')[0];
    assert.match(row(looked), /–\s+–$/, row(looked));
    assert.doesNotMatch(row(blind), /–$/, row(blind));
    assert.notEqual(row(looked), row(blind));
  });

  it('names the pane and what is running in it', () => {
    const fleet = model([
      repo('waybill', [
        docket('feat/a', {
          index: 6,
          leg: 'execute',
          pane: { session: 'work', windowIndex: '1', windowName: 'waybill' },
          activity: { kind: 'agent', name: 'claude' },
        }),
        docket('feat/b', {
          index: 6,
          leg: 'execute',
          pane: { session: 'work', windowIndex: '3', windowName: 'emre' },
          activity: { kind: 'busy', command: 'npm test' },
        }),
      ]),
    ]);
    const rows = rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill');
    assert.ok(rows.some((line) => line.includes('@1:waybill') && line.includes('claude')), rows.join('\n'));
    assert.ok(rows.some((line) => line.includes('@3:emre') && line.includes('npm test')), rows.join('\n'));
  });

  it('truncates a branch longer than its column instead of pushing every other one out', () => {
    const fleet = model([
      repo('waybill', [
        docket('feat/short', { index: 5, leg: 'specs' }),
        docket('feat/a-branch-name-far-longer-than-the-docket-column-allows', { index: 5, leg: 'specs' }),
      ]),
    ]);
    const rows = rowsUnder(renderFleetDashboard(fleet, NOW), '  waybill');
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((line) => line.length)).size, 1, rows.join('\n'));
    assert.ok(rows.some((line) => line.includes('…')), rows.join('\n'));
  });

  it('left-aligns every column down the frame, ages excepted', () => {
    const fleet = model([
      repo('waybill', [
        docket('feat/a', { index: 5, leg: 'specs', idle: NOW - 3 * DAY }),
        docket('fix/bb', { index: LEGS.length, leg: 'cleanup', idle: NOW - DAY }),
      ]),
      repo('other', [docket('feat/ccc', { index: 2, leg: 'bay', idle: NOW - 2 * DAY })]),
    ]);
    const frame = renderFleetDashboard(fleet, NOW);
    const bars = [headerRow(frame), ...frame.split('\n').filter((line) => line.includes('█') || line.includes('░'))]
      .map((line) => (line.includes('█') || line.includes('░') ? line.search(/[█░]/) : line.indexOf('PROGRESS')));
    assert.equal(new Set(bars).size, 1, frame);
  });

  it('renders a frame rather than an empty string for an empty fleet', () => {
    const frame = renderFleetDashboard(model([], { scanned: 0 }), NOW);
    assert.equal(frame.split('\n')[0], 'FLEET  0 dockets · 0 repos · 0 scanned');
    assert.match(frame, /nothing in flight/);
    assert.equal(frame.endsWith('\n'), true);
  });

  it('reports what was scanned when every repository was clean', () => {
    const frame = renderFleetDashboard(model([], { scanned: 12 }), NOW);
    assert.equal(frame.split('\n')[0], 'FLEET  0 dockets · 0 repos · 12 scanned');
  });

  it('dashes an age the scan could not resolve', () => {
    const fleet = model([
      repo('waybill', [docket('feat/a', { index: 5, leg: 'specs', opened: null, idle: null })]),
    ]);
    const frame = renderFleetDashboard(fleet, NOW);
    assert.equal(frame.includes('NaN'), false, frame);
    assert.equal(frame.includes('Invalid Date'), false, frame);
    assert.match(rowsUnder(frame, '  waybill')[0], /–/);
  });

  it('carries the scan\'s own warnings rather than dropping them', () => {
    const fleet = model([
      repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })], ['/projects/waybill: bookings overlay ignored']),
    ]);
    const frame = renderFleetDashboard(fleet, NOW);
    assert.match(frame, /^WARNINGS:$/m);
    assert.match(frame, /bookings overlay ignored/);
  });

  it('leaves the live-mode furniture to phase 5', () => {
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])]);
    const frame = renderFleetDashboard(fleet, NOW);
    assert.equal(frame.includes('⟳'), false);
    assert.equal(frame.includes('q quit'), false);
    assert.equal(frame.includes('r refresh'), false);
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(frame, /\u001b/, 'the frame carries an ANSI escape');
  });

  it('leaves no trailing whitespace on any line', () => {
    const fleet = model([
      repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })]),
    ]);
    for (const line of renderFleetDashboard(fleet, NOW).split('\n')) {
      assert.equal(line, line.trimEnd(), `trailing whitespace: ${JSON.stringify(line)}`);
    }
  });

  it('golden: layout A, every column present', () => {
    const fleet = model(
      [
        repo('waybill', [
          // `cleanup` is the last leg by definition, so the index is taken from the route rather
          // than written out — a leg added mid-route would otherwise leave this docket claiming to
          // be on `cleanup` somewhere in the middle of it, and take the full bar out of the golden.
          docket('fix/stamp-scope', {
            index: LEGS.length,
            leg: 'cleanup',
            opened: NOW - 12 * DAY,
            idle: NOW - 9 * DAY,
          }),
          docket('feat/fleet-dashboard', {
            index: 5,
            leg: 'specs',
            opened: NOW - 4 * DAY,
            idle: NOW - 6 * HOUR,
            pane: { session: 'work', windowIndex: '1', windowName: 'waybill' },
            activity: { kind: 'agent', name: 'claude' },
          }),
          docket('feat/nested-bays', {
            index: 2,
            leg: 'bay',
            opened: NOW - 3 * HOUR,
            idle: NOW - 3 * HOUR,
            stackedOn: 'feat/fleet-dashboard',
          }),
        ]),
        repo('emre-team', [
          docket('fix/mr-template', { index: 3, leg: 'refine', opened: NOW - 21 * DAY, idle: NOW - 21 * DAY }),
          docket('feat/batch-resolve', {
            index: 6,
            leg: 'execute',
            opened: NOW - 8 * DAY,
            idle: NOW - 2 * HOUR,
            progress: { done: 4, total: 9 },
            pane: { session: 'work', windowIndex: '3', windowName: 'emre' },
            activity: { kind: 'busy', command: 'npm test' },
          }),
        ]),
        repo('devops-tools', [
          docket('feat/tls-renewal', {
            index: 6,
            leg: 'execute',
            opened: NOW - 2 * DAY,
            idle: NOW - 40 * MINUTE,
            pane: { session: 'ops', windowIndex: '2', windowName: 'devops' },
            activity: { kind: 'agent', name: 'claude' },
          }),
        ]),
      ],
      { scanned: 34 },
    );
    assertGolden(GOLDEN, 'fleet-dash-frame', renderFleetDashboard(fleet, NOW));
  });

  it('golden: both environment columns omitted', () => {
    const fleet = model(
      [
        repo('waybill', [
          docket('feat/fleet-dashboard', { index: 5, leg: 'specs', opened: NOW - 4 * DAY, idle: NOW - 6 * HOUR }),
        ]),
      ],
      { scanned: 3, tmux: false, ps: false },
    );
    assertGolden(GOLDEN, 'fleet-dash-blind', renderFleetDashboard(fleet, NOW));
  });

  it('draws the bar against the leg model rather than a second copy of seven', () => {
    // If a leg is ever added, the denominator in the frame moves with it.
    const fleet = model([repo('waybill', [docket('feat/a', { index: 5, leg: 'specs' })])]);
    assert.match(renderFleetDashboard(fleet, NOW), new RegExp(`5/${LEGS.length} specs`));
    assert.equal(BAR_WIDTH > 0, true);
  });
});
