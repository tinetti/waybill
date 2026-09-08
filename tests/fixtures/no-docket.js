import { commitPapers, createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository standing on its base branch with ideation papers already shipped — the state that
 * used to report `leg 2 of 7 (bay)` from history alone.
 *
 * The twin of {@link import('./ideate.js').ideateFixture}, which commits nothing: `no-docket.txt`
 * and `ideate.txt` are byte-identical on purpose, because history must not move the render. Keep
 * this fixture differing from that one *only* in what it commits — an assertion in
 * `tests/waybill.test.js` compares the two renders directly, since neither golden file could catch
 * a divergence alone.
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
