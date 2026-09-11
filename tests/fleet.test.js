import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { fleet } from '../src/fleet.js';
import { addWorktree, cleanupAll, createRepo, git, tempRoot } from './helpers/repo-fixture.js';

after(cleanupAll);

/**
 * A worktree somewhere git will accept but Waybill must not count. Deliberately outside the bay
 * container: these are never dockets, so where they live is irrelevant, and keeping them out of the
 * repository means no exclude line has to be maintained for a fixture that exists to be ignored.
 *
 * @param {string} name
 * @returns {string}
 */
function outsidePath(name) {
  return path.join(tempRoot(), name);
}

describe('fleet', () => {
  it('returns an empty fleet when no bays are open', () => {
    const repo = createRepo();

    assert.deepEqual(fleet(repo), []);
  });

  it('reports the bay directory as the docket path', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/one');

    assert.deepEqual(
      fleet(repo).map((docket) => docket.path),
      [bay],
    );
  });

  it("resolves each bay against its own directory, not the operator's", () => {
    const repo = createRepo();
    addWorktree(repo, 'feat/one');
    addWorktree(repo, 'fix/two');

    const dockets = fleet(repo);

    assert.deepEqual(
      dockets.map((docket) => docket.branch).sort(),
      ['feat/one', 'fix/two'],
    );
    // The whole point of the module: `resolveLeg` is called with a directory other than the
    // operator's. Resolved against the trunk instead, every docket would report `main` and
    // `docketOpen: false`, and the fleet would be a list of the same repository three times.
    for (const docket of dockets) {
      assert.equal(docket.state.branch, docket.branch);
      assert.equal(docket.state.docketOpen, true);
    }
  });

  it('enumerates the same fleet from inside a bay', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/one');
    addWorktree(repo, 'fix/two');

    assert.deepEqual(
      fleet(bay).map((docket) => docket.branch).sort(),
      ['feat/one', 'fix/two'],
    );
  });

  it('does not count the main checkout as a docket', () => {
    const repo = createRepo();
    addWorktree(repo, 'feat/one');

    assert.deepEqual(
      fleet(repo).map((docket) => docket.path),
      [path.join(repo, '.claude', 'worktrees', 'repo-feat-one')],
    );
  });

  it('does not count a detached-HEAD bay as a docket', () => {
    const repo = createRepo();
    git(repo, ['worktree', 'add', '--detach', outsidePath('detached'), 'HEAD']);

    assert.deepEqual(fleet(repo), []);
  });

  it('does not count a bay checked out on the default branch as a docket', () => {
    const repo = createRepo();
    // git will check the trunk out twice when asked forcefully, and a second `main` is not an
    // effort in flight.
    git(repo, ['worktree', 'add', '--force', outsidePath('trunk-again'), 'main']);

    assert.deepEqual(fleet(repo), []);
  });

  it('does not count a prunable worktree whose directory was deleted as a docket', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/one');
    fs.rmSync(bay, { recursive: true, force: true });

    // Still registered, and `resolveLeg` against a path that is not there would warn rather than
    // fail — a docket that reads as stalled instead of gone.
    assert.deepEqual(fleet(repo), []);
  });
});
