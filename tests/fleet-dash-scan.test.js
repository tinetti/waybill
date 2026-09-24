import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { discoverRepos, scanFleet } from '../src/scan.js';
import {
  addWorktree,
  cleanupAll,
  createRepo,
  git,
  tempRoot,
  withEnv,
  writeFile,
} from './helpers/repo-fixture.js';

after(cleanupAll);

/**
 * The bookings overlay tier is read from the *operator's* environment, so a machine that exports
 * `WAYBILL_BOOKINGS_DIR` would otherwise decide what every scanned repository's legs are. The
 * fixture helper neutralises the git tiers at import; this neutralises the env tier per scan.
 *
 * @param {string} cwd
 * @param {Parameters<typeof scanFleet>[1]} [options]
 * @returns {ReturnType<typeof scanFleet>}
 */
function scan(cwd, options) {
  return withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(cwd, options));
}

/**
 * A repository whose bays are its own siblings — the `gwt` layout, and the one shape that puts
 * another checkout of the same project directly into the scan root.
 *
 * @param {string} root
 * @param {string} name
 * @param {string[]} branches
 * @returns {string} the main checkout
 */
function siblingBayRepo(root, name, branches) {
  const repo = createRepo({ root, name });
  git(repo, ['config', 'waybill.baydir', '..']);
  for (const branch of branches) addWorktree(repo, branch);
  return repo;
}

/**
 * A booking file body binding `leg` to a command, stamped only by `stampCmd`.
 *
 * @param {string} leg
 * @param {string} command
 * @param {string} stampCmd
 * @returns {string}
 */
function bookingFile(leg, command, stampCmd) {
  return ['---', `leg: ${leg}`, `command: ${command}`, 'model: overlay-model', `stampCmd: ${stampCmd}`, '---', ''].join(
    '\n',
  );
}

describe('discoverRepos', () => {
  it('returns just this repository when the cwd is inside one', () => {
    const repo = createRepo();
    addWorktree(repo, 'feat/one');

    assert.deepEqual(discoverRepos(repo), [repo]);
    assert.deepEqual(discoverRepos(repo, { depth: 1 }), [repo]);
  });

  it('returns the main checkout when the cwd is a bay', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/one');

    assert.deepEqual(discoverRepos(bay), [repo]);
  });

  it('finds sibling repositories beneath a cwd that is in no repository at all', () => {
    const root = tempRoot();
    const alpha = createRepo({ root, name: 'alpha' });
    const beta = createRepo({ root, name: 'beta' });

    assert.deepEqual(discoverRepos(root, { depth: 1 }), [alpha, beta]);
  });

  it('finds a repository two levels down at depth 4 and misses it at depth 1', () => {
    const root = tempRoot();
    const nested = createRepo({ root, name: path.join('org', 'nested') });

    assert.deepEqual(discoverRepos(root, { depth: 4 }), [nested]);
    assert.deepEqual(discoverRepos(root, { depth: 1 }), []);
  });

  it('halts at a repository rather than descending into one vendored inside it', () => {
    const root = tempRoot();
    const outer = createRepo({ root, name: 'outer' });
    createRepo({ root, name: path.join('outer', 'vendored') });

    assert.deepEqual(discoverRepos(root), [outer]);
  });

  it('never visits a repository inside node_modules', () => {
    const root = tempRoot();
    const real = createRepo({ root, name: 'real' });
    createRepo({ root, name: path.join('node_modules', 'stray') });

    assert.deepEqual(discoverRepos(root), [real]);
  });

  it('lists a repository whose bays are its own siblings exactly once', () => {
    const root = tempRoot();
    const repo = siblingBayRepo(root, 'gamma', ['feat/one', 'fix/two']);

    assert.deepEqual(discoverRepos(root, { depth: 1 }), [repo]);
  });

  it('lists a repository reached through a symlink exactly once', () => {
    const root = tempRoot();
    const alpha = createRepo({ root, name: 'alpha' });
    fs.symlinkSync(alpha, path.join(root, 'alias'));

    assert.deepEqual(discoverRepos(root, { depth: 1 }), [alpha]);
  });

  it('terminates on a symlink pointing back into the tree it is walking', () => {
    const root = tempRoot();
    const alpha = createRepo({ root, name: 'alpha' });
    fs.symlinkSync(root, path.join(root, 'loop'));

    assert.deepEqual(discoverRepos(root, { depth: 4 }), [alpha]);
  });

  it('returns nothing rather than throwing when the cwd does not exist', () => {
    assert.deepEqual(discoverRepos(path.join(tempRoot(), 'absent')), []);
  });
});

describe('scanFleet', () => {
  it('does not duplicate the dockets of a repository whose bays are its siblings', () => {
    const root = tempRoot();
    siblingBayRepo(root, 'gamma', ['feat/one', 'fix/two']);

    const model = scan(root, { depth: 1 });

    assert.equal(model.repos.length, 1);
    assert.deepEqual(
      model.repos[0].dockets.map((docket) => docket.branch).sort(),
      ['feat/one', 'fix/two'],
    );
  });

  it('counts a repository with no open dockets but does not list it', () => {
    const root = tempRoot();
    const busy = createRepo({ root, name: 'busy' });
    addWorktree(busy, 'feat/one');
    createRepo({ root, name: 'idle' });

    const model = scan(root, { depth: 1 });

    assert.deepEqual(model.repos.map((repo) => repo.name), ['busy']);
    assert.equal(model.scanned, 2);
  });

  it('resolves bookings per repository, so one overlay does not speak for its neighbour', () => {
    const root = tempRoot();
    const overlaid = createRepo({ root, name: 'overlaid' });
    addWorktree(overlaid, 'feat/one');
    writeFile(
      path.join(overlaid, '.waybill', 'bookings', 'contract.md'),
      bookingFile('contract', '/overlay:contract', 'exit 1'),
    );
    git(overlaid, ['config', 'waybill.bookingsdir', '.waybill/bookings']);

    const plain = createRepo({ root, name: 'plain' });
    addWorktree(plain, 'feat/one');

    const model = scan(root, { depth: 1 });
    const byName = new Map(model.repos.map((repo) => [repo.name, repo]));

    assert.equal(byName.get('overlaid').bookings.get('contract').command, '/overlay:contract');
    assert.equal(byName.get('plain').bookings.get('contract').command, '/ideation:ideation');
  });

  it('never runs a booking stampCmd while scanning more than one repository', () => {
    const root = tempRoot();
    const repo = createRepo({ root, name: 'stamped' });
    addWorktree(repo, 'feat/one');
    const sentinel = path.join(root, 'stamp-ran');
    writeFile(
      path.join(repo, '.waybill', 'bookings', 'refine.md'),
      bookingFile('refine', '/overlay:refine', `touch ${sentinel}`),
    );
    git(repo, ['config', 'waybill.bookingsdir', '.waybill/bookings']);

    scan(root, { depth: 1 });

    assert.equal(fs.existsSync(sentinel), false, 'a multi-repo scan executed a configured stamp command');
  });

  it('still runs a booking stampCmd when the scan is of the one repository the operator is in', () => {
    const root = tempRoot();
    const repo = createRepo({ root, name: 'stamped' });
    addWorktree(repo, 'feat/one');
    const sentinel = path.join(root, 'stamp-ran');
    writeFile(
      path.join(repo, '.waybill', 'bookings', 'refine.md'),
      bookingFile('refine', '/overlay:refine', `touch ${sentinel}`),
    );
    git(repo, ['config', 'waybill.bookingsdir', '.waybill/bookings']);

    scan(repo);

    assert.equal(fs.existsSync(sentinel), true, 'single-repo mode must keep today’s behaviour');
  });

  it('scans a realistic projects tree: four repositories found, three with dockets', () => {
    const root = tempRoot();
    const plain = createRepo({ root, name: 'plain' });
    addWorktree(plain, 'feat/one');
    siblingBayRepo(root, 'gamma', ['feat/one', 'fix/two']);
    createRepo({ root, name: 'idle' });
    const nested = createRepo({ root, name: path.join('org', 'nested') });
    addWorktree(nested, 'feat/one');
    createRepo({ root, name: path.join('node_modules', 'stray') });

    const model = scan(root, { depth: 4 });

    assert.equal(model.root, root);
    assert.equal(model.inRepo, false);
    assert.equal(model.scanned, 4);
    assert.deepEqual(model.repos.map((repo) => repo.name).sort(), ['gamma', 'nested', 'plain']);
  });
});
