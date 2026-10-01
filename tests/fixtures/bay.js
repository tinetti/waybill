import path from 'node:path';

import { createRepo, git, writeFile } from '../helpers/repo-fixture.js';

/**
 * A repository frozen at the `bay` leg: a feature branch is checked out in the *main*
 * checkout, so ideation has clearly happened but the isolated tree Waybill anchors on does not
 * exist yet.
 *
 * The branch carries a commit of its own so it is not trivially contained in the default branch,
 * which would otherwise read as a completed cleanup.
 *
 * @param {string} [branch]
 * @returns {import('../helpers/repo-fixture.js').LegFixture}
 */
export function bayFixture(branch = 'feat/thing') {
  const repo = createRepo({ remote: true, originHead: true });
  git(repo, ['checkout', '-b', branch]);
  writeFile(path.join(repo, 'work.txt'), 'in progress\n');
  git(repo, ['add', 'work.txt']);
  git(repo, ['commit', '-m', 'start the change']);
  return { dir: repo, repo, branch };
}
