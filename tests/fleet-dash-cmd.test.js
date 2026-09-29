import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../src/cli.js';
import {
  addWorktree,
  assertGolden,
  cleanupAll,
  createRepo,
  git,
  pathWithout,
  tempRoot,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';

after(cleanupAll);

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

/** The injected clock. Every fixture commit below is dated as a distance back from it. */
const NOW = 1_780_000_000;

const HOUR = 3600;
const DAY = 24 * HOUR;

/** @param {number} ago seconds before {@link NOW} @returns {string} an ISO date git accepts */
const at = (ago) => new Date((NOW - ago) * 1000).toISOString();

/**
 * A `PATH` that answers for git and the shell but not for tmux or `ps`.
 *
 * Both of those describe the developer's own machine, and a golden file rendered against them would
 * pass on the laptop that blessed it and nowhere else. Stubs that simply fail are the honest
 * reproduction of "not installed": `listPanes` and `snapshot` both return empty on a non-zero exit,
 * which is what drives the two columns out of the frame.
 *
 * Prepended to the real `PATH` rather than replacing it, because the scan still has to run git.
 *
 * @returns {string}
 */
function blindPath() {
  const dir = path.join(tempRoot(), 'bin');
  fs.mkdirSync(dir, { recursive: true });
  for (const name of ['tmux', 'ps']) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '#!/bin/sh\nexit 1\n');
    fs.chmodSync(file, 0o755);
  }
  // `openspec` goes too, for the reason `tests/cli.test.js` drops it: a CLI installed on this
  // machine must not be able to change what a byte-exact comparison sees.
  return `${dir}${path.delimiter}${pathWithout('openspec')}`;
}

/**
 * Drive `run` the way `bin/waybill` does, with everything outside the process injected.
 *
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {{code:number, out:string, err:string}}
 */
function cli(argv, cwd) {
  let out = '';
  let err = '';
  const code = withPath(blindPath(), () =>
    run(argv, {
      cwd,
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
      signals: () => ({ tmux: null, history: [] }),
      isTTY: false,
      now: () => NOW,
    }),
  );
  return { code, out, err };
}

/**
 * A repository whose trunk commit is dated, so both age columns are the same on every machine.
 *
 * @param {{name?:string, root?:string, opened?:number}} [options]
 * @returns {string} the main checkout
 */
function datedRepo(options = {}) {
  const { name = 'repo', root, opened = 12 * DAY } = options;
  const dir = createRepo({ name, root });
  git(dir, ['commit', '--amend', '--no-edit', '--date', at(opened)], { GIT_COMMITTER_DATE: at(opened) });
  return dir;
}

/**
 * A bay whose branch tip is dated, so its idle column is the same on every machine.
 *
 * @param {string} repo the main checkout
 * @param {string} branch
 * @param {number} idle seconds before {@link NOW}
 * @param {string} [from] the rev to cut from, for a genuinely stacked branch
 * @returns {string} the bay path
 */
function datedBay(repo, branch, idle, from) {
  const bay = addWorktree(repo, branch, from);
  writeFile(path.join(bay, 'note.md'), `${branch}\n`);
  git(bay, ['add', 'note.md']);
  git(bay, ['commit', '-m', `work on ${branch}`, '--date', at(idle)], { GIT_COMMITTER_DATE: at(idle) });
  return bay;
}

describe('waybill fleet', () => {
  it('reports the repository the operator is standing in, and exits 0', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/one', 9 * DAY);
    datedBay(repo, 'feat/two', 6 * HOUR);

    const { code, out, err } = cli(['fleet'], repo);
    assert.equal(code, 0, err);
    assert.equal(err, '');
    assert.match(out, /^FLEET {2}2 dockets · 1 repo · 1 scanned$/m);
    assert.match(out, /feat\/one/);
    assert.match(out, /feat\/two/);
  });

  it('answers from inside a bay as well as from the trunk', () => {
    const repo = datedRepo();
    const bay = datedBay(repo, 'feat/one', 9 * DAY);

    assert.equal(cli(['fleet'], bay).out, cli(['fleet'], repo).out);
  });

  it('answers outside any repository, discovering the ones below', () => {
    const root = tempRoot();
    const first = datedRepo({ name: 'alpha', root });
    datedBay(first, 'feat/one', 3 * DAY);
    const second = datedRepo({ name: 'beta', root, opened: 20 * DAY });
    datedBay(second, 'fix/two', 20 * DAY);

    const { code, out, err } = cli(['fleet'], root);
    assert.equal(code, 0, err);
    assert.match(out, /^FLEET {2}2 dockets · 2 repos · 2 scanned$/m);
    // Most-neglected repository first, which is the whole point of the ordering.
    assert.ok(out.indexOf('\n  beta\n') < out.indexOf('\n  alpha\n'), out);
  });

  it('counts a repository that is scanned but has nothing in flight', () => {
    const root = tempRoot();
    datedRepo({ name: 'alpha', root });
    const second = datedRepo({ name: 'beta', root });
    datedBay(second, 'feat/one', 3 * DAY);

    const { out } = cli(['fleet'], root);
    assert.match(out, /^FLEET {2}1 docket · 1 repo · 2 scanned$/m);
    assert.equal(out.includes('alpha'), false, out);
  });

  it('honours --depth: 1 finds the top-level repository and misses the nested one', () => {
    const root = tempRoot();
    const top = datedRepo({ name: 'top', root });
    datedBay(top, 'feat/top', 3 * DAY);
    const nested = datedRepo({ name: 'deep', root: path.join(root, 'a', 'b') });
    datedBay(nested, 'feat/deep', 3 * DAY);

    const shallow = cli(['fleet', '--depth', '1'], root);
    const full = cli(['fleet', '--depth', '4'], root);

    assert.equal(shallow.code, 0, shallow.err);
    assert.equal(full.code, 0, full.err);
    assert.notEqual(shallow.out, full.out);
    assert.match(shallow.out, /feat\/top/);
    assert.equal(shallow.out.includes('feat/deep'), false, shallow.out);
    assert.match(full.out, /feat\/deep/);
  });

  it('nests a branch cut from another open docket', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/base', 5 * DAY);
    datedBay(repo, 'feat/stacked', 2 * DAY, 'feat/base');

    const { out } = cli(['fleet'], repo);
    const rows = out.split('\n').filter((line) => line.includes('feat/'));
    assert.equal(rows.length, 2, out);
    assert.match(rows[0], /^ {4}feat\/base/);
    assert.match(rows[1], /^ {5}└ feat\/stacked/);
  });

  it('omits both environment columns when tmux and ps cannot be read', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/one', 9 * DAY);

    const { out } = cli(['fleet'], repo);
    assert.equal(out.includes('PANE'), false, out);
    assert.equal(out.includes('ACTIVITY'), false, out);
  });

  it('prints exactly one frame with no escape bytes, so a pipe sees what a terminal does', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/one', 9 * DAY);

    const { out } = cli(['fleet'], repo);
    assert.equal(out.split('FLEET ').length - 1, 1, out);
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(out, /\u001b/, 'the frame carries an ANSI escape');
    assert.equal(out.endsWith('\n'), true);
    assert.equal(out.includes('⟳'), false);
    assert.equal(out.includes('q quit'), false);
  });

  it('is a pure function of the injected clock, so nothing here reads the wall clock', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/one', 9 * DAY);

    assert.equal(cli(['fleet'], repo).out, cli(['fleet'], repo).out);
  });

  for (const [label, argv] of [
    ['a non-integer depth', ['fleet', '--depth', 'abc']],
    ['a depth of zero', ['fleet', '--depth', '0']],
    ['a depth with no value', ['fleet', '--depth']],
    ['an unknown flag', ['fleet', '--bogus']],
    ['a positional argument', ['fleet', 'feat/one']],
  ]) {
    it(`exits 2 with the usage on ${label}`, () => {
      const { code, out, err } = cli(argv, tempRoot());
      assert.equal(code, 2);
      assert.equal(out, '');
      assert.match(err, /Usage: waybill/);
    });
  }

  it('names the flag when the depth is the problem, rather than only printing the usage', () => {
    const { err } = cli(['fleet', '--depth', 'abc'], tempRoot());
    assert.match(err, /`--depth` takes a whole number/);
  });

  it('answers `--help` with the usage, as every verb does', () => {
    const { code, out } = cli(['fleet', '--help'], tempRoot());
    assert.equal(code, 0);
    assert.match(out, /Usage: waybill <command> \[options\]/);
    assert.match(out, /^ {2}fleet {11}/m);
    assert.match(out, /^ {2}--depth <n> {7}/m);
  });

  it('golden: one repository, three dockets, one of them stacked', () => {
    const repo = datedRepo();
    datedBay(repo, 'feat/base', 5 * DAY);
    datedBay(repo, 'feat/stacked', 40 * 60, 'feat/base');
    datedBay(repo, 'fix/forgotten', 11 * DAY);

    assertGolden(GOLDEN, 'fleet-dash-cli', cli(['fleet'], repo).out);
  });

  it('golden: a repository with nothing in flight', () => {
    const repo = datedRepo();

    assertGolden(GOLDEN, 'fleet-dash-cli-empty', cli(['fleet'], repo).out);
  });

  it('golden: a directory with no repository under it at all', () => {
    assertGolden(GOLDEN, 'fleet-dash-cli-nowhere', cli(['fleet'], tempRoot()).out);
  });
});
