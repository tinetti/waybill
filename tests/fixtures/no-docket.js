import { commitPapers, createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository standing on its base branch with ideation papers already shipped — the state that
 * used to report `leg 2 of 7 (bay)` from history alone.
 *
 * @returns {import('./ideate.js').LegFixture}
 */
export function noDocketFixture() {
  const repo = createRepo({ remote: true, originHead: true });
  commitPapers(repo, {
    'docs/ideation/shipped/contract.md': '# shipped\n',
    'docs/ideation/shipped/contract-data.json': '{}\n',
  });
  return { dir: repo, repo, branch: 'main' };
}
