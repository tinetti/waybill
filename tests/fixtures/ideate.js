import { addWorktree, createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository frozen at the `ideate` leg: the feature bay exists and is where work happens, but
 * the interview has not produced the contract yet.
 *
 * Nothing is written here on purpose. The leg's stamp is `docs/ideation/*\/contract.md`, so the one
 * thing that must be absent is the contract — and the interview data behind it (`contract-data.json`)
 * is no longer stamped by anything, which is exactly why the two legs this fixture replaces became
 * one.
 *
 * @param {string} [branch]
 * @returns {import('../helpers/repo-fixture.js').LegFixture}
 */
export function ideateFixture(branch = 'feat/thing') {
  const repo = createRepo({ remote: true, originHead: true });
  const dir = addWorktree(repo, branch);
  return { dir, repo, branch };
}
