import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../src/cli.js';
import {
  cleanupAll,
  createRepo,
  defaultBayPath,
  pathWithout,
  tempRoot,
  withEnv,
  withPath,
  writeFile,
} from './helpers/repo-fixture.js';
import { specsFixture } from './fixtures/specs.js';

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
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {{code:number, out:string, err:string}}
 */
function cli(argv, cwd) {
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
