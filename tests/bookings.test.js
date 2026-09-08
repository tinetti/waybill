import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { bookingIsDone, loadBookings, stampedByCmd, stampedByPath } from '../src/bookings.js';
import { cleanupAll, tempRoot, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

const VALID = [
  '---',
  'leg: contract',
  'command: /ideation:ideation',
  'model: opus',
  'effort: high',
  'handover: transfer',
  'stampPath: docs/ideation/*/contract-data.json',
  '---',
  'Run the ideation interview to produce the contract.',
  '',
].join('\n');

/**
 * @param {Record<string,string>} files basename → contents
 * @returns {string} the bookings directory
 */
function bookingDir(files) {
  const dir = path.join(tempRoot(), 'bookings');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) writeFile(path.join(dir, name), contents);
  return dir;
}

describe('loadBookings', () => {
  it('indexes bookings by leg and keeps the body as waybill text', () => {
    const dir = bookingDir({ 'ideation-contract.md': VALID });
    const bookings = loadBookings(dir);

    assert.equal(bookings.size, 1);
    const booking = bookings.get('contract');
    assert.equal(booking.leg, 'contract');
    assert.equal(booking.command, '/ideation:ideation');
    assert.equal(booking.model, 'opus');
    assert.equal(booking.effort, 'high');
    assert.equal(booking.handover, 'transfer');
    assert.equal(booking.stampPath, 'docs/ideation/*/contract-data.json');
    assert.equal(booking.stampCmd, undefined);
    assert.equal(booking.body, 'Run the ideation interview to produce the contract.\n');
    assert.equal(booking.path, path.join(dir, 'ideation-contract.md'));
  });

  it('returns an empty map for a directory with no bookings', () => {
    assert.equal(loadBookings(bookingDir({})).size, 0);
  });

  it('returns an empty map for a directory that does not exist', () => {
    assert.equal(loadBookings(path.join(tempRoot(), 'nope')).size, 0);
  });

  it('ignores files that are not bookings', () => {
    const dir = bookingDir({ 'ideation-contract.md': VALID, 'README.txt': 'not a booking' });
    assert.equal(loadBookings(dir).size, 1);
  });

  it('accepts a booking whose only stamp is stampCmd', () => {
    const md = ['---', 'leg: execute', 'command: /spec:apply', 'model: opus', 'stampCmd: exit 0', '---', ''].join('\n');
    const booking = loadBookings(bookingDir({ 'openspec-execute.md': md })).get('execute');
    assert.equal(booking.stampCmd, 'exit 0');
    assert.equal(booking.stampPath, undefined);
  });

  for (const key of ['leg', 'command', 'model']) {
    it(`rejects a booking missing ${key}`, () => {
      const md = VALID.split('\n')
        .filter((line) => !line.startsWith(`${key}:`))
        .join('\n');
      assert.throws(() => loadBookings(bookingDir({ 'broken.md': md })), new RegExp(`broken\\.md.*${key}`, 's'));
    });
  }

  it('rejects a booking with no stamp — a leg that can never complete stalls inference', () => {
    const md = ['---', 'leg: contract', 'command: /ideation:ideation', 'model: opus', '---', ''].join('\n');
    assert.throws(() => loadBookings(bookingDir({ 'nostamp.md': md })), /nostamp\.md.*stamp/s);
  });

  it('rejects two bookings claiming the same leg, naming both files', () => {
    assert.throws(
      () => loadBookings(bookingDir({ 'a.md': VALID, 'b.md': VALID })),
      /duplicate leg `contract`.*a\.md.*b\.md/s,
    );
  });

  it('rejects an unknown leg name when the caller supplies the known set', () => {
    const dir = bookingDir({ 'ideation-contract.md': VALID });
    assert.throws(() => loadBookings(dir, { knownLegs: ['specs', 'execute'] }), /unknown leg `contract`/);
    assert.equal(loadBookings(dir, { knownLegs: ['contract'] }).size, 1);
  });

  it('propagates frontmatter parse errors with the booking path', () => {
    assert.throws(() => loadBookings(bookingDir({ 'listy.md': '---\nleg: contract\n- one\n---\n' })), /listy\.md:3:/);
  });

  for (const value of ['change-id', 'branch', 'none']) {
    it(`accepts \`argument: ${value}\``, () => {
      const md = VALID.replace('handover: transfer', `handover: transfer\nargument: ${value}`);
      assert.equal(loadBookings(bookingDir({ 'a.md': md })).get('contract').argument, value);
    });
  }

  it('leaves `argument` unset when the booking declares none, rather than defaulting it here', () => {
    // The default belongs to the renderer, which is the only layer that knows what the fact is for.
    assert.equal(loadBookings(bookingDir({ 'a.md': VALID })).get('contract').argument, undefined);
  });

  it('rejects an unknown `argument` source, naming the file and the values it could have used', () => {
    const md = VALID.replace('handover: transfer', 'handover: transfer\nargument: change_id');
    assert.throws(
      () => loadBookings(bookingDir({ 'typo.md': md })),
      /typo\.md.*`argument`.*change-id.*branch.*none/s,
    );
  });
});

describe('stampedByPath', () => {
  it('matches a literal path relative to the repository root', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'x', 'tasks.md'), '- [ ] a\n');
    const changed = new Set(['openspec/changes/x/tasks.md']);
    assert.equal(stampedByPath('openspec/changes/x/tasks.md', root, changed), true);
    assert.equal(stampedByPath('openspec/changes/y/tasks.md', root, changed), false);
  });

  it('matches an unquoted glob segment', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'waybill', 'contract-data.json'), '{}');
    const changed = new Set(['docs/ideation/waybill/contract-data.json']);
    assert.equal(stampedByPath('docs/ideation/*/contract-data.json', root, changed), true);
    assert.equal(stampedByPath('docs/ideation/*/nothing.json', root, changed), false);
  });

  it('matches a ** segment across depths', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'a', 'b', 'c', 'tasks.md'), '');
    assert.equal(stampedByPath('**/tasks.md', root, new Set(['a/b/c/tasks.md'])), true);
    assert.equal(stampedByPath('**/other.md', root, new Set(['a/b/c/tasks.md'])), false);
  });

  it('does not match a file that exists but is not in the changed set', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'shipped', 'contract.md'), '# old\n');
    assert.equal(stampedByPath('docs/ideation/*/contract.md', root, new Set()), false);
  });

  it('matches only the changed one when several exist on disk', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'shipped', 'contract.md'), '# old\n');
    writeFile(path.join(root, 'docs', 'ideation', 'live', 'contract.md'), '# new\n');
    const changed = new Set(['docs/ideation/live/contract.md']);
    assert.equal(stampedByPath('docs/ideation/*/contract.md', root, changed), true);
  });

  it('stamps nothing when the changed set is unknown', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'x', 'tasks.md'), '- [ ] a\n');
    assert.equal(stampedByPath('openspec/changes/x/tasks.md', root, null), false);
  });

  it('is false when the repository root does not exist', () => {
    assert.equal(stampedByPath('anything', path.join(tempRoot(), 'missing'), new Set()), false);
  });

  it('does not match a directory, in the one shape git reports one', () => {
    // `git ls-files --others` collapses an untracked nested repository to a single trailing-slash
    // entry, `vendor/sub/` — the only directory either half of `changedPaths` can emit. A walker
    // that matched the directory itself would compare `vendor/sub` against it and never stamp
    // anyway; the guard is what makes that a property rather than an accident of two output formats.
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'vendor', 'sub'), { recursive: true });
    assert.equal(stampedByPath('vendor/*', root, new Set(['vendor/sub/'])), false);
    // And the shape git cannot produce is rejected too, which is the guard's own contribution.
    assert.equal(stampedByPath('vendor/sub', root, new Set(['vendor/sub'])), false);
  });
});

describe('stampedByCmd', () => {
  it('is true when the command exits 0', () => {
    assert.equal(stampedByCmd('exit 0', tempRoot()), true);
  });

  it('is false when the command exits non-zero', () => {
    assert.equal(stampedByCmd('exit 1', tempRoot()), false);
  });

  it('is false — never thrown — when the command does not exist (exit 127)', () => {
    assert.equal(stampedByCmd('waybill-no-such-binary-xyz', tempRoot()), false);
  });

  it('runs in the given cwd and ignores stdout', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'marker'), '');
    assert.equal(stampedByCmd('cat marker && echo loud', root), true);
  });
});

describe('bookingIsDone', () => {
  const root = tempRoot();
  writeFile(path.join(root, 'docs', 'ideation', 'waybill', 'contract-data.json'), '{}');
  const changed = new Set(['docs/ideation/waybill/contract-data.json']);

  it('uses the path stamp alone when it is the only one', () => {
    assert.equal(bookingIsDone({ stampPath: 'docs/ideation/*/contract-data.json' }, root, changed), true);
    assert.equal(bookingIsDone({ stampPath: 'docs/ideation/*/missing.json' }, root, changed), false);
  });

  it('uses the command stamp alone when it is the only one', () => {
    assert.equal(bookingIsDone({ stampCmd: 'exit 0' }, root, changed), true);
    assert.equal(bookingIsDone({ stampCmd: 'exit 1' }, root, changed), false);
  });

  it('requires both stamps to pass when both are present', () => {
    const pathOk = 'docs/ideation/*/contract-data.json';
    assert.equal(bookingIsDone({ stampPath: pathOk, stampCmd: 'exit 0' }, root, changed), true);
    assert.equal(bookingIsDone({ stampPath: pathOk, stampCmd: 'exit 1' }, root, changed), false);
    assert.equal(bookingIsDone({ stampPath: 'docs/nope', stampCmd: 'exit 0' }, root, changed), false);
  });

  it('is false when a booking carries no stamp at all', () => {
    assert.equal(bookingIsDone({}, root, changed), false);
  });

  it('is false for a path stamp when the changed set is unknown, even though both stamps would otherwise pass', () => {
    assert.equal(bookingIsDone({ stampPath: 'docs/ideation/*/contract-data.json', stampCmd: 'exit 0' }, root, null), false);
  });
});
