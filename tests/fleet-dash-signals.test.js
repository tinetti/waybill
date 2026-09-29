import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { listPanes, paneFor, panesByPath } from '../src/panes.js';
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

/**
 * One `tmux list-panes` row: the seven fields the fleet asks for, tab-separated, in the order the
 * format string names them.
 *
 * @param {{session?:string, windowIndex?:string, windowName?:string, paneId?:string,
 *          panePid?:number|string, cwd?:string, command?:string}} fields
 * @returns {string}
 */
function row(fields) {
  const {
    session = 'work',
    windowIndex = '0',
    windowName = 'shell',
    paneId = '%1',
    panePid = 100,
    cwd = '/tmp',
    command = 'zsh',
  } = fields;
  return [session, windowIndex, windowName, paneId, String(panePid), cwd, command].join('\t');
}

/**
 * A `PATH` whose `tmux` prints `rows` and from which the real tmux has been removed, so a developer
 * with a live server of their own cannot answer an assertion about a stubbed one.
 *
 * @param {string[]} rows
 * @param {string} [script] a whole stub body, replacing the rows — for the failure cases
 * @returns {string}
 */
function stubTmux(rows, script) {
  const body = script ?? (rows.length === 0 ? 'exit 0' : `printf '%s\\n' ${rows.map((line) => `'${line}'`).join(' ')}`);
  return `${stubBin('tmux', body)}${path.delimiter}${pathWithout('tmux')}`;
}

/** A `PATH` with no tmux on it at all. @returns {string} */
const noTmux = () => pathWithout('tmux');

/**
 * A directory that exists, so `realpathSync` has something to resolve.
 *
 * @param {string} name
 * @returns {string}
 */
function realDir(name) {
  const dir = path.join(tempRoot(), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * @param {string} cwd
 * @param {Parameters<typeof scanFleet>[1]} [options]
 * @returns {ReturnType<typeof scanFleet>}
 */
function scan(cwd, options) {
  return withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(cwd, options));
}

describe('listPanes', () => {
  it('parses every pane on the server from one call', () => {
    const panes = withPath(
      stubTmux([
        row({ session: 'waybill', windowIndex: '2', windowName: 'fleet', paneId: '%7', panePid: 4242, cwd: '/tmp/alpha' }),
        row({ session: 'emre', windowIndex: '0', windowName: 'docproc', paneId: '%9', panePid: 99, cwd: '/tmp/beta', command: 'node' }),
      ]),
      () => listPanes(),
    );

    assert.deepEqual(panes, [
      {
        session: 'waybill',
        windowIndex: '2',
        windowName: 'fleet',
        paneId: '%7',
        panePid: 4242,
        paneCurrentPath: '/tmp/alpha',
        paneCurrentCommand: 'zsh',
      },
      {
        session: 'emre',
        windowIndex: '0',
        windowName: 'docproc',
        paneId: '%9',
        panePid: 99,
        paneCurrentPath: '/tmp/beta',
        paneCurrentCommand: 'node',
      },
    ]);
  });

  it('asks the whole server rather than this pane, and asks it from outside tmux too', () => {
    const log = path.join(tempRoot(), 'argv');
    const stub = stubTmux([], `printf '%s\\n' "$@" > ${JSON.stringify(log)}`);

    const panes = withEnv({ TMUX: undefined, TMUX_PANE: undefined }, () => withPath(stub, () => listPanes()));
    const argv = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);

    assert.deepEqual(panes, [], 'a server with no panes is not an error');
    assert.equal(argv[0], 'list-panes');
    assert.ok(argv.includes('-a'), 'the fleet spans every session, not the current one');
    assert.equal(argv.includes('-t'), false, '$TMUX_PANE is the picker’s question, not the fleet’s');
    assert.match(argv.join(' '), /#\{pane_current_path\}/);
  });

  it('drops a row that is not seven fields, and keeps the rest', () => {
    const panes = withPath(
      stubTmux(['truncated\tmid\trow', row({ paneId: '%3', cwd: '/tmp/kept' })]),
      () => listPanes(),
    );

    assert.deepEqual(panes.map((pane) => pane.paneCurrentPath), ['/tmp/kept']);
  });

  it('drops a row whose pane pid is not a number', () => {
    const panes = withPath(stubTmux([row({ panePid: 'not-a-pid' }), row({ panePid: 7, cwd: '/tmp/kept' })]), () =>
      listPanes(),
    );

    assert.deepEqual(panes.map((pane) => pane.panePid), [7]);
  });

  it('runs tmux under the environment it is handed, not the one this process is running under', () => {
    const panes = listPanes({ PATH: stubTmux([row({ cwd: '/tmp/handed' })]) });

    assert.deepEqual(panes.map((pane) => pane.paneCurrentPath), ['/tmp/handed']);
  });

  it('is empty rather than throwing when tmux exits non-zero', () => {
    assert.deepEqual(withPath(stubTmux([], 'exit 1'), () => listPanes()), []);
  });

  it('is empty rather than throwing when tmux is not installed', () => {
    assert.deepEqual(withPath(noTmux(), () => listPanes()), []);
  });

  it('is empty rather than blocking the scan when tmux does not answer in time', () => {
    assert.deepEqual(withPath(stubTmux([], 'sleep 5'), () => listPanes()), []);
  });
});

describe('panesByPath', () => {
  it('keys every pane by its resolved path', () => {
    const alpha = realDir('alpha');
    const beta = realDir('beta');

    const byPath = panesByPath(withPath(stubTmux([row({ cwd: alpha }), row({ cwd: beta, paneId: '%2' })]), () => listPanes()));

    assert.deepEqual([...byPath.keys()].sort(), [alpha, beta].sort());
  });

  it('resolves a pane sitting in a symlink to the directory the symlink points at', () => {
    const bay = realDir('bay');
    const alias = path.join(tempRoot(), 'alias');
    fs.symlinkSync(bay, alias);

    const byPath = panesByPath(withPath(stubTmux([row({ cwd: alias })]), () => listPanes()));

    assert.deepEqual([...byPath.keys()], [bay]);
  });

  it('tolerates a trailing slash on either side of the comparison', () => {
    const bay = realDir('bay');

    const byPath = panesByPath(withPath(stubTmux([row({ cwd: `${bay}/` })]), () => listPanes()));

    assert.equal(paneFor(byPath, `${bay}/`).paneCurrentPath, `${bay}/`);
    assert.equal(paneFor(byPath, bay).paneCurrentPath, `${bay}/`);
  });

  it('skips a pane whose directory has been deleted, keeping the rest', () => {
    const kept = realDir('kept');
    const gone = path.join(tempRoot(), 'gone');

    const byPath = panesByPath(withPath(stubTmux([row({ cwd: gone }), row({ cwd: kept, paneId: '%2' })]), () => listPanes()));

    assert.deepEqual([...byPath.keys()], [kept]);
  });

  it('keeps the first of two panes sitting in the same directory, so the join is deterministic', () => {
    const bay = realDir('bay');

    const byPath = panesByPath(
      withPath(stubTmux([row({ cwd: bay, paneId: '%1' }), row({ cwd: bay, paneId: '%2' })]), () => listPanes()),
    );

    assert.equal(paneFor(byPath, bay).paneId, '%1');
  });
});

describe('paneFor', () => {
  it('is null for a directory no pane is sitting in, and for one that does not exist', () => {
    const byPath = panesByPath(withPath(stubTmux([row({ cwd: realDir('elsewhere') })]), () => listPanes()));

    assert.equal(paneFor(byPath, realDir('empty')), null);
    assert.equal(paneFor(byPath, path.join(tempRoot(), 'absent')), null);
  });
});

describe('docket decoration', () => {
  it('hangs the pane sitting in a bay off that docket, and nothing off the others', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    const bay = addWorktree(repo, 'feat/one');
    addWorktree(repo, 'feat/two');
    const stub = stubTmux([
      row({ session: 'waybill', windowIndex: '3', windowName: 'one', cwd: bay, panePid: 4242 }),
      row({ session: 'other', windowIndex: '0', windowName: 'nothing', paneId: '%2', cwd: realDir('elsewhere') }),
    ]);

    const model = withPath(stub, () => scan(repo));
    const byBranch = new Map(model.repos[0].dockets.map((docket) => [docket.branch, docket]));

    assert.equal(model.tmuxAvailable, true);
    assert.deepEqual(byBranch.get('feat/one').pane, { session: 'waybill', windowIndex: '3', windowName: 'one' });
    assert.equal(byBranch.get('feat/two').pane, null);
  });

  it('joins a bay reached through a symlinked parent, which a literal comparison would miss', () => {
    const root = tempRoot();
    const repo = createRepo({ root, name: 'alpha' });
    const bay = addWorktree(repo, 'feat/one');
    const alias = path.join(tempRoot(), 'home');
    fs.symlinkSync(root, alias);
    const throughAlias = path.join(alias, path.relative(root, bay));

    const model = withPath(stubTmux([row({ session: 'aliased', cwd: throughAlias })]), () => scan(repo));

    assert.equal(model.repos[0].dockets[0].pane.session, 'aliased');
  });

  it('never joins a pane whose window name matches the branch but whose path does not', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    addWorktree(repo, 'feat/one');
    const stub = stubTmux([
      row({ session: 'alpha', windowName: 'feat/one', cwd: realDir('somewhere-else') }),
      row({ session: 'alpha', windowName: 'one', paneId: '%2', cwd: realDir('also-not-the-bay') }),
    ]);

    const model = withPath(stub, () => scan(repo));

    assert.equal(model.repos[0].dockets[0].pane, null, 'a name match is a guess, and a guess is a false claim');
  });

  it('reports tmux unavailable and every pane blank when tmux is absent', () => {
    const repo = createRepo({ root: tempRoot(), name: 'alpha' });
    addWorktree(repo, 'feat/one');

    const model = withPath(noTmux(), () => scan(repo));

    assert.equal(model.tmuxAvailable, false);
    assert.equal(model.repos[0].dockets[0].pane, null);
  });
});
