import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import {
  cdCommand,
  cdLines,
  renderBaySelect,
  renderFleet,
  renderPosition,
  renderSelect,
  renderWaybill,
  renderWaybillMarkdown,
} from '../src/waybill.js';
import { resolveLeg } from '../src/inference.js';
import { cleanupAll, createRepo, git, pathWithout, tempRoot, withPath, writeFile } from './helpers/repo-fixture.js';
import { ideateFixture } from './fixtures/ideate.js';
import { noDocketFixture } from './fixtures/no-docket.js';
import { bayFixture } from './fixtures/bay.js';
import { refineFixture } from './fixtures/refine.js';
import { contractFixture } from './fixtures/contract.js';
import { specsFixture } from './fixtures/specs.js';
import { CHANGE_ID, executeFixture } from './fixtures/execute.js';
import { cleanupFixture } from './fixtures/cleanup.js';

after(cleanupAll);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, 'golden');
const SRC = path.join(HERE, '..', 'src');

/** The golden files are byte-exact, so the real openspec CLI must never influence what is rendered. */
const resolve = (dir) => withPath(pathWithout('openspec'), () => resolveLeg(dir));

/** Nothing ignored, nothing to report — the shape every golden case is rendered against. */
const CLEAN = { ignored: [], warnings: [] };

/**
 * Compare against `tests/golden/<name>.<ext>`, or rewrite it when `UPDATE_GOLDEN=1`.
 *
 * Regeneration is deliberately an environment flag rather than a CLI flag: a golden file that
 * rewrites itself during a normal run is a tautology, so the only way to update one is to ask.
 *
 * @param {string} name
 * @param {string} actual
 * @param {string} [ext]
 */
function assertGolden(name, actual, ext = 'txt') {
  const file = path.join(GOLDEN, `${name}.${ext}`);
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(GOLDEN, { recursive: true });
    fs.writeFileSync(file, actual);
  }
  assert.equal(actual, fs.readFileSync(file, 'utf8'), `golden mismatch: ${file}`);
}

/**
 * A synthetic inference result, so the rendering rules can be exercised without a repository.
 *
 * @param {Partial<import('../src/inference.js').Inference>} [overrides]
 * @returns {import('../src/inference.js').Inference}
 */
function state(overrides = {}) {
  return {
    leg: 'specs',
    index: 5,
    completed: ['ideate', 'bay', 'refine', 'contract'],
    skipped: [],
    booking: {
      leg: 'specs',
      command: '/spec:propose',
      model: 'placeholder-model',
      effort: 'high',
      handover: 'transfer',
      body: '',
      path: '/bookings/openspec-specs.md',
    },
    branch: 'feat/thing',
    docketOpen: true,
    changeId: 'add-thing',
    warnings: [],
    ...overrides,
  };
}

/** A fixed literal, because a bay under the temp root would differ on every run. */
const BAY = '/repo/.claude/worktrees/waybill-feat-session-handover';

/**
 * Three synthetic dockets, the shape `fleet(cwd, bookings)` returns.
 *
 * The branch names are three different widths on purpose: the position column is padded to the
 * longest branch, and a fleet whose branches all measured the same could not tell a padded column
 * from an unpadded one. Rebuilt per call so a test may attach warnings to one docket.
 *
 * @returns {import('../src/fleet.js').Docket[]}
 */
function dockets() {
  return [
    {
      branch: 'feat/session-handover',
      path: BAY,
      state: state({ branch: 'feat/session-handover', changeId: 'add-session-handover' }),
    },
    {
      branch: 'fix/stamp-scoping',
      path: '/repo/.claude/worktrees/waybill-fix-stamp-scoping',
      state: state({
        branch: 'fix/stamp-scoping',
        leg: 'execute',
        index: 6,
        completed: ['ideate', 'bay', 'refine', 'contract', 'specs'],
        progress: { done: 4, total: 9, source: 'tasks-md', changeId: 'fix-stamp-scoping' },
      }),
    },
    {
      branch: 'feat/fleet-view',
      path: '/repo/.claude/worktrees/waybill-feat-fleet-view',
      state: state({ branch: 'feat/fleet-view', leg: 'refine', index: 3, completed: ['ideate', 'bay'] }),
    },
  ];
}

describe('renderWaybill golden output', () => {
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
    it(`renders the ${id} leg`, () => {
      assertGolden(id, renderWaybill(resolve(build().dir), CLEAN));
    });

    it(`renders the ${id} leg in markdown`, () => {
      assertGolden(id, renderWaybillMarkdown(resolve(build().dir), CLEAN), 'md');
    });
  }

  it('renders no docket open on the base branch in markdown', () => {
    assertGolden('no-docket', renderWaybillMarkdown(resolve(noDocketFixture().dir), CLEAN), 'md');
  });

  it('renders the same leg as a position, which is what `waybill status` prints', () => {
    assertGolden('status', renderPosition(resolve(specsFixture().dir), CLEAN));
  });

  it('renders a repository whose seven legs are all complete', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const elsewhere = path.join(tempRoot(), 'off-convention');
    git(repo, ['worktree', 'add', '--no-track', '-b', 'feat/thing', elsewhere]);

    // Left uncommitted, deliberately: see the identical case in tests/inference.test.js — committing
    // these onto `feat/thing` would move its ref past `main` and `isMerged` would read false.
    writeFile(path.join(elsewhere, 'docs', 'ideation', 'thing', 'contract-data.json'), '{}\n');
    writeFile(path.join(elsewhere, 'docs', 'ideation', 'thing', 'contract.md'), '# Contract\n');
    writeFile(path.join(elsewhere, 'openspec', 'changes', CHANGE_ID, 'tasks.md'), '- [x] a\n- [x] b\n');

    const result = resolve(elsewhere);
    assert.equal(result.leg, null);
    assertGolden('complete', renderWaybill(result, CLEAN));
  });

  it('renders no docket open on the base branch, which is the block `waybill new` prints', () => {
    // Since the exit contract landed this is `new`'s answer, not the trunk's answer to `next` —
    // `next` there reports the fleet and issues nothing. The block did not change, it moved to the
    // verb that means it, and `tests/cli.test.js` asserts the verb still routes to this golden.
    assertGolden('no-docket', renderWaybill(resolve(noDocketFixture().dir), CLEAN));
  });

  it('renders the trunk identically whether or not papers shipped into its history', () => {
    // `no-docket.txt` and `ideate.txt` are byte-identical on purpose: the two fixtures differ only
    // in what they commit, and identical output *is* the assertion that history no longer moves the
    // render. Neither golden file can catch a divergence on its own — each would simply be
    // regenerated — so the identity is asserted here rather than left to a reader to notice.
    assert.equal(
      renderWaybill(resolve(noDocketFixture().dir), CLEAN),
      renderWaybill(resolve(ideateFixture().dir), CLEAN),
    );
  });
});

describe('fleet golden output', () => {
  it('renders the fleet, which is what `waybill status` prints on the trunk', () => {
    assertGolden('fleet', renderFleet('main', dockets(), CLEAN));
  });

  it('renders the selection block, which is what `waybill next` prints on an ambiguous trunk', () => {
    assertGolden('select', renderSelect('main', dockets(), CLEAN));
  });

  it('renders an empty fleet in the plural, which is not the leg-1 waybill', () => {
    assertGolden('fleet-empty', renderFleet('main', [], CLEAN));
    // `no docket open` is the singular `no-docket.txt` opens with, and it means the opposite thing:
    // one branch with no docket on it, rather than a repository with nothing in flight. The two are
    // one character apart, so the distinction is asserted rather than left to the golden.
    assert.equal(renderFleet('main', [], CLEAN).includes('no docket open'), false);
  });

  it('renders the one-docket trunk answer: position, then the bay, then the waybill', () => {
    assertGolden('trunk-one-docket', renderWaybill(dockets()[0].state, CLEAN, cdLines(BAY)));
  });

  it('renders the one-docket trunk answer in markdown, the cd in a fence of its own', () => {
    assertGolden('trunk-one-docket', renderWaybillMarkdown(dockets()[0].state, CLEAN, [cdCommand(BAY)]), 'md');
  });
});

describe('renderFleet', () => {
  it('counts the dockets in the header, in the singular when there is exactly one', () => {
    const output = renderFleet('main', dockets().slice(0, 1), CLEAN);
    assert.equal(output.split('\n')[0], 'main · 1 docket open');
  });

  it('emits no DOCKETS heading at all when nothing is in flight', () => {
    assert.equal(renderFleet('main', [], CLEAN), 'main · no dockets open\n');
  });

  it('pads the branch column to the longest branch, so the positions line up', () => {
    const rows = renderFleet('main', dockets(), CLEAN)
      .split('\n')
      .filter((line) => line.startsWith('  ') && line.includes(' · '));
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((line) => line.indexOf(' · '))).size, 1);
  });

  it('carries execute progress inline, where the leg strip gives it a line of its own', () => {
    assert.match(
      renderFleet('main', dockets(), CLEAN),
      /^ {2}fix\/stamp-scoping {5}· leg 6 of 7 \(execute, 4 of 9 tasks\)$/m,
    );
  });

  it('names the branch a warning came from, rather than blaming the repository at large', () => {
    const fleet = dockets();
    fleet[1].state.warnings = ['stampCmd command not found: nope'];

    const output = renderFleet('main', fleet, CLEAN);
    assert.match(output, /^WARNINGS:$/m);
    assert.match(output, /^ {2}⚠ fix\/stamp-scoping: stampCmd command not found: nope$/m);
  });

  it('reports an inspection finding alongside the dockets, as every other surface does', () => {
    const output = renderFleet('main', dockets(), { ignored: ['openspec/'], warnings: ['no diff'] });
    assert.match(output, /^IGNORED BY GIT:$/m);
    assert.match(output, /no diff/);
  });
});

describe('renderSelect', () => {
  it('carries the exact literal `commands/next.md` branches on', () => {
    assert.match(renderSelect('main', dockets(), CLEAN), /^SELECT A DOCKET:$/m);
  });

  it('names the command to re-run, after a blank line inside the same block', () => {
    assert.match(renderSelect('main', dockets(), CLEAN), /\(refine\)\n\n {2}waybill next <branch>\n/);
  });

  it('keeps the warnings below the instruction rather than sorting them in between', () => {
    const fleet = dockets();
    fleet[0].state.warnings = ['could not read the diff'];

    const output = renderSelect('main', fleet, CLEAN);
    assert.ok(output.indexOf('waybill next <branch>') < output.indexOf('WARNINGS:'));
  });

  it('lists the same dockets in the same order as the fleet view', () => {
    const rows = (text) => text.split('\n').filter((line) => line.includes(' · ') && line.startsWith('  '));
    assert.deepEqual(rows(renderSelect('main', dockets(), CLEAN)), rows(renderFleet('main', dockets(), CLEAN)));
  });
});

describe('renderWaybillMarkdown', () => {
  /**
   * The body of every fence, opening and closing lines excluded.
   *
   * @param {string} output
   * @returns {string[][]}
   */
  const fences = (output) => {
    const bodies = [];
    let open = null;
    for (const line of output.split('\n')) {
      if (line.startsWith('```')) {
        if (open === null) open = [];
        else {
          bodies.push(open);
          open = null;
        }
      } else if (open !== null) open.push(line);
    }
    return bodies;
  };

  /** @param {Partial<import('../src/bookings.js').Booking>} booking */
  const markdown = (booking = {}, rest = {}) =>
    renderWaybillMarkdown(state({ ...rest, booking: { ...state().booking, ...booking } }), CLEAN);

  it('renders the findings in markdown as bullets, WARNINGS last', () => {
    assertGolden(
      'findings',
      renderWaybillMarkdown(state({ warnings: ['inference said so'] }), {
        ignored: ['openspec/'],
        warnings: ['inspection said so'],
      }),
      'md',
    );
  });

  it('never puts two lines in one fence in markdown', () => {
    const output = renderWaybillMarkdown(state(), CLEAN, [cdCommand('/repo/bays/x')]);
    // The first fence is the position block; every fence after it holds exactly one command.
    const commandFences = fences(output).slice(1);
    assert.deepEqual(
      commandFences.map((body) => body.length),
      commandFences.map(() => 1),
    );
    assert.deepEqual(commandFences.flat(), [
      'cd /repo/bays/x',
      '/clear',
      '/model placeholder-model',
      '/effort high',
      '/spec:propose add-thing',
    ]);
  });

  it('keeps the position in a text fence in markdown, so the strip keeps its line breaks', () => {
    const output = markdown();
    assert.ok(output.startsWith('```text\nfeat/thing · leg 5 of 7 (specs)\n  ✓ ideate'));
  });

  it('has no /effort fence in markdown when the booking declares no effort', () => {
    assert.equal(markdown({ effort: undefined }).includes('/effort'), false);
  });

  it('puts custom handover prose in markdown as a paragraph before the first command fence', () => {
    const output = markdown({ handover: 'hand the laptop to Dave' });
    assert.match(output, /in order:\n\nhand the laptop to Dave\n\n```\n\/model placeholder-model\n```/);
    assert.equal(output.includes('/clear'), false);
  });

  it('puts the bay before NEXT in markdown, because the shell has to move before the session does', () => {
    const output = renderWaybillMarkdown(state(), CLEAN, [cdCommand('/repo/bays/x')]);
    assert.match(output, /\*\*IN BAY\*\* — run this in your shell first:\n\n```\ncd \/repo\/bays\/x\n```/);
    assert.ok(output.indexOf('**IN BAY**') < output.indexOf('**NEXT**'));
    assert.equal(markdown().includes('IN BAY'), false);
  });

  it('carries the booking body unindented in markdown, after the last fence', () => {
    const output = markdown({ body: 'Do the thing.\n\nThen do the other thing.\n' });
    assert.ok(output.endsWith('```\n/spec:propose add-thing\n```\n\nDo the thing.\n\nThen do the other thing.\n'));
  });

  it('says there is nothing to hand off in markdown, with no fence', () => {
    const output = renderWaybillMarkdown(
      state({ leg: null, index: 7, completed: LEGS.map((leg) => leg.id), booking: undefined }),
      CLEAN,
    );
    assert.match(output, /^\*\*NEXT\*\* — nothing to hand off — every leg is complete$/m);
    assert.equal(fences(output).length, 1);
  });

  it('names the missing booking in markdown, with no fence', () => {
    const output = renderWaybillMarkdown(state({ leg: 'bay', index: 2, booking: undefined }), CLEAN);
    assert.match(
      output,
      /^\*\*NEXT\*\* — no booking is bound to the bay leg — add one under bookings\/ to give this leg a waybill$/m,
    );
    assert.equal(fences(output).length, 1);
  });

  it('shows only the header in markdown when no docket is open', () => {
    assert.ok(markdown({}, { docketOpen: false }).startsWith('```text\nfeat/thing · no docket open\n```\n'));
  });

  it('ends markdown with exactly one newline', () => {
    for (const output of [markdown(), markdown({ body: 'Body.\n\n' })]) {
      assert.equal(output.endsWith('\n'), true);
      assert.equal(output.endsWith('\n\n'), false);
    }
  });
});

describe('cdCommand', () => {
  it('is the bare shell command, with no indent to ride along into a paste', () => {
    assert.equal(cdCommand('/repo/bays/x'), 'cd /repo/bays/x');
  });
});

/**
 * The rows `rankBranches` hands the renderer: one promoted by a signal, one plain, one with a bay.
 * Three widths again, for the padding.
 *
 * @returns {import('../src/picker.js').BranchRow[]}
 */
function branchRows() {
  return [
    { branch: 'feat/session-handover', bay: null, isNew: false, reason: 'tmux window "session-handover"' },
    { branch: 'fix/stamp-scoping', bay: null, isNew: false, reason: null },
    { branch: 'ideation/fleet-view', bay: '/repo/.claude/worktrees/waybill-ideation-fleet-view', isNew: false, reason: null },
  ];
}

describe('renderBaySelect', () => {
  it('renders the branch menu `waybill bay --list` prints', () => {
    assertGolden('bay-select', renderBaySelect('main', branchRows()));
  });

  it('renders a suggested new branch first, marked new, with the signal behind it', () => {
    const rows = [
      { branch: 'feat/bay-picker', bay: null, isNew: true, reason: 'tmux window "bay picker"' },
      ...branchRows().slice(1),
    ];
    assertGolden('bay-select-new', renderBaySelect('main', rows));
  });

  it('carries the exact literal `commands/bay.md` branches on', () => {
    assert.match(renderBaySelect('main', branchRows()), /^SELECT A BRANCH:$/m);
  });

  it('pads the branch column to the longest branch, so the statuses line up', () => {
    const rows = renderBaySelect('main', branchRows())
      .split('\n')
      .filter((line) => line.startsWith('  ') && line.includes(' · '));
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((line) => line.indexOf(' · '))).size, 1);
  });

  it('answers an empty list in one line naming the trunk and the verb, with no heading', () => {
    assert.equal(
      renderBaySelect('trunk', []),
      'no branches besides trunk — name one with `waybill bay <branch>`\n',
    );
  });
});

describe('cdLines', () => {
  it('renders the one shell instruction Waybill issues, indented like every other line', () => {
    assert.deepEqual(cdLines('/repo/bays/x'), ['  cd /repo/bays/x']);
  });

  it('suppresses the line when the operator is already standing in the bay', () => {
    assert.deepEqual(cdLines('/repo/bays/x', true), []);
  });

  it('is what puts an IN BAY block into a waybill, and drops the block with the line', () => {
    assert.match(
      renderWaybill(state(), CLEAN, cdLines('/repo/bays/x')),
      /^IN BAY:\n {2}cd \/repo\/bays\/x$/m,
    );
    assert.equal(renderWaybill(state(), CLEAN, cdLines('/repo/bays/x', true)).includes('IN BAY:'), false);
  });

  it('puts the bay block before NEXT, because the shell has to move before the session does', () => {
    const output = renderWaybill(state(), CLEAN, cdLines('/repo/bays/x'));
    assert.ok(output.indexOf('IN BAY:') < output.indexOf('NEXT:'));
  });

  it('leaves the in-a-bay waybill byte-identical when no bay is named', () => {
    assert.equal(renderWaybill(state(), CLEAN, []), renderWaybill(state(), CLEAN));
  });
});

describe('renderWaybill header and leg strip', () => {
  it('names the branch, the position, and the current leg', () => {
    assert.equal(
      renderWaybill(state(), CLEAN).split('\n')[0],
      `feat/thing · leg 5 of ${LEGS.length} (specs)`,
    );
  });

  it('drops the branch prefix entirely on a detached HEAD rather than printing null', () => {
    const first = renderWaybill(state({ branch: null }), CLEAN).split('\n')[0];
    assert.equal(first, `leg 5 of ${LEGS.length} (specs)`);
    assert.equal(first.includes('null'), false);
  });

  it('walks the leg list positionally, so completed legs after the current one keep their place', () => {
    const output = renderWaybill(
      state({ leg: 'bay', index: 2, completed: ['ideate', 'refine', 'contract'], booking: undefined }),
      CLEAN,
    );
    assert.equal(output.split('\n')[1], '  ✓ ideate  ✓ refine  ✓ contract');
    assert.equal(output.split('\n')[2], '  ▶ bay');
  });

  it('names a skipped leg rather than hiding it', () => {
    const output = renderWaybill(state({ skipped: ['refine'] }), CLEAN);
    assert.match(output, /^ {2}⚠ refine \(skipped\)$/m);
  });

  it('says every leg is complete when the walk fell off the end', () => {
    const output = renderWaybill(
      state({ leg: null, index: 7, completed: LEGS.map((leg) => leg.id), booking: undefined }),
      CLEAN,
    );
    assert.equal(output.split('\n')[0], `feat/thing · all ${LEGS.length} legs complete`);
    assert.equal(output.includes('▶'), false);
    assert.match(output, /NEXT:\n {2}nothing to hand off/);
  });
});

describe('renderWaybill progress', () => {
  const withProgress = (done, total) =>
    renderWaybill(
      state({
        leg: 'execute',
        index: 6,
        completed: ['ideate', 'bay', 'refine', 'contract', 'specs'],
        progress: { done, total, source: 'tasks-md', changeId: CHANGE_ID },
      }),
      CLEAN,
    );

  it('reports n of N beside the current leg', () => {
    assert.match(withProgress(2, 4), /^ {2}▶ execute \(2 of 4 tasks\)$/m);
  });

  it('reports 0 of 0 literally, never as complete', () => {
    const output = withProgress(0, 0);
    assert.match(output, /^ {2}▶ execute \(0 of 0 tasks\)$/m);
    assert.equal(output.includes('complete'), false);
  });

  it('reports n of n while the leg is still current', () => {
    assert.match(withProgress(4, 4), /^ {2}▶ execute \(4 of 4 tasks\)$/m);
  });

  it('omits the progress suffix on the six legs that carry none', () => {
    assert.match(renderWaybill(state(), CLEAN), /^ {2}▶ specs$/m);
  });
});

describe('renderWaybill NEXT block', () => {
  /**
   * @param {Partial<import('../src/bookings.js').Booking>} booking
   * @param {Partial<import('../src/inference.js').Inference>} [rest]
   */
  const next = (booking, rest = {}) =>
    renderWaybill(state({ ...rest, booking: { ...state().booking, ...booking } }), CLEAN);

  /**
   * The lines between `NEXT:` and the first blank line after it — the handover itself.
   *
   * @param {string} output
   * @returns {string[]}
   */
  const handover = (output) =>
    output
      .trimEnd()
      .split('\n\n')
      .find((section) => section.startsWith('NEXT:'))
      .split('\n')
      .slice(1);

  it('interpolates the command and the change id', () => {
    assert.match(next({}), /^\/spec:propose add-thing$/m);
  });

  it('omits the argument when no change has been scaffolded yet, with no trailing space', () => {
    assert.match(next({}, { changeId: null }), /^\/spec:propose$/m);
  });

  it('takes the branch instead when the booking asks for it', () => {
    // The cleanup leg's target finishes a *branch*; handing it a change id would name the wrong
    // thing entirely, and both facts are on the inference already.
    assert.match(next({ command: '/mar', argument: 'branch' }), /^\/mar feat\/thing$/m);
  });

  it('interpolates nothing at all when the booking asks for no argument', () => {
    const output = next({ command: 'superpowers:some-skill', argument: 'none' });
    assert.match(output, /^superpowers:some-skill$/m);
    assert.equal(output.includes('add-thing'), false);
  });

  it('omits a requested argument the repository cannot supply', () => {
    assert.match(next({ command: '/mar', argument: 'branch' }, { branch: null }), /^\/mar$/m);
  });

  it('lists a transfer handover as /clear, /model, /effort and the command, unindented, in order', () => {
    assert.deepEqual(handover(next({ model: 'some-model', effort: 'low', handover: 'transfer' })), [
      '/clear',
      '/model some-model',
      '/effort low',
      '/spec:propose add-thing',
    ]);
  });

  for (const value of ['through', undefined]) {
    it(`lists no /clear for a ${value ?? 'missing'} handover`, () => {
      assert.deepEqual(handover(next({ model: 'some-model', effort: 'low', handover: value })), [
        '/model some-model',
        '/effort low',
        '/spec:propose add-thing',
      ]);
    });
  }

  it('omits /effort entirely when the booking declares none, rather than defaulting', () => {
    const output = next({ model: 'some-model', effort: undefined });
    assert.deepEqual(handover(output), ['/clear', '/model some-model', '/spec:propose add-thing']);
    assert.equal(output.includes('effort'), false);
  });

  it('passes the model value through verbatim, qualifier and all', () => {
    assert.match(next({ model: 'some-model[1m]' }), /^\/model some-model\[1m\]$/m);
  });

  it('renders an unrecognised handover verbatim, indented above the commands, with no /clear', () => {
    assert.deepEqual(handover(next({ handover: 'hand the laptop to Dave', effort: undefined })), [
      '  hand the laptop to Dave',
      '/model placeholder-model',
      '/spec:propose add-thing',
    ]);
  });

  it('prints no caption and no "then run:" line under any handover', () => {
    for (const value of ['transfer', 'through', undefined, 'hand the laptop to Dave']) {
      const output = next({ handover: value });
      assert.equal(/^.*└ /m.test(output), false, `caption under ${value}`);
      assert.equal(/run:/.test(output), false, `run: line under ${value}`);
    }
  });

  it('carries the booking body through as the waybill prose, one blank line after the commands', () => {
    const output = next({ body: 'Do the thing.\n\nThen do the other thing.\n' });
    assert.match(output, /^\/spec:propose add-thing\n\n {2}Do the thing\.$/m);
    assert.match(output, /^ {2}Then do the other thing\.$/m);
    // A blank separator line must stay blank; indenting it would leave trailing whitespace.
    assert.equal(output.includes('  \n'), false);
  });

  it('says so plainly when no booking is bound to the leg, instead of emitting an empty block', () => {
    const output = renderWaybill(state({ leg: 'bay', index: 2, booking: undefined }), CLEAN);
    assert.match(output, /NEXT:\n {2}no booking is bound to the bay leg/);
    assert.match(output, /bookings\//);
  });
});

describe('renderPosition', () => {
  it('renders the header and the leg strip exactly as the waybill does', () => {
    const waybill = renderWaybill(state(), CLEAN).split('\n\n')[0];
    assert.equal(renderPosition(state(), CLEAN), `${waybill}\n`);
  });

  it('emits no NEXT block — that is the whole difference', () => {
    const output = renderPosition(state(), CLEAN);
    assert.equal(output.includes('NEXT:'), false);
    assert.equal(output.includes('/spec:propose'), false);
  });

  it('keeps the inspection and the warnings, which are position facts rather than waybill facts', () => {
    const output = renderPosition(state({ warnings: ['inference said so'] }), {
      ignored: ['openspec/'],
      warnings: ['inspection said so'],
    });
    assert.match(output, /^IGNORED BY GIT:$/m);
    assert.match(output, /inference said so/);
    assert.match(output, /inspection said so/);
  });

  it('still answers when the walk fell off the end, with no waybill to fall back on', () => {
    const output = renderPosition(state({ leg: null, booking: undefined }), CLEAN);
    assert.match(output, /all 7 legs complete/);
    assert.equal(output.includes('NEXT:'), false);
  });

  it('reports no docket open and suppresses the strip, exactly as the waybill does', () => {
    // The gate is one `state.docketOpen` check in each renderer, and `renderPosition`'s was covered
    // by reading the code only. `state()` carries four completed legs, so a broken gate would print
    // a tick row here.
    const output = renderPosition(state({ docketOpen: false }), CLEAN);
    assert.equal(output, 'feat/thing · no docket open\n');
    assert.equal(output.includes('✓'), false);
    assert.equal(output.includes('▶'), false);
  });

  it('always ends with exactly one trailing newline', () => {
    const output = renderPosition(state(), CLEAN);
    assert.equal(output.endsWith('\n'), true);
    assert.equal(output.endsWith('\n\n'), false);
  });
});

describe('renderWaybill reports what it could not do', () => {
  it('names every gitignored paper path', () => {
    const output = renderWaybill(state(), { ignored: ['openspec/', 'docs/ideation/'], warnings: [] });
    assert.match(output, /^IGNORED BY GIT:$/m);
    assert.match(output, /^ {2}⚠ openspec\/ /m);
    assert.match(output, /^ {2}⚠ docs\/ideation\/ /m);
  });

  it('omits the ignored block entirely when the repository is clean', () => {
    assert.equal(renderWaybill(state(), CLEAN).includes('IGNORED BY GIT'), false);
  });

  it('names the offending booking when a stamp could not run', () => {
    const output = renderWaybill(
      state({ warnings: ['/bookings/openspec-specs.md: stampCmd command not found: nope'] }),
      CLEAN,
    );
    assert.match(output, /^WARNINGS:$/m);
    assert.match(output, /openspec-specs\.md/);
  });

  it('reports an inspection that could not answer alongside the inference warnings', () => {
    const output = renderWaybill(state({ warnings: ['inference said so'] }), {
      ignored: [],
      warnings: ['inspection said so'],
    });
    assert.match(output, /inference said so/);
    assert.match(output, /inspection said so/);
  });

  it('always ends with exactly one trailing newline', () => {
    const output = renderWaybill(state(), CLEAN);
    assert.equal(output.endsWith('\n'), true);
    assert.equal(output.endsWith('\n\n'), false);
  });
});

describe('criterion 2: no model name is hardcoded anywhere in src/', () => {
  /**
   * @param {string} dir
   * @returns {string[]}
   */
  function filesUnder(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    });
  }

  it('finds no model literal in any source file, comments included', () => {
    const offenders = filesUnder(SRC).filter((file) =>
      /(opus|sonnet|haiku)/i.test(fs.readFileSync(file, 'utf8')),
    );
    assert.deepEqual(offenders, [], 'model names must live in bookings/, never in src/');
  });
});
