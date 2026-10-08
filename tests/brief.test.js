import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  HANDOFF_DIR,
  briefContext,
  briefExists,
  briefPath,
  briefTarget,
  ensureHandoff,
} from '../src/brief.js';
import { addWorktree, cleanupAll, createRepo, tempRoot, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

/**
 * A resolved state at a brief-taking leg, with only the fields `src/brief.js` reads.
 *
 * @param {object} [overrides]
 * @returns {import('../src/inference.js').Inference}
 */
function state(overrides = {}) {
  return {
    leg: 'ideate',
    index: 2,
    completed: ['bay'],
    skipped: [],
    booking: { leg: 'ideate', command: '/c', model: 'm', brief: 'what was settled', body: '', path: '' },
    branch: 'feat/x',
    docketOpen: true,
    changeId: null,
    warnings: [],
    ...overrides,
  };
}

describe('briefTarget', () => {
  it('is the next leg when its booking takes a brief', () => {
    assert.equal(briefTarget(state()), 'ideate');
  });

  it('is null when the booking has no `brief`', () => {
    const booking = { leg: 'execute', command: '/c', model: 'm', body: '', path: '' };
    assert.equal(briefTarget(state({ leg: 'execute', booking })), null);
  });

  it('is null with no docket open', () => {
    assert.equal(briefTarget(state({ docketOpen: false })), null);
  });

  it('is null when every leg is complete', () => {
    assert.equal(briefTarget(state({ leg: null, booking: undefined })), null);
  });

  it('is null when no booking is bound to the leg', () => {
    assert.equal(briefTarget(state({ booking: undefined })), null);
  });
});

describe('briefPath and briefExists', () => {
  it('names `<bay>/.waybill/handoff/<leg>.html`', () => {
    assert.equal(briefPath('/bay', 'ideate'), path.join('/bay', '.waybill', 'handoff', 'ideate.html'));
    assert.equal(HANDOFF_DIR, path.join('.waybill', 'handoff'));
  });

  it('reports a brief only once the file is there', () => {
    const bay = tempRoot();
    assert.equal(briefExists(bay, 'ideate'), false);
    writeFile(briefPath(bay, 'ideate'), '<p>brief</p>');
    assert.equal(briefExists(bay, 'ideate'), true);
    assert.equal(briefExists(bay, 'specify'), false);
  });
});

describe('ensureHandoff', () => {
  it('creates the directory and a `.gitignore` that ignores everything in it', () => {
    const bay = tempRoot();
    const file = ensureHandoff(bay, 'ideate');

    assert.equal(file, briefPath(bay, 'ideate'));
    assert.equal(fs.readFileSync(path.join(bay, HANDOFF_DIR, '.gitignore'), 'utf8'), '*\n');
    assert.equal(fs.existsSync(file), false, 'the verb names the path; it writes no brief');
  });

  it('is safe to call twice, and leaves a brief already written alone', () => {
    const bay = tempRoot();
    const file = ensureHandoff(bay, 'ideate');
    fs.writeFileSync(file, '<p>brief</p>');

    assert.equal(ensureHandoff(bay, 'ideate'), file);
    assert.deepEqual(fs.readdirSync(path.join(bay, HANDOFF_DIR)).sort(), ['.gitignore', 'ideate.html']);
    assert.equal(fs.readFileSync(path.join(bay, HANDOFF_DIR, '.gitignore'), 'utf8'), '*\n');
    assert.equal(fs.readFileSync(file, 'utf8'), '<p>brief</p>');
  });
});

describe('briefContext', () => {
  const bayFor = () => addWorktree(createRepo(), 'feat/x');

  it('is null when there is no target', () => {
    assert.equal(briefContext(tempRoot(), state({ docketOpen: false })), null);
  });

  it('carries the leg, the path, the bay, and whether the brief exists', () => {
    const bay = bayFor();
    const before = briefContext(bay, state());

    assert.equal(before.leg, 'ideate');
    assert.equal(before.path, briefPath(bay, 'ideate'));
    assert.equal(before.bay, bay);
    assert.equal(before.exists, false);

    writeFile(briefPath(bay, 'ideate'), '<p>brief</p>');
    assert.equal(briefContext(bay, state()).exists, true);
  });

  it('passes the skipped legs through', () => {
    assert.deepEqual(briefContext(bayFor(), state({ skipped: ['specify'] })).skipped, ['specify']);
  });

  it('names the first leg after this one that is not already done', () => {
    const bay = bayFor();
    assert.equal(briefContext(bay, state()).after, 'specify');
    assert.equal(briefContext(bay, state({ completed: ['bay', 'specify'] })).after, 'execute');
  });

  it('names no following leg at the end of the route', () => {
    const booking = { ...state().booking, leg: 'cleanup' };
    assert.equal(briefContext(bayFor(), state({ leg: 'cleanup', booking })).after, null);
  });

  it('finds the ideation directory from the one contract the docket changed', () => {
    const bay = bayFor();
    assert.equal(briefContext(bay, state()).ideationDir, null);

    writeFile(path.join(bay, 'docs', 'ideation', 'thing', 'contract.md'), '# contract\n');
    assert.equal(briefContext(bay, state()).ideationDir, 'docs/ideation/thing');

    writeFile(path.join(bay, 'docs', 'ideation', 'other', 'contract.md'), '# contract\n');
    assert.equal(briefContext(bay, state()).ideationDir, null, 'two contracts name no one directory');
  });
});
