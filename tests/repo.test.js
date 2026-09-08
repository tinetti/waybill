import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import {
  currentBranch,
  defaultBranch,
  hasRemote,
  inBay,
  mainCheckout,
  resolveBayPath,
} from '../src/repo.js';
import { probeOpenspec } from '../src/openspec.js';
import {
  addSubmodule,
  addWorktree,
  cleanupAll,
  createRepo,
  git,
  pathWithout,
  stubBin,
  tempRoot,
  withEnv,
  withPath,
} from './helpers/repo-fixture.js';

after(cleanupAll);

describe('mainCheckout', () => {
  it('returns the main checkout from the repository root', () => {
    const repo = createRepo();
    assert.equal(mainCheckout(repo), repo);
  });

  it('returns the main checkout from a subdirectory', () => {
    const repo = createRepo();
    const sub = path.join(repo, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(mainCheckout(sub), repo);
  });

  it('returns the main checkout from inside a bay', () => {
    const repo = createRepo();
    const linked = addWorktree(repo, 'feat/x');
    assert.equal(mainCheckout(linked), repo);
  });

  it('works in a repository with zero commits', () => {
    const repo = createRepo({ commit: false });
    assert.equal(mainCheckout(repo), repo);
  });

  it('works when the repository path contains a space', () => {
    const repo = createRepo({ name: 'my repo' });
    assert.equal(mainCheckout(repo), repo);
  });

  it('throws outside a git repository', () => {
    assert.throws(() => mainCheckout(tempRoot()), /not a git repository/i);
  });
});

describe('resolveBayPath', () => {
  it('puts the bay under .claude/worktrees inside the main checkout by default', () => {
    const repo = createRepo();
    assert.equal(resolveBayPath('plain', repo), path.join(repo, '.claude', 'worktrees', 'repo-plain'));
  });

  it('replaces every slash in the branch name', () => {
    const repo = createRepo();
    const dir = path.join(repo, '.claude', 'worktrees');
    assert.equal(resolveBayPath('feat/x', repo), path.join(dir, 'repo-feat-x'));
    assert.equal(resolveBayPath('feat/a/b', repo), path.join(dir, 'repo-feat-a-b'));
  });

  it('derives the same path from inside a bay', () => {
    const repo = createRepo();
    const linked = addWorktree(repo, 'feat/x');
    assert.equal(
      resolveBayPath('feat/a/b', linked),
      path.join(repo, '.claude', 'worktrees', 'repo-feat-a-b'),
    );
  });

  it('handles a repository path containing a space', () => {
    const repo = createRepo({ name: 'my repo' });
    assert.equal(
      resolveBayPath('feat/x', repo),
      path.join(repo, '.claude', 'worktrees', 'my repo-feat-x'),
    );
  });

  it('works in a repository with zero commits', () => {
    const repo = createRepo({ commit: false, branch: 'ideation/waybill' });
    assert.equal(resolveBayPath('feat/x', repo), path.join(repo, '.claude', 'worktrees', 'repo-feat-x'));
  });
});

describe('resolveBayPath is configurable', () => {
  it('reproduces the old sibling convention when waybill.baydir is `..`', () => {
    const repo = createRepo();
    const dir = path.dirname(repo);
    git(repo, ['config', 'waybill.baydir', '..']);

    assert.equal(resolveBayPath('plain', repo), path.join(dir, 'repo-plain'));
    assert.equal(resolveBayPath('feat/x', repo), path.join(dir, 'repo-feat-x'));
    assert.equal(resolveBayPath('feat/a/b', repo), path.join(dir, 'repo-feat-a-b'));
  });

  it('keeps the sibling convention reachable from inside a bay and with a space in the path', () => {
    const spaced = createRepo({ name: 'my repo' });
    git(spaced, ['config', 'waybill.baydir', '..']);
    assert.equal(resolveBayPath('feat/x', spaced), path.join(path.dirname(spaced), 'my repo-feat-x'));

    const repo = createRepo();
    git(repo, ['config', 'waybill.baydir', '..']);
    const linked = addWorktree(repo, 'feat/x');
    assert.equal(linked, path.join(path.dirname(repo), 'repo-feat-x'));
    assert.equal(resolveBayPath('feat/a/b', linked), path.join(path.dirname(repo), 'repo-feat-a-b'));
  });

  it('uses an absolute waybill.baydir as the container directory as it stands', () => {
    const repo = createRepo();
    const elsewhere = tempRoot();
    git(repo, ['config', 'waybill.baydir', elsewhere]);

    assert.equal(resolveBayPath('feat/x', repo), path.join(elsewhere, 'repo-feat-x'));
  });

  it('resolves a relative waybill.baydir against the main checkout, not the cwd', () => {
    const repo = createRepo();
    const sub = path.join(repo, 'a', 'b');
    fs.mkdirSync(sub, { recursive: true });
    git(repo, ['config', 'waybill.baydir', 'bays']);

    assert.equal(resolveBayPath('feat/x', sub), path.join(repo, 'bays', 'repo-feat-x'));
  });

  it('lets WAYBILL_BAY_DIR win over the git config', () => {
    const repo = createRepo();
    git(repo, ['config', 'waybill.baydir', 'from-config']);

    const target = withEnv({ WAYBILL_BAY_DIR: 'from-env' }, () => resolveBayPath('feat/x', repo));
    assert.equal(target, path.join(repo, 'from-env', 'repo-feat-x'));
  });

  it('ignores an empty WAYBILL_BAY_DIR rather than resolving the bay onto the checkout root', () => {
    const repo = createRepo();

    const target = withEnv({ WAYBILL_BAY_DIR: '  ' }, () => resolveBayPath('feat/x', repo));
    assert.equal(target, path.join(repo, '.claude', 'worktrees', 'repo-feat-x'));
  });

  it('lets an explicit bayDir win over both the environment and the config', () => {
    const repo = createRepo();
    git(repo, ['config', 'waybill.baydir', 'from-config']);

    const target = withEnv({ WAYBILL_BAY_DIR: 'from-env' }, () =>
      resolveBayPath('feat/x', repo, { bayDir: 'from-caller' }),
    );
    assert.equal(target, path.join(repo, 'from-caller', 'repo-feat-x'));
  });
});

describe('currentBranch', () => {
  it('reports the checked-out branch', () => {
    assert.equal(currentBranch(createRepo({ branch: 'main' })), 'main');
  });

  it('reports the branch of a repository with zero commits', () => {
    assert.equal(currentBranch(createRepo({ commit: false, branch: 'ideation/waybill' })), 'ideation/waybill');
  });

  it('returns null on a detached HEAD', () => {
    const repo = createRepo();
    git(repo, ['checkout', '--detach']);
    assert.equal(currentBranch(repo), null);
  });

  it('returns null outside a git repository', () => {
    assert.equal(currentBranch(tempRoot()), null);
  });
});

describe('hasRemote', () => {
  it('is false for a fresh repository with no origin', () => {
    assert.equal(hasRemote(createRepo()), false);
  });

  it('is true once origin exists', () => {
    assert.equal(hasRemote(createRepo({ remote: true })), true);
  });

  it('is false outside a git repository', () => {
    assert.equal(hasRemote(tempRoot()), false);
  });
});

describe('defaultBranch', () => {
  it('reads origin/HEAD when a remote publishes one', () => {
    const repo = createRepo({ branch: 'trunk', remote: true, originHead: true });
    git(repo, ['checkout', '-b', 'feat/x']);
    assert.equal(defaultBranch(repo), 'trunk');
  });

  it('falls back to the current branch when origin publishes no HEAD', () => {
    const repo = createRepo({ branch: 'main', remote: true });
    git(repo, ['checkout', '-b', 'feat/x']);
    assert.equal(defaultBranch(repo), 'feat/x');
  });

  it('falls back to the current branch when there is no remote', () => {
    assert.equal(defaultBranch(createRepo({ branch: 'trunk' })), 'trunk');
  });

  it('does not throw in a repository with zero commits', () => {
    assert.equal(defaultBranch(createRepo({ commit: false, branch: 'main' })), 'main');
  });
});

describe('inBay', () => {
  it('is false in the main checkout', () => {
    assert.equal(inBay(createRepo()), false);
  });

  it('is true inside a bay', () => {
    const repo = createRepo();
    assert.equal(inBay(addWorktree(repo, 'feat/x')), true);
  });

  it('is true from a subdirectory of a bay', () => {
    const repo = createRepo();
    const linked = addWorktree(repo, 'feat/x');
    const sub = path.join(linked, 'nested');
    fs.mkdirSync(sub, { recursive: true });
    assert.equal(inBay(sub), true);
  });

  it('is false inside a submodule', () => {
    const root = tempRoot();
    const parent = createRepo({ root, name: 'parent' });
    const child = createRepo({ root, name: 'child' });
    assert.equal(inBay(addSubmodule(parent, child)), false);
  });

  it('is false outside a git repository', () => {
    assert.equal(inBay(tempRoot()), false);
  });

  it('is false in a repository with zero commits', () => {
    assert.equal(inBay(createRepo({ commit: false })), false);
  });
});

describe('probeOpenspec', () => {
  const STUB = [
    'if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi',
    'if [ "$1" = "status" ]; then echo \'{"changeName":"x","isComplete":false}\'; exit 0; fi',
    'exit 1',
  ].join('\n');

  const absent = () => pathWithout('openspec');

  it('reports the CLI as available and records its version and observed fields', () => {
    const cwd = tempRoot();
    const result = withPath(`${stubBin('openspec', STUB)}:${absent()}`, () => probeOpenspec(cwd));
    assert.equal(result.available, true);
    assert.equal(result.version, '1.9.0');
    assert.deepEqual(result.fields, ['changeName', 'isComplete']);
  });

  it('reports unavailable when the CLI is absent', () => {
    const result = withPath(absent(), () => probeOpenspec(tempRoot()));
    assert.equal(result.available, false);
    assert.equal(result.version, undefined);
  });

  it('reports unavailable when the CLI exits non-zero', () => {
    const stub = stubBin('openspec', 'exit 3');
    const result = withPath(`${stub}:${absent()}`, () => probeOpenspec(tempRoot()));
    assert.equal(result.available, false);
  });

  it('records no fields when the status output is not JSON', () => {
    const stub = stubBin(
      'openspec',
      ['if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi', 'echo "not json"', 'exit 0'].join('\n'),
    );
    const result = withPath(`${stub}:${absent()}`, () => probeOpenspec(tempRoot()));
    assert.equal(result.available, true);
    assert.equal(result.fields, undefined);
  });

  it('never throws when the CLI hangs', () => {
    const stub = stubBin(
      'openspec',
      ['if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi', 'sleep 30'].join('\n'),
    );
    const result = withPath(`${stub}:${absent()}`, () => probeOpenspec(tempRoot()));
    assert.equal(result.available, true);
    assert.equal(result.fields, undefined);
  });
});
