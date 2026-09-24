import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import { STAMP_UNKNOWN, evaluateBooking, loadBookings, stampedByCmd } from '../src/bookings.js';
import {
  cleanupAll,
  createRepo,
  git,
  pathWithout,
  stubBin,
  tempRoot,
  withPath,
} from './helpers/repo-fixture.js';

after(cleanupAll);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOKINGS = path.join(ROOT, 'bookings');

/** A binary name no machine has, so "absent" is a property of the test rather than of the laptop. */
const PROBE = 'waybill-review-probe';

/** @param {string} stampCmd @returns {{done:boolean, warnings:string[]}} */
const judge = (stampCmd) =>
  evaluateBooking({ leg: 'review', path: 'bookings/waybill-review.md', stampCmd }, tempRoot(), null);

describe('the stampCmd exit-code contract', () => {
  it('reserves one code for "the stamp could not answer"', () => {
    assert.equal(STAMP_UNKNOWN, 125);
  });

  it('quotes the stamp\'s own first line when it exits 125', () => {
    const result = judge('echo nope; exit 125');

    assert.equal(result.done, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^bookings\/waybill-review\.md: /);
    assert.match(result.warnings[0], /could not answer/);
    assert.match(result.warnings[0], /nope/);
  });

  it('is done and silent on 0', () => {
    assert.deepEqual(judge('exit 0'), { done: true, warnings: [] });
  });

  it('is not done and still silent on 1 — honest work remaining must not shout', () => {
    assert.deepEqual(judge('exit 1'), { done: false, warnings: [] });
  });

  it('keeps the phase-2 missing-binary warning distinct from the could-not-answer one', () => {
    const result = withPath(pathWithout(PROBE), () => judge(`${PROBE} --check`));

    assert.equal(result.done, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /missing binary/);
    assert.match(result.warnings[0], new RegExp(PROBE));
    assert.doesNotMatch(result.warnings[0], /could not answer/);
  });

  it('does not let a chatty stamp inject text into any other verdict', () => {
    // Only 125 quotes stdout. A stamp that prints on its way to 0 or 1 says nothing to the
    // operator, which is what keeps the reason line a deliberate act rather than a leak.
    assert.deepEqual(judge('echo loud; exit 0'), { done: true, warnings: [] });
    assert.deepEqual(judge('echo loud; exit 1'), { done: false, warnings: [] });
  });

  it('still warns on a silent 125, falling back to quoting the command', () => {
    const result = judge('exit 125');

    assert.equal(result.done, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /could not answer/);
    assert.match(result.warnings[0], /exit 125/);
  });

  it('keeps `stampedByCmd` — the warning-less entry point — answering false', () => {
    // `unknown` sets `ran: false`, so the public boolean needed no change: a stamp that cannot
    // answer is not done. The distinction lives entirely in the warning.
    assert.equal(stampedByCmd('echo why; exit 125', tempRoot()), false);
  });
});

describe('the review booking', () => {
  const booking = loadBookings(BOOKINGS, { knownLegs: LEGS.map((leg) => leg.id) }).get('review');

  it('binds the review leg to the carrier Waybill ships', () => {
    assert.ok(booking, 'no shipped booking binds `review`');
    assert.equal(booking.command, '/waybill:review');
    assert.equal(booking.model, 'sonnet');
    assert.equal(booking.effort, 'low');
    assert.equal(booking.handover, 'through');
    assert.equal(booking.argument, 'none');
  });

  it('takes its stamp from the forge rather than from a path on disk', () => {
    // The whole reason the leg is booking-owned: the fact it reads lives outside the repository,
    // so there is nothing for `stampPath` to match and everything for an overlay to replace.
    assert.equal(booking.stampPath, undefined);
    assert.ok(booking.stampCmd);
  });

  it('says in prose that neither CLI is mandatory, and names the overlay as the way out', () => {
    assert.match(booking.body, /`gh` \*\*or\*\* `glab`/);
    assert.match(booking.body, /neither is\nmandatory/);
    assert.match(booking.body, /waybill\.bookingsdir/);
  });

  /**
   * Run the shipped stamp in a throwaway repository under a `PATH` built from `stubs`, with every
   * real `gh`/`glab` stripped out — a developer with an authenticated `gh` would otherwise turn
   * half of this matrix into a false positive.
   *
   * @param {string[]} stubs directories from {@link stubBin}
   * @param {string} [branch]
   * @returns {{done:boolean, warnings:string[]}}
   */
  function stamp(stubs, branch = 'feat/thing') {
    const dir = createRepo({ branch });
    const PATH = [...stubs, pathWithout('gh', 'glab')].join(path.delimiter);
    return withPath(PATH, () => evaluateBooking(booking, dir, null));
  }

  const ghOpen = () => stubBin('gh', 'echo \'[{"number":7}]\'');
  const ghEmpty = () => stubBin('gh', "echo '[]'");
  const gh401 = () => stubBin('gh', 'echo "401 Unauthorized" >&2; exit 1');
  const gh127 = () => stubBin('gh', 'exit 127');
  const glabOpen = () => stubBin('glab', 'echo \'[{"iid":3}]\'');
  const glab401 = () => stubBin('glab', 'echo "401 Unauthorized" >&2; exit 1');

  it('is not done, and silent, when a CLI answers that no request is open', () => {
    // The absence of a warning is half the assertion: honest work remaining must not shout.
    assert.deepEqual(stamp([ghEmpty()]), { done: false, warnings: [] });
  });

  it('is done when a CLI reports a request open for this branch', () => {
    assert.deepEqual(stamp([ghOpen()]), { done: true, warnings: [] });
  });

  it('names a 401 as "could not answer", which exit 127 can never catch', () => {
    // This is the case the phase-2 missing-binary warning misses: an unauthenticated `glab` exits
    // non-zero, not 127, so under the exit-127 rule alone the leg would read as honestly-not-done
    // forever with nothing on screen to say the CLI was answering "I can't".
    const result = stamp([gh401(), glab401()]);

    assert.equal(result.done, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /waybill-review\.md: /);
    assert.match(result.warnings[0], /could not answer/);
    assert.doesNotMatch(result.warnings[0], /missing binary/);
  });

  it('names the no-CLI case differently, since the remedy is different', () => {
    const result = stamp([]);

    assert.equal(result.done, false);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /no forge CLI/);
    assert.match(result.warnings[0], /install gh or glab/);
  });

  it('falls through to glab when gh is the one that cannot answer', () => {
    // Waybill's own repository is on GitHub and work GitLab is self-hosted, so "first one that
    // answers" rather than "first one installed" is the whole design: pinning either CLI stalls
    // the stock route on one of the two repositories it has to work on.
    assert.deepEqual(stamp([gh127(), glabOpen()]), { done: true, warnings: [] });
  });

  it('reads glab\'s "no MR open" as not-done rather than as a failure to answer', () => {
    assert.deepEqual(stamp([gh127(), stubBin('glab', "echo '[]'")]), { done: false, warnings: [] });
  });

  it('is the stamp the shipped command file was written against', () => {
    // Both name the same two CLIs as the only things that can answer. A booking whose stamp asked
    // one question while its carrier asked another would stall the leg after a successful run.
    const source = fs.readFileSync(path.join(ROOT, 'commands', 'review.md'), 'utf8');
    assert.match(source, /gh pr list/);
    assert.match(source, /glab mr list/);
  });

  it('refuses to answer from a detached HEAD rather than probing every open request', () => {
    // `git rev-parse --abbrev-ref HEAD` prints `HEAD` here, and an unguarded `--head ""` would
    // list every open request on the repository and stamp the leg from somebody else's work.
    const dir = createRepo();
    git(dir, ['checkout', '--detach', '--quiet']);
    const PATH = [ghOpen(), pathWithout('gh', 'glab')].join(path.delimiter);

    assert.deepEqual(withPath(PATH, () => evaluateBooking(booking, dir, null)), {
      done: false,
      warnings: [],
    });
  });
});

/**
 * The command file's one `` ! `` line, backticks stripped, skipping the HTML comment where the
 * rule it follows is written out and explained. Modelled on `tests/bang-lines.test.js`, and
 * deliberately a second small copy rather than an import: that suite's extractor is pinned to the
 * commands that shell out to the CLI, which this one must never join.
 *
 * @returns {string}
 */
function bangLine() {
  const source = fs.readFileSync(path.join(ROOT, 'commands', 'review.md'), 'utf8');
  let inComment = false;
  for (const line of source.split('\n')) {
    if (line.includes('<!--')) inComment = true;
    const commented = inComment;
    if (line.includes('-->')) inComment = false;
    if (!commented && line.startsWith('!`') && line.endsWith('`')) return line.slice(2, -1);
  }
  throw new Error('commands/review.md has no `!` line');
}

describe('the `!` line in commands/review.md', () => {
  /**
   * Run it through bash, as the harness does, with every real `gh`/`glab` stripped out.
   *
   * @param {string} cwd
   * @param {string[]} [stubs] directories from {@link stubBin}
   * @returns {{status:number|null, stdout:string, stderr:string}}
   */
  function run(cwd, stubs = []) {
    const PATH = [...stubs, pathWithout('gh', 'glab')].join(path.delimiter);
    return spawnSync('bash', ['-c', bangLine()], { cwd, encoding: 'utf8', env: { ...process.env, PATH } });
  }

  it('exits 0 with no remote and no forge CLI, and names both binaries as absent', () => {
    // Claude Code discards a command file whose `!` line exits non-zero and the Task section never
    // renders — on exactly the machine whose operator most needs to be told what to install.
    const result = run(createRepo({ branch: 'feat/thing' }));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^--- gh:\n\(not installed\)$/m);
    assert.match(result.stdout, /^--- glab:\n\(not installed\)$/m);
    assert.match(result.stdout, /no origin remote/);
    assert.match(result.stdout, /never been pushed/);
  });

  it('exits 0 outside a git repository at all', () => {
    const result = run(tempRoot());

    assert.equal(result.status, 0);
    assert.match(result.stdout, /not inside a git repository/);
  });

  it('exits 0 and reports the request when a forge CLI answers', () => {
    const result = run(createRepo({ branch: 'feat/thing', remote: true, originHead: true }), [
      stubBin('gh', 'case "$1" in repo) echo \'{"nameWithOwner":"o/r"}\';; *) echo "#7 a title";; esac'),
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /nameWithOwner/);
    assert.match(result.stdout, /#7 a title/);
  });

  it('exits 0 when a CLI is installed but cannot answer, and says which of the two it is', () => {
    // The 401 shape. "Installed but cannot answer" and "not installed" have different remedies, so
    // the line has to tell them apart rather than collapsing both into silence.
    const result = run(createRepo({ branch: 'feat/thing', remote: true, originHead: true }), [
      stubBin('glab', 'echo "401 Unauthorized" >&2; exit 1'),
    ]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^--- gh:\n\(not installed\)$/m);
    assert.match(result.stdout, /^--- glab:\n[^\n]*\n\(installed, but cannot answer/m);
  });
});
