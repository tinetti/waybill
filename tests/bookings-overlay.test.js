import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import { run } from '../src/cli.js';
import { resolveBookings } from '../src/bookings.js';
import {
  cleanupAll,
  createRepo,
  git,
  pathWithout,
  tempRoot,
  withEnv,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';
import { cleanupFixture } from './fixtures/cleanup.js';

after(cleanupAll);

const KNOWN_LEGS = LEGS.map((leg) => leg.id);

/**
 * The tiers under test are read by the production code through the *operator's* environment, not
 * through the fixture helper's neutralised one, so an overlay configured globally on this machine
 * would otherwise reach into the cases that assert the default. Every case here declares its own
 * tiers and inherits none.
 *
 * @template T
 * @param {Record<string,string|undefined>} vars the tiers this case is actually testing
 * @param {() => T} fn
 * @returns {T}
 */
function isolated(vars, fn) {
  return withEnv(
    { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', WAYBILL_BOOKINGS_DIR: undefined, ...vars },
    fn,
  );
}

const resolve = (cwd) => resolveBookings(cwd, { knownLegs: KNOWN_LEGS });

/**
 * A booking that rebinds the cleanup leg whole: a different command, a different model, a
 * different stamp, and no `effort` at all — so a per-key merge and a whole-file replacement
 * cannot both satisfy the same assertion.
 */
const OVERLAID_CLEANUP = [
  '---',
  'leg: cleanup',
  'command: /mar',
  'model: overlay-model',
  'handover: through',
  'argument: branch',
  'stampPath: docs/SHIPPED.md',
  '---',
  'Finish the branch the way this machine finishes branches.',
  '',
].join('\n');

/**
 * Write an overlay directory holding `files`, outside any repository under test.
 *
 * @param {Record<string,string>} files basename -> contents
 * @param {string} [root]
 * @returns {string} absolute path to the overlay directory
 */
function overlayDir(files, root = tempRoot()) {
  const dir = path.join(root, 'overlay-bookings');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) writeFile(path.join(dir, name), contents);
  return dir;
}

describe('resolving bookings with no overlay configured', () => {
  it('returns the built-ins, and the cleanup leg is the one Waybill ships', () => {
    const repo = createRepo();
    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(repo));

    assert.equal(bookings.size, fs.readdirSync(new URL('../bookings/', import.meta.url)).length);
    assert.equal(bookings.get('cleanup').command, '/waybill:cleanup');
  });

  it('does not throw outside a git repository', () => {
    const outside = tempRoot();
    assert.doesNotThrow(() => isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(outside)));
  });
});

describe('the WAYBILL_BOOKINGS_DIR tier', () => {
  it('replaces the booking for one leg and leaves every other leg alone', () => {
    const repo = createRepo();
    const dir = overlayDir({ 'cleanup.md': OVERLAID_CLEANUP });

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo));

    assert.equal(bookings.get('cleanup').command, '/mar');
    assert.equal(bookings.get('execute').command, '/spec:apply');
    assert.equal(bookings.size, fs.readdirSync(new URL('../bookings/', import.meta.url)).length);
  });

  it('replaces the booking whole, so a key the overlay omits is gone rather than inherited', () => {
    const repo = createRepo();
    const dir = overlayDir({ 'cleanup.md': OVERLAID_CLEANUP });

    const shipped = isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(repo)).get('cleanup');
    assert.equal(shipped.effort, 'low', 'the shipped booking must carry the key the overlay omits');

    const overlaid = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo)).get('cleanup');
    assert.equal(overlaid.effort, undefined);
    assert.equal(overlaid.stampCmd, undefined);
    assert.equal(overlaid.stampPath, 'docs/SHIPPED.md');
  });

  it('is not an answer when blank, so an exported empty variable falls through', () => {
    const repo = createRepo();
    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: '  ' }, () => resolve(repo));
    assert.equal(bookings.get('cleanup').command, '/waybill:cleanup');
  });

  it('is not an error when it points at a directory that does not exist', () => {
    const repo = createRepo();
    const missing = path.join(tempRoot(), 'no-such-overlay');
    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: missing }, () => resolve(repo));
    assert.equal(bookings.get('cleanup').command, '/waybill:cleanup');
  });
});

describe('the waybill.bookingsdir git config tier', () => {
  it('replaces the booking for one leg', () => {
    const repo = createRepo();
    const dir = overlayDir({ 'cleanup.md': OVERLAID_CLEANUP });
    git(repo, ['config', 'waybill.bookingsdir', dir]);

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(repo));
    assert.equal(bookings.get('cleanup').command, '/mar');
  });

  it('loses to the environment variable, which answers for one invocation', () => {
    const repo = createRepo();
    const root = tempRoot();
    const fromEnv = overlayDir({ 'cleanup.md': OVERLAID_CLEANUP }, root);
    const fromConfig = path.join(root, 'config-bookings');
    fs.mkdirSync(fromConfig, { recursive: true });
    writeFile(path.join(fromConfig, 'cleanup.md'), OVERLAID_CLEANUP.replace('/mar', '/from-config'));
    git(repo, ['config', 'waybill.bookingsdir', fromConfig]);

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: fromEnv }, () => resolve(repo));
    assert.equal(bookings.get('cleanup').command, '/mar');
  });

  it('expands a leading `~`, because an operator writes the setting that way', () => {
    const repo = createRepo();
    const relative = path.join('.waybill-overlay-test', String(process.pid));
    const dir = path.join(process.env.HOME, relative);
    fs.mkdirSync(dir, { recursive: true });
    try {
      writeFile(path.join(dir, 'cleanup.md'), OVERLAID_CLEANUP);
      git(repo, ['config', 'waybill.bookingsdir', `~/${relative}`]);

      const bookings = isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(repo));
      assert.equal(bookings.get('cleanup').command, '/mar');
    } finally {
      fs.rmSync(path.join(process.env.HOME, '.waybill-overlay-test'), { recursive: true, force: true });
    }
  });

  it('resolves a relative setting against the checkout, not the process working directory', () => {
    const repo = createRepo();
    const dir = path.join(repo, '.waybill', 'bookings');
    fs.mkdirSync(dir, { recursive: true });
    writeFile(path.join(dir, 'cleanup.md'), OVERLAID_CLEANUP);
    git(repo, ['config', 'waybill.bookingsdir', '.waybill/bookings']);

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: undefined }, () => resolve(repo));
    assert.equal(bookings.get('cleanup').command, '/mar');
  });
});

describe('an overlay that is itself malformed', () => {
  it('is rejected when it binds a leg that does not exist', () => {
    const repo = createRepo();
    const dir = overlayDir({ 'nope.md': OVERLAID_CLEANUP.replace('leg: cleanup', 'leg: teleport') });

    assert.throws(
      () => isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo)),
      /unknown leg `teleport`/,
    );
  });

  it('is rejected when two of its own files claim one leg', () => {
    const repo = createRepo();
    const dir = overlayDir({ 'a-cleanup.md': OVERLAID_CLEANUP, 'b-cleanup.md': OVERLAID_CLEANUP });

    assert.throws(
      () => isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo)),
      /duplicate leg `cleanup`/,
    );
  });
});

describe('the CLI', () => {
  it('renders the overlaid command, so every load site honours the overlay', () => {
    // A repository standing on the cleanup leg, which is the leg this overlay exists to rebook.
    const fixture = cleanupFixture();
    const dir = overlayDir({ 'cleanup.md': OVERLAID_CLEANUP });

    let output = '';
    const code = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () =>
      withPath(pathWithout('openspec'), () =>
        run(['next'], {
          cwd: fixture.dir,
          out: (text) => (output += text),
          err: (text) => (output += text),
        }),
      ),
    );

    assert.equal(code, 0);
    assert.match(output, /^\/mar feat\/thing$/m);
    assert.match(output, /overlay-model/);
    assert.equal(output.includes('/waybill:cleanup'), false);
  });
});

describe('the worked cleanup example in examples/', () => {
  // Nothing under `examples/` is on any load path, so a typo in `leg`, `argument`, or the stamp
  // would surface for the first time on the operator who followed the README — with the branch
  // they were trying to finish still sitting there. This walks the README's own three commands.
  it('rebooks the cleanup leg when copied into an overlay, exactly as the README says', () => {
    const repo = createRepo();
    const dir = path.join(tempRoot(), 'overlay-from-example');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(fileURLToPath(new URL('../examples/mar-cleanup.md', import.meta.url)),
      path.join(dir, 'cleanup.md'));

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo));
    const booking = bookings.get('cleanup');

    assert.ok(booking, 'the example does not bind the cleanup leg');
    assert.equal(booking.command, '/mar');
    // `argument: branch` is what hands the carrier the branch name rather than the change id.
    assert.equal(booking.argument, 'branch');
    assert.equal(bookings.size, fs.readdirSync(new URL('../bookings/', import.meta.url)).length,
      'the example left a leg unbound');
  });
});
