import { createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository that has not started an effort at all: the default branch is checked out and
 * nothing has been written. The brainstorm is off the route, so this is not a leg fixture in the
 * sense the others are — it is the state `/waybill:new` is run from, and the state every leg
 * fixture is built out of.
 *
 * `remote` and `originHead` are set so `defaultBranch` comes from `origin/HEAD` rather than falling
 * back to the current branch — otherwise "standing on a branch other than the default" could never
 * be false for the right reason.
 *
 * @returns {import('../helpers/repo-fixture.js').LegFixture}
 */
export function brainstormFixture() {
  const repo = createRepo({ remote: true, originHead: true });
  return { dir: repo, repo, branch: 'main' };
}
