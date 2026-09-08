import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import { resolveLeg } from '../src/inference.js';
import { executeProgress } from '../src/progress.js';
import { loadBookings } from '../src/bookings.js';
import {
  addSubmodule,
  addWorktree,
  cleanupAll,
  commitPapers,
  createRepo,
  git,
  pathWithout,
  stubBin,
  tempRoot,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';
import { ideateFixture } from './fixtures/ideate.js';
import { bayFixture } from './fixtures/bay.js';
import { refineFixture } from './fixtures/refine.js';
import { contractFixture } from './fixtures/contract.js';
import { specsFixture } from './fixtures/specs.js';
import { CHANGE_ID, executeFixture } from './fixtures/execute.js';
import { cleanupFixture } from './fixtures/cleanup.js';

after(cleanupAll);

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const KNOWN_LEGS = LEGS.map((leg) => leg.id);

/** A `PATH` with the real openspec CLI removed, so inference is judged on repository state alone. */
const absent = () => pathWithout('openspec');

/**
 * @param {string} dir
 * @param {Map<string, import('../src/bookings.js').Booking>} [bookings]
 */
const resolve = (dir, bookings) => withPath(absent(), () => resolveLeg(dir, bookings));

/**
 * @param {Record<string,string>} files basename → contents
 * @returns {Map<string, import('../src/bookings.js').Booking>}
 */
function bookingMap(files) {
  const dir = path.join(tempRoot(), 'bookings');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) writeFile(path.join(dir, name), contents);
  return loadBookings(dir, { knownLegs: KNOWN_LEGS });
}

describe('LEGS', () => {
  it('is the fixed seven-leg model, in order', () => {
    assert.deepEqual(KNOWN_LEGS, [
      'ideate',
      'bay',
      'refine',
      'contract',
      'specs',
      'execute',
      'cleanup',
    ]);
  });

  it('has one fixture per leg and no strays — criterion 1 counts this directory', () => {
    assert.equal(fs.readdirSync(FIXTURES).length, LEGS.length);
  });
});

describe('the shipped bookings', () => {
  const bookings = loadBookings(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bookings'),
    { knownLegs: KNOWN_LEGS },
  );

  it('binds a waybill to all seven legs — the loop is closed', () => {
    // `bay` and `cleanup` are wrapper-owned for *stamping* and booking-bound for their
    // waybills: `owner` in LEGS says who supplies the stamp, not who supplies the command and
    // the prose.
    assert.deepEqual([...bookings.keys()].sort(), [...KNOWN_LEGS].sort());
  });

  it('names a model and an effort on every booking, so no leg can leave one unsourced', () => {
    for (const booking of bookings.values()) {
      assert.ok(booking.model, `${booking.path} has no model`);
      assert.ok(booking.effort, `${booking.path} has no effort`);
    }
  });

  it('keeps refine and contract on one command, separated only by stamp', () => {
    assert.equal(bookings.get('refine').command, bookings.get('contract').command);
    assert.notEqual(
      bookings.get('refine').stampPath,
      bookings.get('contract').stampPath,
    );
  });

  it('enters the contract leg through, because the refine waybill promises one unbroken session', () => {
    // `handover` describes how to *enter* a leg. The refine body tells the operator to carry
    // straight on into the contract, so a `transfer` here would discard the interview that the
    // contract is written from — the two bookings would be giving opposite instructions.
    assert.equal(bookings.get('contract').handover, 'through');
  });
});

describe('resolveLeg', () => {
  const cases = [
    ['ideate', ideateFixture],
    ['bay', bayFixture],
    ['refine', refineFixture],
    ['contract', contractFixture],
    ['specs', specsFixture],
    ['execute', executeFixture],
    ['cleanup', cleanupFixture],
  ];

  for (const [id, build] of cases) {
    it(`resolves the ${id} fixture to the ${id} leg`, () => {
      const fixture = build();
      const result = resolve(fixture.dir);

      assert.equal(result.leg, id);
      assert.equal(result.index, KNOWN_LEGS.indexOf(id) + 1);
      assert.deepEqual(result.completed, KNOWN_LEGS.slice(0, KNOWN_LEGS.indexOf(id)));
      assert.deepEqual(result.skipped, []);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.branch, fixture.branch);
    });
  }

  it('carries the booking for the current leg', () => {
    const result = resolve(specsFixture().dir);
    assert.equal(result.booking.command, '/spec:propose');
    assert.match(result.booking.path, /openspec-specs\.md$/);
  });

  it('carries the booking for a wrapper-owned leg too, since the waybill is not the stamp', () => {
    const result = resolve(bayFixture().dir);
    assert.equal(result.booking.command, '/waybill:start');
    assert.match(result.booking.path, /waybill-bay\.md$/);
  });

  it('carries the booking for the terminal leg too, so the loop closes on a waybill', () => {
    const result = resolve(cleanupFixture().dir);
    assert.equal(result.leg, 'cleanup');
    assert.match(result.booking.path, /waybill-cleanup\.md$/);
  });

  it('leaves booking undefined for a leg no booking is bound to', () => {
    // Every shipped leg is bound now, so the unbound render path is reachable only by an operator
    // who removed a booking — which is exactly the case worth keeping covered.
    assert.equal(resolve(cleanupFixture().dir, bookingMap({})).booking, undefined);
  });

  it('reports execute progress from the tasks list, and only on the execute leg', () => {
    assert.deepEqual(resolve(executeFixture().dir).progress, {
      done: 1,
      total: 3,
      source: 'tasks-md',
      changeId: CHANGE_ID,
    });
    assert.equal(resolve(specsFixture().dir).progress, undefined);
  });

  it('names the change id once one has been scaffolded', () => {
    assert.equal(resolve(executeFixture().dir).changeId, CHANGE_ID);
    assert.equal(resolve(specsFixture().dir).changeId, null);
  });

  it('adopts the CLI change id when the filesystem walk found none', () => {
    // The one case where the two sources disagree: `discoverChangeId` skips `archive` while the
    // specs stamp's `openspec/changes/*/tasks.md` still matches it, so the leg is `execute`
    // with no id from disk. Phase 3 interpolates this id into the waybill command.
    const { dir } = specsFixture();
    writeFile(path.join(dir, 'openspec', 'changes', 'archive', 'tasks.md'), '- [ ] a\n');

    const listing = JSON.stringify({
      changes: [{ name: CHANGE_ID, completedTasks: 4, totalTasks: 9 }],
      root: { path: '.', source: 'x' },
    });
    const stub = stubBin(
      'openspec',
      ['if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi', `echo '${listing}'`].join('\n'),
    );

    const result = withPath(`${stub}:${absent()}`, () => resolveLeg(dir));
    assert.equal(result.leg, 'execute');
    assert.equal(result.progress.changeId, CHANGE_ID);
    assert.equal(result.changeId, CHANGE_ID);
  });

  it('never names the current leg as skipped, even with later legs complete', () => {
    const { dir } = bayFixture();
    writeFile(path.join(dir, 'docs', 'ideation', 'thing', 'contract-data.json'), '{}\n');
    writeFile(path.join(dir, 'docs', 'ideation', 'thing', 'contract.md'), '# Contract\n');

    const result = resolve(dir);
    assert.equal(result.leg, 'bay');
    assert.deepEqual(result.completed, ['ideate', 'refine', 'contract']);
    assert.deepEqual(result.skipped, []);
  });

  it('names the hole a leg done by hand out of order leaves behind', () => {
    const { dir } = bayFixture();
    writeFile(path.join(dir, 'docs', 'ideation', 'thing', 'contract.md'), '# Contract\n');
    writeFile(path.join(dir, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), '- [ ] a\n');

    const result = resolve(dir);
    assert.equal(result.leg, 'bay');
    assert.deepEqual(result.completed, ['ideate', 'contract', 'specs']);
    assert.deepEqual(result.skipped, ['refine']);
  });

  it('falls off the end of the walk when all seven legs pass', () => {
    const repo = createRepo({ remote: true, originHead: true });

    // Registered off the `gwt` path on purpose: `bayIsDone` sees a linked worktree while
    // `cleanupIsDone` sees nothing at the convention path, which is the one arrangement in which
    // all seven legs can be complete at once (both stamps are convention-keyed by design).
    const elsewhere = path.join(tempRoot(), 'off-convention');
    git(repo, ['worktree', 'add', '--no-track', '-b', 'feat/thing', elsewhere]);

    // Left uncommitted, deliberately: committing these onto `feat/thing` would move its ref past
    // `main`, and `isMerged` would then read false. Leaving them as untracked files in the bay's
    // working tree keeps the branch ref identical to base (trivially merged) while still landing
    // in `changedPaths`' untracked-file half — the one way a fully "landed" docket can still carry
    // a diff worth stamping.
    writeFile(path.join(elsewhere, 'docs', 'ideation', 'thing', 'contract-data.json'), '{}\n');
    writeFile(path.join(elsewhere, 'docs', 'ideation', 'thing', 'contract.md'), '# Contract\n');
    writeFile(path.join(elsewhere, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), '- [x] a\n- [x] b\n');

    const result = resolve(elsewhere);
    assert.equal(result.leg, null);
    assert.equal(result.index, LEGS.length);
    assert.deepEqual(result.completed, KNOWN_LEGS);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.booking, undefined);
    assert.equal(result.progress, undefined);
    assert.deepEqual(result.warnings, []);

    // `index` alone cannot tell this state from a current `cleanup` leg; `leg` is the discriminator.
    assert.equal(resolve(cleanupFixture().dir).index, result.index);
  });

  it('resolves against the superproject when called from inside a submodule', () => {
    const fixture = specsFixture();
    const sub = addSubmodule(fixture.dir, createRepo({ name: 'child' }));

    const result = resolve(sub);
    assert.equal(result.leg, 'specs');
    assert.equal(result.branch, fixture.branch);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /submodule/);
    assert.equal(result.warnings[0].includes(fixture.dir), true);
  });

  it('does not mark a leg skipped when nothing after it is complete', () => {
    assert.deepEqual(resolve(contractFixture().dir).skipped, []);
  });

  it('degrades a stamp that cannot run to a warning rather than a throw', () => {
    const bookings = bookingMap({
      'broken-specs.md': [
        '---',
        'leg: specs',
        'command: /spec:propose',
        'model: placeholder',
        'stampCmd: waybill-no-such-binary-xyz',
        '---',
        '',
      ].join('\n'),
    });

    const result = resolve(specsFixture().dir, bookings);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /broken-specs\.md/);
    assert.match(result.warnings[0], /waybill-no-such-binary-xyz/);
    assert.equal(result.completed.includes('specs'), false);
  });

  it('never throws outside a git repository', () => {
    const result = resolve(tempRoot());
    assert.equal(result.leg, 'ideate');
    assert.equal(result.branch, null);
    assert.match(result.warnings[0], /not a git repository/);
  });

  it('never throws on a detached HEAD', () => {
    const repo = createRepo({ remote: true, originHead: true });
    git(repo, ['checkout', '--detach', 'HEAD']);
    const result = resolve(repo);
    assert.equal(result.branch, null);
    assert.equal(result.leg, 'ideate');
  });

  it('never throws in a repository with no commits', () => {
    assert.equal(resolve(createRepo({ commit: false })).leg, 'ideate');
  });

  describe('docketOpen', () => {
    it('is false on the base branch', () => {
      const repo = createRepo({ remote: true, originHead: true });
      assert.equal(resolveLeg(repo).docketOpen, false);
    });

    it('is true in a bay on a feature branch', () => {
      const repo = createRepo({ remote: true, originHead: true });
      const bay = addWorktree(repo, 'feat/thing');
      assert.equal(resolveLeg(bay).docketOpen, true);
    });

    it('is false outside a repository', () => {
      assert.equal(resolveLeg(path.join(tempRoot(), 'missing')).docketOpen, false);
    });
  });
});

describe('shipped papers do not stamp a docket', () => {
  it('reports no docket on a base branch carrying shipped ideation papers', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, {
      'docs/ideation/shipped/contract.md': '# shipped\n',
      'docs/ideation/shipped/contract-data.json': '{}\n',
    });

    const state = resolveLeg(repo);
    assert.equal(state.docketOpen, false);
    assert.equal(state.leg, 'ideate');
    assert.deepEqual(state.completed, []);
  });

  it('reports refine in a fresh bay, not specs', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, {
      'docs/ideation/shipped/contract.md': '# shipped\n',
      'docs/ideation/shipped/contract-data.json': '{}\n',
    });
    const bay = addWorktree(repo, 'feat/thing');

    const state = resolveLeg(bay);
    assert.equal(state.docketOpen, true);
    assert.equal(state.leg, 'refine');
    assert.deepEqual(state.completed, ['ideate', 'bay']);
  });

  it('stamps refine once this docket writes its own papers', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, { 'docs/ideation/shipped/contract-data.json': '{}\n' });
    const bay = addWorktree(repo, 'feat/thing');
    writeFile(path.join(bay, 'docs', 'ideation', 'live', 'contract-data.json'), '{}\n');

    assert.equal(resolveLeg(bay).completed.includes('refine'), true);
  });
});

describe('executeProgress', () => {
  /**
   * @param {string} tasks contents of `tasks.md`, or `null` to omit the file entirely
   * @returns {string} the repository root
   */
  function changeRepo(tasks) {
    const root = tempRoot();
    if (tasks !== null) writeFile(path.join(root, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), tasks);
    return root;
  }

  const count = (tasks) => withPath(absent(), () => executeProgress(changeRepo(tasks)));

  it('reports an empty tasks list as 0 of 0 rather than as complete', () => {
    assert.deepEqual(count('# Tasks\n'), { done: 0, total: 0, source: 'tasks-md', changeId: CHANGE_ID });
  });

  it('reports 0 of 0 when there is no change at all', () => {
    assert.deepEqual(count(null), { done: 0, total: 0, source: 'tasks-md', changeId: null });
  });

  for (const [label, tasks, expected] of [
    ['0 of 3', '- [ ] a\n- [ ] b\n- [ ] c\n', { done: 0, total: 3 }],
    ['2 of 3', '- [x] a\n- [X] b\n- [ ] c\n', { done: 2, total: 3 }],
    ['3 of 3', '- [x] a\n- [x] b\n- [x] c\n', { done: 3, total: 3 }],
    ['nested indents', '- [x] a\n  - [ ] a.1\n\t- [ ] a.2\n', { done: 1, total: 3 }],
    ['asterisk and plus bullets', '* [x] a\n+ [ ] b\n', { done: 1, total: 2 }],
  ]) {
    it(`counts ${label}`, () => {
      const result = count(tasks);
      assert.equal(result.done, expected.done);
      assert.equal(result.total, expected.total);
    });
  }

  it('ignores checkboxes inside a fenced code block', () => {
    const tasks = ['- [x] real', '', '```md', '- [ ] example', '- [x] example', '```', '', '- [ ] also real', ''].join('\n');
    assert.deepEqual(count(tasks), { done: 1, total: 2, source: 'tasks-md', changeId: CHANGE_ID });
  });

  it('ignores checkboxes inside a tilde-fenced block', () => {
    const tasks = ['- [x] real', '~~~', '- [ ] example', '~~~', ''].join('\n');
    assert.equal(count(tasks).total, 1);
  });

  it('treats an unclosed fence as swallowing the rest of the file', () => {
    const tasks = ['- [x] real', '```', '- [ ] example', ''].join('\n');
    assert.equal(count(tasks).total, 1);
  });

  it('ignores archived changes when discovering the change id', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'archive', '2026-01-01-old', 'tasks.md'), '- [ ] a\n');
    writeFile(path.join(root, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), '- [x] a\n');
    const result = withPath(absent(), () => executeProgress(root));
    assert.equal(result.changeId, CHANGE_ID);
    assert.deepEqual([result.done, result.total], [1, 1]);
  });

  it('picks the first unfinished change by name when several are active', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'a-done', 'tasks.md'), '- [x] a\n');
    writeFile(path.join(root, 'openspec', 'changes', 'b-open', 'tasks.md'), '- [ ] a\n');
    writeFile(path.join(root, 'openspec', 'changes', 'c-open', 'tasks.md'), '- [ ] a\n');
    assert.equal(withPath(absent(), () => executeProgress(root)).changeId, 'b-open');
  });

  describe('with the openspec CLI on PATH', () => {
    /**
     * @param {string} script body of the stub, after the `--version` reply
     * @param {string} tasks contents of `tasks.md`
     * @returns {{done:number,total:number,source:string,changeId:string|null}}
     */
    function withStub(script, tasks = '- [ ] a\n- [ ] b\n') {
      const root = changeRepo(tasks);
      const stub = stubBin('openspec', ['if [ "$1" = "--version" ]; then echo "1.9.0"; exit 0; fi', script].join('\n'));
      return withPath(`${stub}:${absent()}`, () => executeProgress(root));
    }

    const listJson = (rows) => `echo '${JSON.stringify({ changes: rows, root: { path: '.', source: 'x' } })}'`;

    it('prefers the CLI when it reports usable counts', () => {
      const result = withStub(listJson([{ name: CHANGE_ID, completedTasks: 5, totalTasks: 9 }]));
      assert.deepEqual(result, { done: 5, total: 9, source: 'openspec', changeId: CHANGE_ID });
    });

    it('falls back to the tasks list when the CLI emits malformed JSON', () => {
      assert.deepEqual(withStub('echo "not json"'), {
        done: 0,
        total: 2,
        source: 'tasks-md',
        changeId: CHANGE_ID,
      });
    });

    it('falls back to the tasks list when the CLI exits non-zero', () => {
      assert.equal(withStub('exit 1').source, 'tasks-md');
    });

    it('falls back to the tasks list when the JSON has the wrong shape', () => {
      assert.equal(withStub(listJson([{ name: CHANGE_ID, done: 5, total: 9 }])).source, 'tasks-md');
    });

    it('falls back to the tasks list when the CLI hangs', () => {
      assert.equal(withStub('sleep 30').source, 'tasks-md');
    });
  });
});
