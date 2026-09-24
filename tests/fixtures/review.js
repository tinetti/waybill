import path from 'node:path';

import { writeFile } from '../helpers/repo-fixture.js';
import { specsFixture } from './specs.js';
import { CHANGE_ID } from './execute.js';

const TASKS = ['# Tasks', '', '- [x] 1.1 Scaffold', '- [x] 1.2 Implement', '  - [X] 1.3 Test', ''].join('\n');

/**
 * A repository frozen at the `review` leg: every task is ticked, so every leg before this one is
 * complete, and the feature bay is still on disk with nothing yet opened for it on the forge.
 *
 * This is the body `cleanupFixture` used to carry, and it moved here rather than being copied
 * because inserting `review` before `cleanup` moved what that repository *honestly* resolves to.
 * On disk the two states are identical; they differ only in forge state, which is not on disk at
 * all — see `tests/fixtures/cleanup.js`.
 *
 * @param {string} [branch]
 * @returns {import('./ideate.js').LegFixture}
 */
export function reviewFixture(branch = 'feat/thing') {
  const fixture = specsFixture(branch);
  writeFile(path.join(fixture.dir, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), TASKS);
  return fixture;
}
