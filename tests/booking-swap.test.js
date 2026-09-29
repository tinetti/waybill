import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOOKABLE_IDS, LEGS } from '../src/legs.js';
import { renderWaybill } from '../src/waybill.js';
import { resolveLeg } from '../src/inference.js';
import { loadBookings } from '../src/bookings.js';
import { cleanupAll, forgePath, git, tempRoot, withPath, writeFile } from './helpers/repo-fixture.js';
import { cleanupFixture } from './fixtures/cleanup.js';

after(cleanupAll);

const SHIPPED = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bookings');
/** The booking under test, swapped whole: a different command *and* a different stamp. */
const ALTERNATE = [
  '---',
  'leg: execute',
  'command: /ideation:execute-spec',
  'model: placeholder-model',
  'effort: high',
  'handover: transfer',
  'stampPath: openspec/changes/*/EXECUTED',
  '---',
  'Work the spec phase by phase.',
  '',
].join('\n');

/**
 * A throwaway git repository holding a committed copy of the shipped bookings, so the swap is
 * measured against a clean tree that is not the developer's own checkout.
 *
 * @returns {string} the `bookings/` directory inside that repository
 */
function committedCopy() {
  const repo = path.join(tempRoot(), 'plugin');
  const dir = path.join(repo, 'bookings');
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(SHIPPED).filter((name) => name.endsWith('.md'))) {
    fs.copyFileSync(path.join(SHIPPED, entry), path.join(dir, entry));
  }
  git(repo, ['init', '-b', 'main']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-m', 'shipped bookings']);
  assert.equal(git(repo, ['status', '--porcelain']), '', 'the copied tree must start clean');
  return dir;
}

const load = (dir) => loadBookings(dir, { knownLegs: BOOKABLE_IDS });
// `forgePath('open')` rather than a bare `pathWithout('openspec')`: the review leg's stamp asks a
// forge, and this suite's fixture is a docket with every task ticked — so without a stub reporting
// a request open the walk stops at `review` and the swap under test is never reached. See
// {@link forgePath}.
const resolve = (dir, bookings) => withPath(forgePath('open'), () => resolveLeg(dir, bookings));

describe('swapping one booking', () => {
  it('costs exactly one file edit, and that file is a booking', () => {
    const dir = committedCopy();
    const repo = path.dirname(dir);

    writeFile(path.join(dir, 'openspec-execute.md'), ALTERNATE);

    const status = git(repo, ['status', '--porcelain']).split('\n');
    assert.equal(status.length, 1, `expected one changed file, got: ${status.join(' | ')}`);
    assert.match(status[0], /^ ?M bookings\/openspec-execute\.md$/);
  });

  it('moves the resolved leg, in the direction the new stamp demands', () => {
    const dir = committedCopy();
    const fixture = cleanupFixture();

    // Every task is ticked, so the shipped `stampCmd` passes and execute is behind us.
    const before = resolve(fixture.dir, load(dir));
    assert.equal(before.leg, 'cleanup');

    // The replacement looks for a marker file that does not exist, so execute becomes current again.
    writeFile(path.join(dir, 'openspec-execute.md'), ALTERNATE);
    const after = resolve(fixture.dir, load(dir));
    assert.equal(after.leg, 'execute');
  });

  it('moves the emitted command too — a hardcoded stamp would still pass on the leg alone', () => {
    const dir = committedCopy();
    const fixture = cleanupFixture();
    const clean = { ignored: [], warnings: [] };

    const before = renderWaybill(resolve(fixture.dir, load(dir)), clean);
    assert.equal(before.includes('/ideation:execute-spec'), false);

    writeFile(path.join(dir, 'openspec-execute.md'), ALTERNATE);
    const after = renderWaybill(resolve(fixture.dir, load(dir)), clean);

    assert.match(after, /^\/ideation:execute-spec/m);
    assert.equal(after.includes('/spec:apply'), false);
    assert.match(after, /^\/clear$/m);
  });
});

describe('swapping the off-route brainstorm booking', () => {
  // The only surviving reason the brainstorm is a booking at all rather than a carrier hardcoded
  // into `commands/new.md`: an operator can rebook it exactly like a leg. Exercised rather than
  // claimed, because a booking nothing can swap is just a file.
  const ALTERNATE_BRAINSTORM = [
    '---',
    'leg: brainstorm',
    'command: /superpowers:brainstorming',
    'model: placeholder-model',
    'effort: low',
    'handover: transfer',
    'stampCmd: false',
    '---',
    'Pressure-test the idea before anything is cut.',
    '',
  ].join('\n');

  it('rebooks its carrier the same way a leg is rebooked, with one file', () => {
    const dir = committedCopy();

    const before = load(dir).get('brainstorm');
    assert.equal(before.command, '/ideation:brainstorm');

    writeFile(path.join(dir, 'ideation-brainstorm.md'), ALTERNATE_BRAINSTORM);
    const after = load(dir).get('brainstorm');

    assert.equal(after.command, '/superpowers:brainstorming');
    assert.equal(after.model, 'placeholder-model');
    // Still off the route after the swap: rebooking a booking cannot add a leg.
    assert.equal(LEGS.some((leg) => leg.id === 'brainstorm'), false);
  });
});
