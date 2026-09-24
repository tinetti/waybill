import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { branchTips, openedAt } from '../src/age.js';
import { scanFleet } from '../src/scan.js';
import { addWorktree, cleanupAll, createRepo, git, tempRoot, withEnv, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

/** Pinned instants, far enough apart that no assertion can pass by accident. @type {number} */
const T0 = 1704067200; // 2024-01-01T00:00:00Z — trunk's first real commit
const T2 = 1704412800; // 2024-01-05 — the stacked docket's own last commit
const T3 = 1704672000; // 2024-01-08 — trunk moves on, and a second docket is cut here
const T4 = 1704931200; // 2024-01-11 — the rebase

/**
 * The environment that pins a commit to an exact instant. `@<unix> <tz>` is git's own raw format,
 * so nothing here depends on the machine's timezone — the whole point of storing unix seconds.
 *
 * @param {number} seconds
 * @returns {Record<string,string>}
 */
function at(seconds) {
  return { GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` };
}

/**
 * A commit carrying a real file rather than an empty one, so a later `git rebase` cannot decide it
 * has nothing to replay and quietly drop it.
 *
 * @param {string} cwd
 * @param {string} message doubles as the file name, so no two commits collide
 * @param {number} seconds
 * @returns {void}
 */
function commitAt(cwd, message, seconds) {
  writeFile(path.join(cwd, `${message}.txt`), `${message}\n`);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message], at(seconds));
}

/**
 * The fixture every age assertion is made against:
 *
 * - trunk commits at `T0` and, later, at `T3`;
 * - `feat/early` cut from trunk at `T0`, with its own last commit at `T2`;
 * - `feat/late` cut from trunk at `T3`, with no commits of its own.
 *
 * @returns {{repo:string, early:string, late:string}}
 */
function agedRepo() {
  const repo = createRepo({ root: tempRoot(), name: 'aged' });
  commitAt(repo, 't0', T0);

  const early = addWorktree(repo, 'feat/early');
  commitAt(early, 'a2', T2);

  commitAt(repo, 't3', T3);
  const late = addWorktree(repo, 'feat/late');

  return { repo, early, late };
}

describe('branchTips', () => {
  it('reports every branch tip from one call, as unix seconds', () => {
    const { repo } = agedRepo();

    const tips = branchTips(repo);

    assert.deepEqual([...tips.keys()].sort(), ['feat/early', 'feat/late', 'main']);
    assert.equal(tips.get('feat/early'), T2);
    assert.equal(tips.get('feat/late'), T3, 'a branch with no commits of its own is as old as the commit it sits on');
    assert.equal(tips.get('main'), T3);
  });

  it('returns nothing rather than throwing where git will not answer', () => {
    assert.deepEqual([...branchTips(path.join(tempRoot(), 'absent'))], []);
  });
});

describe('openedAt', () => {
  it('reports the merge-base commit date, not the branch tip', () => {
    const { repo } = agedRepo();

    assert.equal(openedAt(repo, 'feat/early', 'main'), T0);
    assert.equal(openedAt(repo, 'feat/late', 'main'), T3);
  });

  it('is null for a branch that shares no history with the trunk', () => {
    const repo = createRepo({ root: tempRoot(), name: 'orphaned' });
    git(repo, ['checkout', '--orphan', 'feat/orphan']);
    commitAt(repo, 'unrelated-root', T0);
    git(repo, ['checkout', 'main']);

    assert.equal(openedAt(repo, 'feat/orphan', 'main'), null);
  });

  it('is null rather than a throw when the trunk does not exist', () => {
    const { repo } = agedRepo();

    assert.equal(openedAt(repo, 'feat/early', 'no-such-trunk'), null);
  });

  it('resolves a trunk that only exists as a remote-tracking ref, as in a single-branch clone', () => {
    const root = tempRoot();
    const origin = createRepo({ root, name: 'origin-side', remote: true, originHead: true });
    commitAt(origin, 't0', T0);
    git(origin, ['push', 'origin', 'main']);

    const clone = path.join(root, 'clone');
    git(root, ['clone', '--branch', 'main', path.join(root, 'origin-side-origin.git'), clone]);
    git(clone, ['checkout', '-b', 'feat/one']);
    git(clone, ['branch', '-D', 'main']);

    assert.equal(openedAt(clone, 'feat/one', 'main'), T0);
  });
});

describe('rebasing', () => {
  it('reports the rebase as the idle time and the new trunk base as the opened time', () => {
    const { repo, early } = agedRepo();

    // Only the committer date is pinned: rebase carries the author date across untouched, which is
    // exactly the divergence this asserts on.
    git(early, ['rebase', 'main'], { GIT_COMMITTER_DATE: `@${T4} +0000` });

    assert.equal(git(early, ['log', '-1', '--format=%at']), String(T2), 'the author date survived the rebase');
    assert.equal(
      branchTips(repo).get('feat/early'),
      T4,
      'committer date, not author date: a branch rebased minutes ago has been touched',
    );
    assert.equal(openedAt(repo, 'feat/early', 'main'), T3, 'the branch now diverges from trunk at its new base');
  });
});

describe('docket decoration', () => {
  it('hangs the two ages off every docket the scan reports', () => {
    const { repo } = agedRepo();

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(repo));
    const byBranch = new Map(model.repos[0].dockets.map((docket) => [docket.branch, docket]));

    assert.deepEqual(
      { openedAt: byBranch.get('feat/early').openedAt, idleAt: byBranch.get('feat/early').idleAt },
      { openedAt: T0, idleAt: T2 },
    );
    assert.deepEqual(
      { openedAt: byBranch.get('feat/late').openedAt, idleAt: byBranch.get('feat/late').idleAt },
      { openedAt: T3, idleAt: T3 },
    );
  });

  it('stores no formatted age, so the model stays clock-free and a golden file stays stable', () => {
    const { repo } = agedRepo();

    const model = withEnv({ WAYBILL_BOOKINGS_DIR: undefined }, () => scanFleet(repo));

    for (const docket of model.repos[0].dockets) {
      assert.equal(typeof docket.openedAt, 'number');
      assert.equal(typeof docket.idleAt, 'number');
    }
  });
});
