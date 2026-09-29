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
  forgePath,
  git,
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
 * The work overlay: the five bookings this machine lays over the shipped route. Written inline
 * rather than read from `~/.waybill/bookings`, so the case asserts on a fixture every machine has
 * rather than on one laptop's state. The cost is that this copy can drift from the real overlay.
 *
 * Both stamps below are shell and are reproduced verbatim from the real bookings — `String.raw`
 * keeps `\[ \]` a literal backslash-bracket rather than a JS escape, which is the difference
 * between a stamp that matches an unticked box and one that silently never matches.
 */
const WORK_REVIEW_STAMP = String.raw`command -v glab >/dev/null 2>&1 || exit 127; iid=$(glab mr view -F json --jq .iid 2>/dev/null) || exit 1; [ -n "$iid" ] && glab api "projects/:id/merge_requests/$iid/approvals" --jq '.approved_by|length' 2>/dev/null | grep -qE '^[1-9]'`;

const WORK_EXECUTE_STAMP = String.raw`ls docs/ideation/*/spec-phase-*.md >/dev/null 2>&1 || exit 1; ! grep -qE '^[[:space:]]*- \[ \]' docs/ideation/*/spec-phase-*.md`;

const WORK_REVIEW = [
  '---',
  'leg: review',
  'command: /mr-review',
  'model: opus',
  'effort: high',
  'handover: transfer',
  `stampCmd: ${WORK_REVIEW_STAMP}`,
  '---',
  'Push the branch, open the merge request, and get it reviewed before anything is merged.',
  '',
].join('\n');

const WORK_BAY = [
  '---',
  'leg: bay',
  'command: /waybill:bay',
  'model: haiku',
  'effort: low',
  'handover: through',
  'stampCmd: false',
  '---',
  'Cut the feature branch and its isolated bay, then move into it. Pass the branch name as the',
  'argument, named for the ticket: `JIRA-123/short-name`, the Jira key exactly as Jira spells it,',
  'uppercase, then a slash, then a few words of slug.',
  '',
].join('\n');

const WORK_CLEANUP = [
  '---',
  'leg: cleanup',
  'command: /mar',
  'model: sonnet',
  'effort: low',
  'handover: through',
  'argument: branch',
  'stampCmd: false',
  '---',
  'Merge the request, then retire the branch and its bay together.',
  '',
].join('\n');

const WORK_SPECS = [
  '---',
  'leg: specs',
  'command: /ideation:ideation',
  'model: opus',
  'effort: high',
  'handover: transfer',
  'stampPath: docs/ideation/*/spec-phase-*.md',
  '---',
  'Turn the contract into implementation-ready phase specs, one per phase. Write every acceptance',
  'item and manual check as a `- [ ]` checkbox: the execute leg is stamped by those boxes being',
  'ticked.',
  '',
].join('\n');

const WORK_EXECUTE = [
  '---',
  'leg: execute',
  'command: /ideation:execute-spec',
  'model: opus',
  'effort: high',
  'handover: transfer',
  'argument: none',
  'stampPath: docs/ideation/*/spec-phase-*.md',
  `stampCmd: ${WORK_EXECUTE_STAMP}`,
  '---',
  'Work the phase specs in order, test first, ticking each `- [ ]` box as it lands.',
  '',
].join('\n');

const WORK_OVERLAY = {
  'waybill-review.md': WORK_REVIEW,
  'waybill-bay.md': WORK_BAY,
  'waybill-cleanup.md': WORK_CLEANUP,
  'ideation-specs.md': WORK_SPECS,
  'ideation-execute.md': WORK_EXECUTE,
};

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
      // `'open'` so the walk reaches `cleanup`: the review leg's stamp asks the forge, and this
      // fixture's request would otherwise be reported as not yet opened.
      withPath(forgePath('open'), () =>
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

describe('the work overlay', () => {
  it('resolves the stock carriers when no overlay is configured at any tier', () => {
    const repo = createRepo();

    // `GIT_CONFIG_GLOBAL=/dev/null` is not belt-and-braces here: the machine this route was built
    // for carries a real global `waybill.bookingsdir`, and without neutralising it this case would
    // silently assert against the work overlay instead of the shipped bookings.
    const bookings = isolated(
      { WAYBILL_BOOKINGS_DIR: undefined, GIT_CONFIG_GLOBAL: '/dev/null' },
      () => resolve(repo),
    );

    assert.equal(bookings.get('review').command, '/waybill:review');
    assert.equal(bookings.get('cleanup').command, '/waybill:cleanup');
    assert.equal(bookings.get('specs').command, '/spec:propose');
    assert.equal(bookings.get('execute').command, '/spec:apply');
  });

  it('rebooks five legs onto the work carriers and leaves none unbound', () => {
    const repo = createRepo();
    const dir = overlayDir(WORK_OVERLAY);

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo));

    assert.equal(bookings.get('review').command, '/mr-review');
    assert.equal(bookings.get('cleanup').command, '/mar');
    assert.equal(bookings.get('specs').command, '/ideation:ideation');
    assert.equal(bookings.get('execute').command, '/ideation:execute-spec');
    // The bay leg keeps the stock carrier; the only thing the overlay changes is how it tells the
    // operator to name the branch, so the body is the only place the rebooking is visible.
    assert.match(bookings.get('bay').body, /JIRA-123\//);
    assert.equal(bookings.size, fs.readdirSync(new URL('../bookings/', import.meta.url)).length,
      'the overlay left a leg unbound, or bound one the shipped route does not have');
  });

  it('gives execute a completion stamp that specs does not have, so the two cannot stamp together', () => {
    // Under an ideation booking there is no `openspec/changes/<id>/` path, so the progress gate
    // short-circuits and the stamp alone decides. Sharing a `stampPath` with `specs` and nothing
    // else would complete both legs in the same instant and step the route over `execute`.
    const repo = createRepo();
    const dir = overlayDir(WORK_OVERLAY);

    const bookings = isolated({ WAYBILL_BOOKINGS_DIR: dir }, () => resolve(repo));
    const specs = bookings.get('specs');
    const execute = bookings.get('execute');

    assert.equal(specs.stampPath, execute.stampPath, 'the premise: the two legs share a path');
    assert.equal(specs.stampCmd, undefined);
    assert.equal(execute.stampCmd, WORK_EXECUTE_STAMP);
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
