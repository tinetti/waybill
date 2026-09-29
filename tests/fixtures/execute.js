import path from 'node:path';

import { writeFile } from '../helpers/repo-fixture.js';
import { specifyFixture } from './specify.js';

/** The change id every task-bearing fixture scaffolds. */
export const CHANGE_ID = 'add-thing';

const TASKS = ['# Tasks', '', '- [x] 1.1 Scaffold', '- [ ] 1.2 Implement', '  - [ ] 1.3 Test', ''].join('\n');

/**
 * A repository frozen at the `execute` leg: a change is scaffolded and partly worked — one of its
 * three tasks is ticked, so progress reports `1 of 3`.
 *
 * @param {string} [branch]
 * @returns {import('../helpers/repo-fixture.js').LegFixture}
 */
export function executeFixture(branch = 'feat/thing') {
  const fixture = specifyFixture(branch);
  writeFile(path.join(fixture.dir, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), TASKS);
  return fixture;
}
