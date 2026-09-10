import { commitPapers, createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository standing on its base branch with ideation papers already shipped — the state that
 * used to report `leg 2 of 7 (bay)` from history alone.
 *
 * `no-docket.txt` is leg 1's waybill, and since the exit contract landed it is what `waybill new`
 * prints rather than what `next` answers with from the trunk: `next` there reports the fleet and
 * issues nothing. The block did not change, it moved to the verb that means it, so the golden is
 * asserted twice on purpose — at renderer level in `tests/waybill.test.js`, and through the verb in
 * `tests/cli.test.js`. Those answer different questions and neither subsumes the other.
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
