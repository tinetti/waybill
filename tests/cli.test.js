import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../src/cli.js';
import { cdLines } from '../src/waybill.js';
import {
  addWorktree,
  assertGolden,
  cleanupAll,
  createRepo,
  defaultBayPath,
  git,
  pathWithout,
  tempRoot,
  withEnv,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';
import { specsFixture } from './fixtures/specs.js';
import { noDocketFixture } from './fixtures/no-docket.js';

after(cleanupAll);

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

/**
 * The CLI spawns git with the developer's real environment, so a global `core.excludesFile` on this
 * machine would otherwise decide whether a fixture repository reports ignored papers.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function isolated(fn) {
  const previous = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_SYSTEM };
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_SYSTEM = '/dev/null';
  try {
    return fn();
  } finally {
    if (previous.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous.global;
    if (previous.system === undefined) delete process.env.GIT_CONFIG_SYSTEM;
    else process.env.GIT_CONFIG_SYSTEM = previous.system;
  }
}

/**
 * Drive `run` exactly the way phase 5's `bin/waybill` will — argv after the program name, both streams
 * injected — so this suite covers the same entry point the wrapper will call rather than a subshell.
 *
 * The real `openspec` binary is removed from `PATH` for the same reason `tests/waybill.test.js`
 * removes it: the golden comparison is byte-exact, and a CLI installed on the developer's machine
 * must not be able to change what is rendered.
 *
 * The operator's shell is kept out for the same reason: `bay --list` ranks by the tmux window and
 * the shell history it runs under, and a suite run inside tmux, by someone with a history, would
 * otherwise order its rows by the developer's afternoon.
 *
 * @param {string[]} argv
 * @param {string} cwd
 * @param {import('../src/signals.js').Signals} [signals] what the shell is taken to say
 * @returns {{code:number, out:string, err:string}}
 */
function cli(argv, cwd, signals = { tmux: null, history: [] }) {
  let out = '';
  let err = '';
  const code = isolated(() =>
    withPath(pathWithout('openspec'), () =>
      run(argv, {
        cwd,
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
        signals: () => signals,
      }),
    ),
  );
  return { code, out, err };
}

describe('waybill next', () => {
  it('prints the waybill for the leg the repository is actually on, and exits 0', () => {
    const fixture = specsFixture();
    const result = cli(['next'], fixture.dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(result.out, fs.readFileSync(path.join(GOLDEN, 'specs.txt'), 'utf8'));
  });

  it('exits 0 even from a subdirectory of the bay', () => {
    const fixture = specsFixture();
    const sub = path.join(fixture.dir, 'src', 'nested');
    fs.mkdirSync(sub, { recursive: true });

    const result = cli(['next'], sub);
    assert.equal(result.code, 0);
    assert.match(result.out, /leg 5 of 7 \(specs\)/);
  });

  it('reports ignored papers from a subdirectory — the inspection runs at the repository root', () => {
    // The load-bearing case: `git check-ignore` resolves its arguments against the process
    // directory, so running it in `src/nested` would match nothing and the block would vanish
    // exactly when the operator most needs it. Running from the root is what makes it appear.
    const fixture = specsFixture();
    writeFile(path.join(fixture.dir, '.gitignore'), '/openspec/\n');
    const sub = path.join(fixture.dir, 'src', 'nested');
    fs.mkdirSync(sub, { recursive: true });

    const result = cli(['next'], sub);
    assert.equal(result.code, 0, 'the inspection is advice; it never changes the exit code');
    assert.match(result.out, /^IGNORED BY GIT:$/m);
    assert.match(result.out, /openspec\/ — papers written here will never be committed/);
  });

  it('stays silent about git-ignored papers when the repository ignores none', () => {
    const result = cli(['next'], specsFixture().dir);
    assert.equal(result.out.includes('IGNORED BY GIT'), false);
  });

  it('prints parseable inference JSON under --json, and nothing else', () => {
    const fixture = specsFixture();
    const result = cli(['next', '--json'], fixture.dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    const state = JSON.parse(result.out);
    assert.equal(state.leg, 'specs');
    assert.equal(state.index, 5);
    assert.equal(state.branch, fixture.branch);
    assert.deepEqual(state.completed, ['ideate', 'bay', 'refine', 'contract']);
    assert.equal(state.booking.command, '/spec:propose');
  });

  it('explains itself in one line outside a repository and exits 2, with no stack trace', () => {
    const result = cli(['next'], tempRoot());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.equal(result.err.trimEnd().split('\n').length, 1, `not one line: ${result.err}`);
    assert.match(result.err, /not inside a git repository/);
    assert.equal(/\bat .*\.js:\d+/.test(result.err), false, 'a stack trace leaked into stderr');
  });

  it('rejects an unknown option rather than printing the human waybill to a --json consumer', () => {
    const result = cli(['next', '--jsonn'], specsFixture().dir);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown option `--jsonn`/);
    assert.match(result.err, /Usage: waybill/);
  });
});

/**
 * A trunk with one bay per branch named, and nothing else.
 *
 * Built through the fixture helper's worktree route rather than a new file under `tests/fixtures/`:
 * `tests/inference.test.js:70-73` asserts that directory holds exactly one entry per leg plus the
 * index, so a fixture *file* added for the fleet would red an unrelated suite.
 *
 * @param {...string} branches
 * @returns {{repo:string, bays:string[]}}
 */
function trunkWith(...branches) {
  const repo = createRepo();
  return { repo, bays: branches.map((branch) => addWorktree(repo, branch)) };
}

describe('waybill next on the trunk', () => {
  it('exits 0 if and only if exactly one waybill was issued', () => {
    // The whole contract in one line: no docket and too many dockets are both "no waybill was
    // issued", so a script has one condition to test rather than three.
    assert.deepEqual(
      [[], ['feat/one'], ['feat/one', 'feat/two', 'fix/three']].map(
        (branches) => cli(['next'], trunkWith(...branches).repo).code,
      ),
      [2, 0, 2],
    );
  });

  it('points at `new` and issues nothing when no docket is open anywhere', () => {
    const { repo } = trunkWith();

    const result = cli(['next'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.err, '', 'the `!` invocation captures stdout only, so stderr would vanish');
    assert.match(result.out, /^waybill: no dockets open — begin one with `waybill new`$/m);
    assert.equal(result.out.includes('NEXT:'), false, "leg 1's waybill was issued anyway");
  });

  it("issues the one open docket's waybill, resolved from its bay rather than from the trunk", () => {
    const { repo, bays } = trunkWith('feat/one');

    const result = cli(['next'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    // Resolved from the trunk instead, this would read `main · no docket open`.
    assert.match(result.out, /^feat\/one · leg 3 of 7 \(refine\)$/m);
    assert.match(result.out, /^IN BAY:$/m);
    assert.equal(result.out.split('\n').includes(cdLines(bays[0])[0]), true);
    // The move comes before the handover: a `/clear` acted on from the trunk answers for nothing.
    assert.ok(result.out.indexOf('IN BAY:') < result.out.indexOf('NEXT:'));
  });

  it('lists the dockets to choose between, issues nothing, and exits 2', () => {
    const { repo } = trunkWith('feat/one', 'feat/two', 'fix/three');

    const result = cli(['next'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.err, '');
    assert.match(result.out, /^main · 3 dockets open$/m);
    assert.match(result.out, /^SELECT A DOCKET:$/m);
    for (const branch of ['feat/one', 'feat/two', 'fix/three']) {
      assert.match(result.out, new RegExp(`^ {2}${branch.replace('/', '\\/')} +· leg 3 of 7`, 'm'));
    }
    assert.match(result.out, /^ {2}waybill next <branch>$/m);
    assert.equal(result.out.includes('NEXT:'), false, 'a waybill was handed off from an ambiguous trunk');
  });

  it('leaves the in-a-bay answer alone, however many other dockets are open', () => {
    const { bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next'], bays[0]);

    assert.equal(result.code, 0);
    assert.match(result.out, /^feat\/one · leg 3 of 7 \(refine\)$/m);
    assert.equal(result.out.includes('SELECT A DOCKET:'), false);
    assert.equal(/^IN BAY:$/m.test(result.out), false, 'told the operator to cd where they already are');
  });

  it('reports a detached trunk by name rather than interpolating a null branch', () => {
    const { repo } = trunkWith('feat/one', 'feat/two');
    git(repo, ['checkout', '--detach']);

    const result = cli(['next'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.out.includes('null'), false, 'a null branch reached the rendered header');
    assert.match(result.out, /^detached HEAD · 2 dockets open$/m);
  });
});

describe('waybill next --json off the trunk', () => {
  it('still emits an object with no docket open, carrying an empty fleet', () => {
    const result = cli(['next', '--json'], trunkWith().repo);

    assert.equal(result.code, 2);
    assert.equal(result.err, '');
    const payload = JSON.parse(result.out);
    assert.match(payload.error, /no dockets open/);
    assert.deepEqual(payload.dockets, [], 'the key is absent rather than empty');
  });

  it('still emits an object when the trunk is ambiguous, projecting one entry per docket', () => {
    const { repo, bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', '--json'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.err, '');
    const payload = JSON.parse(result.out);
    assert.match(payload.error, /more than one docket/);
    assert.deepEqual(
      payload.dockets,
      [
        { branch: 'feat/one', path: bays[0], leg: 'refine', index: 3 },
        { branch: 'feat/two', path: bays[1], leg: 'refine', index: 3 },
      ],
      'the fleet shape is what keeps `status` free of a second machine surface',
    );
  });

  it('emits the resolved state, not a fleet, when exactly one docket answers', () => {
    const result = cli(['next', '--json'], trunkWith('feat/one').repo);

    assert.equal(result.code, 0);
    const state = JSON.parse(result.out);
    assert.equal(state.branch, 'feat/one');
    assert.equal(state.leg, 'refine');
    assert.equal(state.docketOpen, true);
  });
});

describe('waybill next <branch>', () => {
  it("issues the named docket's waybill from the trunk, with the cd line for its bay", () => {
    const { repo, bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', 'feat/two'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /^feat\/two · leg 3 of 7 \(refine\)$/m);
    assert.equal(result.out.split('\n').includes(cdLines(bays[1])[0]), true);
  });

  it('resolves the named docket from inside a different bay, not only from the trunk', () => {
    const { bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', 'feat/two'], bays[0]);

    assert.equal(result.code, 0);
    assert.match(result.out, /^feat\/two · leg 3 of 7 \(refine\)$/m);
    assert.equal(result.out.split('\n').includes(cdLines(bays[1])[0]), true);
  });

  it('leaves the cd line out when the operator is already standing in that bay', () => {
    const { bays } = trunkWith('feat/one');

    const result = cli(['next', 'feat/one'], bays[0]);

    assert.equal(result.code, 0);
    assert.equal(/^IN BAY:$/m.test(result.out), false, 'told the operator to cd where they already are');
  });

  it('names the verb that would cut a bay for a branch that has none, on stdout, and exits 2', () => {
    const { repo } = trunkWith('feat/one');

    const result = cli(['next', 'feat/nope'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.err, '');
    assert.match(result.out, /^waybill: no bay for feat\/nope — cut one with `waybill bay feat\/nope`$/m);
  });

  it("treats the trunk's own branch as having no bay, since a second trunk is not an effort", () => {
    const { repo } = trunkWith('feat/one');

    const result = cli(['next', 'main'], repo);

    assert.equal(result.code, 2);
    assert.match(result.out, /no bay for main/);
  });

  it('reports the missing bay as an object under --json, with the open dockets to choose from', () => {
    const { repo, bays } = trunkWith('feat/one');

    const result = cli(['next', '--json', 'feat/nope'], repo);

    assert.equal(result.code, 2);
    const payload = JSON.parse(result.out);
    assert.match(payload.error, /no bay for feat\/nope/);
    assert.deepEqual(payload.dockets, [
      { branch: 'feat/one', path: bays[0], leg: 'refine', index: 3 },
    ]);
  });

  it('rejects a second positional on stderr rather than guessing which is the branch', () => {
    const { repo } = trunkWith('feat/one');

    const result = cli(['next', 'feat/one', 'feat/two'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.out, '', 'a parse error is the CLI\'s own, and keeps stderr');
    assert.match(result.err, /one branch name/);
    assert.match(result.err, /Usage: waybill/);
  });
});

describe('waybill next <branch>/<leg>', () => {
  it('enters the bay and runs the named leg when it is the next one', () => {
    const { repo, bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', '--markdown', 'feat/two/refine'], repo);

    assert.equal(result.code, 0);
    assert.ok(result.out.startsWith(`ENTER BAY: ${bays[1]}\n\nRUN: /ideation:ideation`), result.out);
    assert.match(result.out, /^feat\/two · leg 3 of 7 \(refine\)$/m);
  });

  it('names the actual next leg and runs nothing when the named one is stale', () => {
    const { repo, bays } = trunkWith('feat/two');

    const result = cli(['next', '--markdown', 'feat/two/specs'], repo);

    assert.equal(result.code, 0);
    assert.ok(result.out.startsWith(`ENTER BAY: ${bays[0]}\n\nNEXT LEG: refine\n`), result.out);
    assert.equal(/^RUN:/m.test(result.out), false);
  });

  it('enters the bay and runs nothing for a bare branch', () => {
    const { repo, bays } = trunkWith('feat/two');

    const result = cli(['next', '--markdown', 'feat/two'], repo);

    assert.ok(result.out.startsWith(`ENTER BAY: ${bays[0]}\n\n\`\`\`text\n`), result.out);
    assert.equal(/^(RUN|NEXT LEG):/m.test(result.out), false);
  });

  it('enters the named bay from inside a different bay, not only from the trunk', () => {
    const { bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', '--markdown', 'feat/two/refine'], bays[0]);

    assert.ok(result.out.startsWith(`ENTER BAY: ${bays[1]}\n\nRUN: /ideation:ideation`), result.out);
  });

  it('runs without entering from inside the named bay', () => {
    const { bays } = trunkWith('feat/two');

    const result = cli(['next', '--markdown', 'feat/two/refine'], bays[0]);

    assert.ok(result.out.startsWith('RUN: /ideation:ideation'), result.out);
    assert.equal(result.out.includes('ENTER BAY'), false);
  });

  it('never enters the bay a cleanup token names, since cleanup is about to remove it', () => {
    const { repo } = trunkWith('feat/two');

    const result = cli(['next', '--markdown', 'feat/two/cleanup'], repo);

    assert.equal(result.out.includes('ENTER BAY'), false);
    assert.match(result.out, /^NEXT LEG: refine$/m);
  });

  it('names the branch part in the miss when a known leg follows a branch with no bay', () => {
    const { repo } = trunkWith('feat/one');

    const result = cli(['next', '--markdown', 'feat/nope/execute'], repo);

    assert.equal(result.code, 2);
    assert.match(result.out, /^waybill: no bay for feat\/nope — cut one with `waybill bay feat\/nope`$/m);
  });

  it('keeps an unknown last segment as part of the branch name', () => {
    const { repo } = trunkWith('feat/one');

    const result = cli(['next', '--markdown', 'feat/one/bogus'], repo);

    assert.equal(result.code, 2);
    assert.match(result.out, /no bay for feat\/one\/bogus/);
  });

  it('resolves a branch whose last segment is a leg id as that branch, not as a token', () => {
    const { repo } = trunkWith('fix/specs');

    const result = cli(['next', '--markdown', 'fix/specs'], repo);

    assert.equal(result.code, 0);
    assert.match(result.out, /^fix\/specs · leg 3 of 7 \(refine\)$/m);
    assert.equal(/^(RUN|NEXT LEG):/m.test(result.out), false);
  });

  it('prints the plain waybill with its cd for a token outside markdown, and keys nothing', () => {
    const { repo, bays } = trunkWith('feat/two');

    const result = cli(['next', 'feat/two/refine'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.out.split('\n').includes(cdLines(bays[0])[0]), true);
    assert.equal(/^(ENTER BAY|RUN|NEXT LEG):/m.test(result.out), false);
  });

  it('answers --json for the branch part of a token', () => {
    const { repo } = trunkWith('feat/two');

    const result = cli(['next', '--json', 'feat/two/refine'], repo);

    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.out).branch, 'feat/two');
  });
});

describe('waybill new', () => {
  it("prints leg 1's waybill — byte-for-byte the block the trunk used to answer `next` with", () => {
    // The golden's third consumer, and the first outside the renderer suite. That is the point:
    // `tests/waybill.test.js` proves the renderer still produces this block, and this proves the
    // verb still routes to it. The spec's claim is byte-for-byte, so nothing weaker will do.
    const result = cli(['new'], noDocketFixture().dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(result.out, fs.readFileSync(path.join(GOLDEN, 'no-docket.txt'), 'utf8'));
  });

  it('hands the first leg off and invokes nothing — a terminal has no session to invoke in', () => {
    const result = cli(['new'], trunkWith().repo);

    assert.equal(result.code, 0);
    assert.match(result.out, /^NEXT:$/m);
    assert.match(result.out, /^\/ideation:brainstorm$/m);
  });

  it('answers identically with dockets in flight — `new` has no exit contract of its own', () => {
    // `next`'s exit contract is about issuing a waybill for a *docket*, and `new` has none: it is
    // the entry point, so the fleet cannot change its answer.
    const result = cli(['new'], trunkWith('feat/one', 'feat/two').repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /^main · no docket open$/m);
    assert.equal(result.out.includes('SELECT A DOCKET:'), false, 'the fleet answered instead');
  });

  it('warns from inside a bay, names the trunk it answers for, and still exits 0', () => {
    const { bays } = trunkWith('feat/one');

    const result = cli(['new'], bays[0]);

    assert.equal(result.code, 0);
    assert.equal(result.err, '', 'the `!` invocation captures stdout only, so stderr would vanish');
    assert.match(result.out, /^WARNINGS:$/m);
    assert.match(result.out, /new efforts begin on the trunk/);
    // The header names the trunk this waybill is for. `feat/one · no docket open` would be a false
    // claim about a branch that does carry one, and `feat/one · leg 1 of 7 (ideate)` a false claim
    // about where that docket stands.
    assert.match(result.out, /^main · no docket open$/m);
    assert.equal(result.out.includes('leg 3 of 7'), false, "the bay's own leg was reported instead");
  });

  it('still hands off the ideate leg from inside a bay rather than blocking on the warning', () => {
    const { bays } = trunkWith('feat/one');

    const result = cli(['new'], bays[0]);

    assert.match(result.out, /^\/ideation:brainstorm$/m);
    assert.ok(result.out.indexOf('NEXT:') < result.out.indexOf('WARNINGS:'), 'the warning buried it');
  });

  it('rejects every option, since there is no second machine-readable surface', () => {
    const result = cli(['new', '--json'], trunkWith().repo);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown option `--json`/);
    assert.match(result.err, /Usage: waybill/);
  });

  it('explains itself in one line outside a repository and exits 2', () => {
    const result = cli(['new'], tempRoot());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.equal(result.err.trimEnd().split('\n').length, 1, `not one line: ${result.err}`);
    assert.match(result.err, /not inside a git repository/);
  });

  it('is listed in usage, so the verb `next` points at can be found from a mistyped command', () => {
    const result = cli(['bogus'], trunkWith().repo);

    assert.match(result.err, /^ {2}new {2,}\S/m);
  });
});

describe('waybill status', () => {
  it('prints the position for the leg the repository is on, and exits 0', () => {
    const fixture = specsFixture();
    const result = cli(['status'], fixture.dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(result.out, fs.readFileSync(path.join(GOLDEN, 'status.txt'), 'utf8'));
  });

  it('hands off nothing — the waybill is `next`\'s answer, not this one\'s', () => {
    const result = cli(['status'], specsFixture().dir);

    assert.equal(result.out.includes('NEXT:'), false);
    assert.equal(result.out.includes('/spec:propose'), false);
    // The same run of `next` does emit it, so the difference is the command and not the fixture.
    assert.match(cli(['next'], specsFixture().dir).out, /\/spec:propose/);
  });

  it('reports ignored papers, which belong to the position rather than to the waybill', () => {
    const fixture = specsFixture();
    writeFile(path.join(fixture.dir, '.gitignore'), '/openspec/\n');

    const result = cli(['status'], fixture.dir);
    assert.equal(result.code, 0);
    assert.match(result.out, /^IGNORED BY GIT:$/m);
  });

  it('explains itself in one line outside a repository and exits 2', () => {
    const result = cli(['status'], tempRoot());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.equal(result.err.trimEnd().split('\n').length, 1, `not one line: ${result.err}`);
    assert.match(result.err, /not inside a git repository/);
  });

  it('rejects --json rather than printing a second machine surface that could drift from next', () => {
    const result = cli(['status', '--json'], specsFixture().dir);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown option `--json`/);
    assert.match(result.err, /Usage: waybill/);
  });
});

describe('waybill status on the trunk', () => {
  it('reports every docket in flight with its branch and position, and exits 0', () => {
    const { repo } = trunkWith('feat/one', 'fix/three');

    const result = cli(['status'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /^main · 2 dockets open$/m);
    assert.match(result.out, /^DOCKETS:$/m);
    assert.match(result.out, /^ {2}feat\/one +· leg 3 of 7 \(refine\)$/m);
    assert.match(result.out, /^ {2}fix\/three · leg 3 of 7 \(refine\)$/m);
    assert.equal(result.out.includes('NEXT:'), false, 'the fleet view hands off nothing');
  });

  it('says so in the plural when nothing is in flight, without a heading over an empty list', () => {
    const result = cli(['status'], trunkWith().repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(result.out, 'main · no dockets open\n');
    // One character apart from `no docket open`, and the opposite claim: that is one branch
    // carrying no docket, this is a repository with nothing open on any branch.
    assert.equal(result.out.includes('no docket open'), false);
  });

  it('raises no warnings of its own for a fleet that resolved cleanly', () => {
    const result = cli(['status'], trunkWith('feat/one', 'feat/two').repo);

    assert.equal(result.out.includes('WARNINGS:'), false);
  });

  it('names a detached trunk rather than interpolating a null branch', () => {
    const { repo } = trunkWith('feat/one');
    git(repo, ['checkout', '--detach']);

    const result = cli(['status'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.out.includes('null'), false, 'a null branch reached the rendered header');
    assert.match(result.out, /^detached HEAD · 1 docket open$/m);
  });

  it('still takes no options, so the fleet view is chosen by where you stand', () => {
    const result = cli(['status', '--json'], trunkWith('feat/one').repo);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown option `--json`/);
  });
});

describe('waybill bay', () => {
  it('creates the bay, names the cd target, and hands off the leg that follows', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const result = cli(['bay', 'feat/demo'], repo);
    const target = defaultBayPath(repo, 'feat/demo');

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(fs.existsSync(target), true);
    assert.match(result.out, new RegExp(`^ {2}cd ${target}$`, 'm'));
    // The waybill must be resolved from the *new* tree: from the operator's cwd the bay leg
    // still reads as outstanding, and the command would hand back the leg it has just done.
    assert.match(result.out, /^feat\/demo · leg 3 of 7 \(refine\)$/m);
    assert.match(result.out, /✓ bay/);
  });

  it('is a clean no-op on a second run, and still prints the waybill', () => {
    const repo = createRepo({ remote: true, originHead: true });
    cli(['bay', 'feat/demo'], repo);

    const result = cli(['bay', 'feat/demo'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /already exists/);
    assert.match(result.out, /^ {2}cd /m);
    assert.match(result.out, /\(refine\)/);
  });

  it('reports a no-op without a cd line when run from inside the bay it would create', () => {
    const repo = createRepo({ remote: true, originHead: true });
    cli(['bay', 'feat/demo'], repo);
    const target = defaultBayPath(repo, 'feat/demo');

    const result = cli(['bay', 'feat/demo'], target);

    assert.equal(result.code, 0);
    assert.equal(/^ {2}cd /m.test(result.out), false, 'told the operator to cd where they already are');
    assert.match(result.out, /already inside/);
    assert.match(result.out, /\(refine\)/);
  });

  it('names the cd target in the one shape the renderer builds, not a second one of its own', () => {
    // The claim §3.3 makes is that `bay` and a trunk-resolved `next` cannot print different shapes
    // of the same instruction. Asserting the regex only would let the two drift apart character by
    // character while both still matched; comparing against the helper is what actually pins it.
    const repo = createRepo({ remote: true, originHead: true });

    const result = cli(['bay', 'feat/demo'], repo);
    const target = defaultBayPath(repo, 'feat/demo');

    assert.equal(result.code, 0);
    assert.equal(result.out.split('\n').includes(cdLines(target)[0]), true);
  });

  it('exits 2 with usage when given no branch name at all', () => {
    const result = cli(['bay'], createRepo({ remote: true, originHead: true }));

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /Usage: waybill/);
  });

  it('puts the bay where --bay-dir says, ahead of the environment', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const result = withEnv({ WAYBILL_BAY_DIR: 'from-env' }, () =>
      cli(['bay', '--bay-dir', 'bays', 'feat/demo'], repo),
    );
    const target = path.join(repo, 'bays', `${path.basename(repo)}-feat-demo`);

    assert.equal(result.code, 0);
    assert.equal(fs.existsSync(target), true);
    assert.match(result.out, new RegExp(`^ {2}cd ${target}$`, 'm'));
  });

  it('accepts --bay-dir after the branch name too, and rejects it with no path', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const trailing = cli(['bay', 'feat/demo', '--bay-dir', 'bays'], repo);
    assert.equal(trailing.code, 0);
    assert.match(trailing.out, new RegExp(`^ {2}cd ${path.join(repo, 'bays')}`, 'm'));

    const bare = cli(['bay', '--bay-dir'], repo);
    assert.equal(bare.code, 2);
    assert.equal(bare.out, '');
    assert.match(bare.err, /`--bay-dir` takes a path/);
  });

  it('rejects an option and a second positional rather than guessing which is the branch', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const flagged = cli(['bay', '--force', 'feat/demo'], repo);
    assert.equal(flagged.code, 2);
    assert.match(flagged.err, /unknown option `--force`/);

    const extra = cli(['bay', 'feat/demo', 'feat/other'], repo);
    assert.equal(extra.code, 2);
    assert.match(extra.err, /one branch name/);
  });

  it('explains itself in one line outside a repository and exits 2', () => {
    const result = cli(['bay', 'feat/demo'], tempRoot());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.equal(result.err.trimEnd().split('\n').length, 1, `not one line: ${result.err}`);
    assert.match(result.err, /not inside a git repository/);
  });

  it('turns a git refusal into a remedy on stderr, with no stack trace and no half-waybill', () => {
    const result = cli(['bay', 'feat/demo'], createRepo({ commit: false }));

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /no commits yet/);
    assert.match(result.err, /initial commit/);
    assert.equal(/\bat .*\.js:\d+/.test(result.err), false, 'a stack trace leaked into stderr');
  });

  it('rejects the former `start` verb as unknown, since the rename ships without an alias', () => {
    const result = cli(['start', 'feat/demo'], createRepo({ remote: true, originHead: true }));

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown command `start`/);
    // An alias would be a second name to document and keep in step forever, so usage must not
    // offer the old verb back either.
    assert.equal(/^ {2}start /m.test(result.err), false, '`start` is still listed in usage');
  });
});

describe('waybill next --markdown', () => {
  it('prints the markdown waybill in a bay — the golden the renderer pins — and exits 0', () => {
    const result = cli(['next', '--markdown'], specsFixture().dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.equal(result.out, fs.readFileSync(path.join(GOLDEN, 'specs.md'), 'utf8'));
    assert.match(result.out, /^```text$/m);
    assert.match(result.out, /^```\n\/waybill:next feat\/thing\/specs\n```$/m);
  });

  it('hands a named branch over to /waybill:next, entering its bay rather than printing a cd', () => {
    const { repo, bays } = trunkWith('feat/one', 'feat/two');

    const result = cli(['next', '--markdown', 'feat/two'], repo);

    assert.equal(result.code, 0);
    assert.match(result.out, new RegExp(`^ENTER BAY: ${bays[1]}$`, 'm'));
    assert.match(result.out, /^```\n\/waybill:next feat\/two\/refine\n```$/m);
    assert.equal(result.out.includes('**IN BAY**'), false);
    assert.equal(/^cd /m.test(result.out), false);
  });

  it('prints markdown for the one open docket on the trunk', () => {
    const { repo, bays } = trunkWith('feat/one');

    const result = cli(['next', '--markdown'], repo);

    assert.equal(result.code, 0);
    assert.ok(result.out.startsWith('```text\nfeat/one · leg 3 of 7 (refine)\n'));
    assert.match(result.out, /^```\n\/waybill:next feat\/one\/refine\n```$/m);
    assert.equal(result.out.includes(bays[0]), false, 'neither a cd nor ENTER BAY: nobody asked to move');
  });

  it('leaves the selection menu untouched under --markdown, and still exits 2', () => {
    const { repo } = trunkWith('feat/one', 'feat/two', 'fix/three');

    const result = cli(['next', '--markdown'], repo);

    assert.equal(result.code, 2);
    assert.equal(result.out, cli(['next'], repo).out);
  });

  it('rejects --json with --markdown, in either order, naming the conflict', () => {
    const dir = specsFixture().dir;
    for (const argv of [['next', '--json', '--markdown'], ['next', '--markdown', '--json']]) {
      const result = cli(argv, dir);
      assert.equal(result.code, 2);
      assert.equal(result.out, '');
      assert.match(result.err, /cannot be combined/);
      assert.match(result.err, /--markdown/);
    }
  });

  it('gives the --json/--markdown conflict outside a repository too, not the repository error', () => {
    const result = cli(['next', '--json', '--markdown'], tempRoot());

    assert.equal(result.code, 2);
    assert.match(result.err, /cannot be combined/);
    assert.equal(result.err.includes('not inside a git repository'), false);
  });

  it('still rejects a misspelled option alongside --markdown', () => {
    const result = cli(['next', '--markdown', '--jsonn'], specsFixture().dir);

    assert.equal(result.code, 2);
    assert.match(result.err, /unknown option `--jsonn`/);
  });

  it('is not an option `new` takes: new --markdown is rejected', () => {
    const result = cli(['new', '--markdown'], noDocketFixture().dir);

    assert.equal(result.code, 2);
    assert.match(result.err, /unknown option `--markdown`/);
  });
});

describe('waybill bay --markdown', () => {
  it('bay --markdown names the new bay, then a waybill that hands over to /waybill:next', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const result = cli(['bay', '--markdown', 'feat/thing'], repo);
    const target = defaultBayPath(repo, 'feat/thing');

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    // The temp path differs on every run, so it is pinned as the literal the renderer goldens use.
    const stable = result.out.replaceAll(target, '/repo/.claude/worktrees/waybill-feat-thing');
    assertGolden(GOLDEN, 'bay-cut', stable, 'md');
    assert.equal(/^cd /m.test(result.out), false);
  });

  it('bay --markdown on a second run says the bay already exists', () => {
    const repo = createRepo({ remote: true, originHead: true });
    cli(['bay', 'feat/demo'], repo);
    const target = defaultBayPath(repo, 'feat/demo');

    const result = cli(['bay', '--markdown', 'feat/demo'], repo);

    assert.equal(result.code, 0);
    assert.ok(result.out.startsWith(`bay already exists at ${target}\n\n\`\`\`text\n`), result.out);
  });

  it('bay --markdown from inside the bay prints no cd fence', () => {
    const repo = createRepo({ remote: true, originHead: true });
    cli(['bay', 'feat/demo'], repo);
    const target = defaultBayPath(repo, 'feat/demo');

    const result = cli(['bay', '--markdown', 'feat/demo'], target);

    assert.equal(result.code, 0);
    assert.ok(
      result.out.startsWith(`already inside the feat/demo bay at ${target} — nothing to do\n\n\`\`\`text\n`),
    );
    assert.equal(result.out.includes('IN BAY'), false, 'told the operator to cd where they already are');
    assert.equal(/^cd /m.test(result.out), false);
  });

  it('bay --markdown leaves the --list branch menu untouched, since it issues no waybill', () => {
    const repo = createRepo();
    git(repo, ['branch', 'feat/listed']);

    const result = cli(['bay', '--list', '--markdown'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.out, cli(['bay', '--list'], repo).out);
  });

  it('bay --markdown still honours --bay-dir', () => {
    const repo = createRepo({ remote: true, originHead: true });

    const result = cli(['bay', 'feat/demo', '--markdown', '--bay-dir', 'bays'], repo);
    const target = path.join(repo, 'bays', `${path.basename(repo)}-feat-demo`);

    assert.equal(result.code, 0);
    assert.equal(fs.existsSync(target), true);
    assert.ok(result.out.startsWith(`bay created at ${target}\n`));
    assert.match(result.out, /^```\n\/waybill:next feat\/demo\/refine\n```$/m);
  });
});

describe('waybill bay --list', () => {
  it('lists branches without a bay first, then those with one, and exits 0', () => {
    const { repo, bays } = trunkWith('feat/has-bay');
    git(repo, ['branch', 'feat/no-bay']);

    const result = cli(['bay', '--list'], repo);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.deepEqual(result.out.split('\n'), [
      'SELECT A BRANCH:',
      '  feat/no-bay  · no bay',
      `  feat/has-bay · bay at ${bays[0]}`,
      '',
      '  waybill bay <branch>',
      '',
    ]);
  });

  it('touches nothing — no branch, no bay, no exclude line', () => {
    const repo = createRepo({ remote: true, originHead: true });
    git(repo, ['branch', 'feat/listed']);
    const before = [git(repo, ['for-each-ref']), git(repo, ['worktree', 'list', '--porcelain'])];
    const exclude = path.join(repo, '.git', 'info', 'exclude');
    const excludeBefore = fs.readFileSync(exclude, 'utf8');

    cli(['bay', '--list'], repo);

    assert.deepEqual([git(repo, ['for-each-ref']), git(repo, ['worktree', 'list', '--porcelain'])], before);
    assert.equal(fs.readFileSync(exclude, 'utf8'), excludeBefore);
  });

  it('says there is nothing to list in one line, naming the trunk, and still exits 0', () => {
    const result = cli(['bay', '--list'], createRepo());

    assert.equal(result.code, 0);
    assert.equal(result.out, 'no branches besides main — name one with `waybill bay <branch>`\n');
  });

  it('puts the branch the tmux window names first, and says why', () => {
    const { repo } = trunkWith('feat/has-bay');
    git(repo, ['branch', 'feat/no-bay']);

    const result = cli(['bay', '--list'], repo, {
      tmux: { session: 'repo', window: 'has-bay', pane: '' },
      history: [],
    });

    assert.equal(result.code, 0);
    assert.match(result.out, /^SELECT A BRANCH:\n {2}feat\/has-bay · bay at .* · tmux window "has-bay"\n/);
  });

  it('suggests a new branch from the tmux window, checked against git\'s own ref rules', () => {
    const repo = createRepo();

    const result = cli(['bay', '--list'], repo, {
      tmux: { session: 'repo', window: 'bay picker', pane: '' },
      history: [],
    });

    assert.equal(result.code, 0);
    assert.match(result.out, /^SELECT A BRANCH:\n {2}feat\/bay-picker · new · tmux window "bay picker"\n/);
  });

  it('rejects a branch name alongside --list, on stderr, rather than guessing which was meant', () => {
    const repo = createRepo();

    for (const argv of [['bay', '--list', 'feat/x'], ['bay', 'feat/x', '--list']]) {
      const result = cli(argv, repo);
      assert.equal(result.code, 2);
      assert.equal(result.out, '');
      assert.match(result.err, /`--list` takes no branch name/);
    }
  });

  it('rejects --bay-dir alongside --list, since the list finds bays wherever they are', () => {
    const result = cli(['bay', '--list', '--bay-dir', 'bays'], createRepo());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /`--list` takes no .*`--bay-dir`/);
  });

  it('explains itself in one line outside a repository and exits 2', () => {
    const result = cli(['bay', '--list'], tempRoot());

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.equal(result.err.trimEnd().split('\n').length, 1, `not one line: ${result.err}`);
    assert.match(result.err, /not inside a git repository/);
  });

  it('is listed in usage', () => {
    assert.match(cli(['--help'], tempRoot()).out, /--list/);
  });
});

describe('waybill argument parsing', () => {
  it('answers --help after the subcommand, not only before it', () => {
    const result = cli(['next', '--help'], specsFixture().dir);

    assert.equal(result.code, 0);
    assert.equal(result.err, '');
    assert.match(result.out, /Usage: waybill <command> \[options\]/);
    assert.equal(result.out.includes('NEXT:'), false, 'a waybill was rendered instead of usage');
  });

  it('answers --help before the subcommand too', () => {
    const result = cli(['--help'], tempRoot());
    assert.equal(result.code, 0);
    assert.match(result.out, /Usage: waybill <command> \[options\]/);
  });

  it('exits 2 on an unknown command', () => {
    const result = cli(['bogus'], specsFixture().dir);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /unknown command `bogus`/);
    assert.match(result.err, /Usage: waybill/);
  });

  it('exits 2 with usage on stderr when given no command at all', () => {
    const result = cli([], specsFixture().dir);

    assert.equal(result.code, 2);
    assert.equal(result.out, '');
    assert.match(result.err, /Usage: waybill/);
  });
});
