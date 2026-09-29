import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { STACK_PAIR_CAP, breakCycles, stackParents, stackedOn } from '../src/stack.js';
import { scanFleet } from '../src/scan.js';
import { addWorktree, cleanupAll, createRepo, git, tempRoot, withEnv, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

/**
 * Cut `branch` from `from` and put one commit on it, leaving the checkout back on the trunk.
 *
 * Branches rather than bays: {@link stackedOn} reads history, and a worktree per branch would make
 * a four-deep chain cost four checkouts for nothing.
 *
 * @param {string} repo
 * @param {string} branch
 * @param {string} from
 * @param {string} [trunk]
 * @returns {void}
 */
function cut(repo, branch, from, trunk = 'main') {
  git(repo, ['checkout', '-b', branch, from]);
  writeFile(path.join(repo, `${branch.replace(/\//g, '-')}.txt`), `${branch}\n`);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', branch]);
  git(repo, ['checkout', trunk]);
}

/**
 * @param {string} repo
 * @param {string} message
 * @returns {void}
 */
function commitTrunk(repo, message) {
  writeFile(path.join(repo, `${message}.txt`), `${message}\n`);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', message]);
}

/** @returns {string} a repository with nothing but its initial commit on `main` */
function bareRepo() {
  return createRepo({ root: tempRoot(), name: 'stacked' });
}

describe('stackedOn', () => {
  it('is null for a docket cut straight from the trunk', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'main');

    assert.equal(stackedOn(repo, 'feat/a', 'main', ['feat/a', 'feat/b']), null);
    assert.equal(stackedOn(repo, 'feat/b', 'main', ['feat/a', 'feat/b']), null);
  });

  it('names the sibling a docket was cut from', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');

    assert.equal(stackedOn(repo, 'feat/b', 'main', ['feat/a', 'feat/b']), 'feat/a');
    assert.equal(stackedOn(repo, 'feat/a', 'main', ['feat/a', 'feat/b']), null, 'the parent is not stacked on itself');
  });

  it('names the nearest parent in a chain, not the root of it', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');
    cut(repo, 'feat/c', 'feat/b');
    const all = ['feat/a', 'feat/b', 'feat/c'];

    assert.equal(stackedOn(repo, 'feat/c', 'main', all), 'feat/b');
    assert.equal(stackedOn(repo, 'feat/b', 'main', all), 'feat/a');
    assert.equal(stackedOn(repo, 'feat/a', 'main', all), null);
  });

  it('answers the same however the siblings are ordered', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');
    cut(repo, 'feat/c', 'feat/b');

    assert.equal(stackedOn(repo, 'feat/c', 'main', ['feat/c', 'feat/b', 'feat/a']), 'feat/b');
    assert.equal(stackedOn(repo, 'feat/c', 'main', ['feat/a', 'feat/b', 'feat/c']), 'feat/b');
  });

  it('survives the parent being rebased onto a newer trunk and the child restacked onto it', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');
    const oldParentTip = git(repo, ['rev-parse', 'feat/a']);
    commitTrunk(repo, 't1');

    git(repo, ['checkout', 'feat/a']);
    git(repo, ['rebase', 'main']);
    git(repo, ['checkout', 'feat/b']);
    git(repo, ['rebase', '--onto', 'feat/a', oldParentTip]);
    git(repo, ['checkout', 'main']);

    assert.equal(stackedOn(repo, 'feat/b', 'main', ['feat/a', 'feat/b']), 'feat/a');
  });

  it('reads a child left behind by its parent’s rebase as trunk-cut, because that is what it is', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');
    commitTrunk(repo, 't1');

    git(repo, ['checkout', 'feat/a']);
    git(repo, ['rebase', 'main']);
    git(repo, ['checkout', 'main']);

    assert.equal(
      stackedOn(repo, 'feat/b', 'main', ['feat/a', 'feat/b']),
      null,
      'the rewritten parent no longer contains the commits the child was cut from',
    );
  });

  it('reads two bays cut at the same commit as unstacked rather than as a cycle', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    git(repo, ['branch', 'feat/fresh', 'feat/a']);
    const all = ['feat/a', 'feat/fresh'];

    assert.equal(stackedOn(repo, 'feat/a', 'main', all), null);
    assert.equal(stackedOn(repo, 'feat/fresh', 'main', all), null, 'nothing in git can say which head came first');
  });

  it('is null rather than a throw when the trunk cannot be resolved', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');

    assert.equal(stackedOn(repo, 'feat/b', 'no-such-trunk', ['feat/a', 'feat/b']), null);
  });
});

describe('stackParents', () => {
  it('resolves a whole repository in one pass, with no warnings for an ordinary fleet', () => {
    const repo = bareRepo();
    cut(repo, 'feat/a', 'main');
    cut(repo, 'feat/b', 'feat/a');
    cut(repo, 'feat/solo', 'main');
    /** @type {string[]} */
    const warnings = [];

    const parents = stackParents(repo, ['feat/a', 'feat/b', 'feat/solo'], 'main', warnings);

    assert.deepEqual([...parents], [['feat/a', null], ['feat/b', 'feat/a'], ['feat/solo', null]]);
    assert.deepEqual(warnings, []);
  });

  it('skips stacking above the pair-count cap and says so rather than stalling the scan', () => {
    const repo = bareRepo();
    const branches = Array.from({ length: STACK_PAIR_CAP + 1 }, (_, index) => `feat/${index}`);
    for (const branch of branches) git(repo, ['branch', branch, 'main']);
    /** @type {string[]} */
    const warnings = [];

    const parents = stackParents(repo, branches, 'main', warnings);

    assert.deepEqual([...new Set(parents.values())], [null]);
    assert.equal(parents.size, branches.length);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /stacked-branch dependencies/);
  });
});

describe('breakCycles', () => {
  it('leaves an acyclic forest exactly as it found it', () => {
    const parents = new Map([['a', null], ['b', 'a'], ['c', 'b'], ['d', null]]);

    assert.deepEqual(breakCycles(parents), []);
    assert.deepEqual([...parents], [['a', null], ['b', 'a'], ['c', 'b'], ['d', null]]);
  });

  it('flattens one docket of a cycle so the renderer cannot recurse forever', () => {
    const parents = new Map([['a', 'b'], ['b', 'a']]);

    const notes = breakCycles(parents);

    assert.equal(notes.length, 1);
    assert.match(notes[0], /cycle/);
    assert.equal([...parents.values()].filter((parent) => parent === null).length, 1);
  });

  it('flattens a three-deep cycle and leaves the branch hanging off it alone', () => {
    const parents = new Map([['a', 'c'], ['b', 'a'], ['c', 'b'], ['d', null]]);

    const notes = breakCycles(parents);

    assert.equal(notes.length, 1);
    assert.equal(parents.get('d'), null);
    assert.equal([...parents.values()].filter((parent) => parent === null).length, 2);
  });
});

/**
 * A bay with one commit of its own, cut from `from` when given and from the trunk otherwise.
 *
 * @param {string} repo
 * @param {string} branch
 * @param {string} [from]
 * @returns {string} the bay path
 */
function bay(repo, branch, from) {
  const dir = addWorktree(repo, branch, from);
  const file = `${branch.replace(/\//g, '-')}.txt`;
  writeFile(path.join(dir, file), `${branch}\n`);
  git(dir, ['add', file]);
  git(dir, ['commit', '-m', branch]);
  return dir;
}

describe('docket decoration', () => {
  it('hangs the parent off every docket the scan reports', () => {
    const repo = bareRepo();
    bay(repo, 'feat/a');
    bay(repo, 'feat/b', 'feat/a');

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(repo));
    const byBranch = model.repos[0].dockets.map((docket) => [docket.branch, docket.stackedOn]);

    assert.deepEqual(byBranch.sort(), [['feat/a', null], ['feat/b', 'feat/a']]);
    assert.deepEqual(model.repos[0].warnings, []);
  });

  it('never stacks a docket on a same-named branch in another repository', () => {
    const root = tempRoot();
    const alpha = createRepo({ root, name: 'alpha' });
    bay(alpha, 'feat/a');
    bay(alpha, 'feat/b', 'feat/a');
    const beta = createRepo({ root, name: 'beta' });
    bay(beta, 'feat/a');
    bay(beta, 'feat/b');

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(root, { depth: 1 }));
    const byName = new Map(model.repos.map((entry) => [entry.name, entry.dockets]));

    assert.deepEqual(
      byName.get('alpha').map((docket) => docket.stackedOn),
      [null, 'feat/a'],
    );
    assert.deepEqual(
      byName.get('beta').map((docket) => docket.stackedOn),
      [null, null],
      'beta’s dockets were both cut from its own trunk, whatever alpha’s share their names',
    );
  });
});
