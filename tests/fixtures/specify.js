import path from 'node:path';

import { writeFile } from '../helpers/repo-fixture.js';
import { ideateFixture } from './ideate.js';

/**
 * A repository frozen at the `specify` leg: the contract is written, but no change has been
 * scaffolded under `openspec/changes/`.
 *
 * @param {string} [branch]
 * @returns {import('../helpers/repo-fixture.js').LegFixture}
 */
export function specifyFixture(branch = 'feat/thing') {
  const fixture = ideateFixture(branch);
  writeFile(path.join(fixture.dir, 'docs', 'ideation', 'thing', 'contract.md'), '# Contract\n');
  return fixture;
}
