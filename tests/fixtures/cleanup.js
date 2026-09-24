import { reviewFixture } from './review.js';

/**
 * A repository frozen at the `cleanup` leg: every task is ticked, the request has been opened and
 * reviewed, and the feature bay is still on disk waiting to be folded back in.
 *
 * Delegated rather than written out, because `review` and `cleanup` are **identical on disk**. The
 * only thing that separates them is whether a pull or merge request is open for the branch, and
 * that fact lives on the forge, not in the repository — so this fixture reaches `cleanup` by being
 * resolved under a `PATH` whose stub forge CLI reports one open (`forgePath('open')`), not by
 * writing a file `reviewFixture` does not. Faking a file difference would make the two fixtures
 * disagree about a repository they are supposed to describe the same way.
 *
 * @param {string} [branch]
 * @returns {import('./ideate.js').LegFixture}
 */
export function cleanupFixture(branch = 'feat/thing') {
  return reviewFixture(branch);
}
