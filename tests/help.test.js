import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_LINES, renderHelp } from '../src/help.js';
import { run } from '../src/cli.js';
import { LEGS } from '../src/legs.js';
import {
  addWorktree,
  assertGolden,
  cleanupAll,
  createRepo,
  tempRoot,
  withEnv,
  writeFile,
} from './helpers/repo-fixture.js';

after(cleanupAll);

const GOLDEN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

/**
 * The page reads bookings through the operator's environment, so an overlay configured on this
 * machine would otherwise land in every assertion — the golden included. Each case that wants an
 * overlay sets one inside this.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function isolated(fn) {
  return withEnv(
    { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', WAYBILL_BOOKINGS_DIR: undefined },
    fn,
  );
}

/**
 * @param {string[]} argv
 * @param {string} [cwd]
 * @returns {{code:number, out:string, err:string}}
 */
function cli(argv, cwd = tempRoot()) {
  let out = '';
  let err = '';
  const code = isolated(() =>
    run(argv, {
      cwd,
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    }),
  );
  return { code, out, err };
}

/** @param {string} page @returns {number} lines, not counting the empty string after the final newline */
const lineCount = (page) => page.split('\n').length - 1;

/**
 * The text between two heading lines, or from a heading to the end of the page.
 *
 * @param {string} page
 * @param {string} heading
 * @param {string} [until] the next heading, matched as the start of a line
 * @returns {string}
 */
function section(page, heading, until) {
  const start = page.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `no \`${heading}\` heading`);
  const body = page.slice(start + heading.length + 2);
  if (until === undefined) return body;
  const end = body.indexOf(`\n${until}`);
  assert.notEqual(end, -1, `no \`${until}\` after \`${heading}\``);
  return body.slice(0, end);
}

/**
 * The route row for one leg, found by its 1-based position and id.
 *
 * @param {string} page
 * @param {string} id
 * @returns {string}
 */
function row(page, id) {
  const index = LEGS.findIndex((leg) => leg.id === id) + 1;
  const found = section(page, 'ROUTE', 'WORDS')
    .split('\n')
    .find((line) => new RegExp(`^ +${index} +${id} `).test(line));
  assert.ok(found, `no route row for ${index} ${id}`);
  return found;
}

/**
 * An overlay directory holding one booking file.
 *
 * @param {string} contents
 * @returns {string}
 */
function overlay(contents) {
  const dir = path.join(tempRoot(), 'overlay');
  writeFile(path.join(dir, 'execute.md'), contents);
  return dir;
}

/** @param {string} dir @returns {string} */
const renderWithOverlay = (dir) =>
  isolated(() => withEnv({ WAYBILL_BOOKINGS_DIR: dir }, () => renderHelp(tempRoot())));

/**
 * The `--help` output, split into its Commands rows and its Options block.
 *
 * @returns {{commands:string[], options:string}}
 */
function usage() {
  const { out } = cli(['--help']);
  const commands = out.slice(out.indexOf('Commands:\n') + 'Commands:\n'.length, out.indexOf('\nOptions:'));
  return {
    commands: commands.split('\n').filter((line) => line.trim() !== ''),
    options: out.slice(out.indexOf('Options:')),
  };
}

describe('renderHelp', () => {
  it('fits one screen', () => {
    const page = isolated(() => renderHelp(tempRoot()));
    assert.equal(MAX_LINES, 45);
    assert.ok(lineCount(page) <= MAX_LINES, `${lineCount(page)} lines`);
    for (const line of page.split('\n')) {
      assert.ok([...line].length <= 80, `wider than 80 columns: ${line}`);
    }
  });

  it('lists every leg', () => {
    const route = section(isolated(() => renderHelp(tempRoot())), 'ROUTE', 'WORDS');
    let previous = -1;
    LEGS.forEach((leg, i) => {
      const match = new RegExp(`^ +${i + 1} +${leg.id} `, 'm').exec(route);
      assert.ok(match, `no row for ${i + 1} ${leg.id}`);
      assert.ok(match.index > previous, `${leg.id} is out of route order`);
      previous = match.index;
    });
  });

  it('names the stamp for each shipped leg', () => {
    const page = isolated(() => renderHelp(tempRoot()));
    const stamps = {
      ideate: 'repo state',
      bay: 'bay exists',
      refine: 'contract-data.json',
      contract: 'contract.md',
      specs: 'tasks.md',
      execute: 'all tasks ticked',
      cleanup: 'merged, bay gone',
    };
    for (const [id, stamp] of Object.entries(stamps)) {
      assert.ok(row(page, id).trimEnd().endsWith(`  ${stamp}`), `${id} does not show \`${stamp}\``);
    }
  });

  it('reflects a rebooked carrier', () => {
    const dir = overlay(
      [
        '---',
        'leg: execute',
        'command: /overlay:apply-somewhere-else',
        'model: overlay-model',
        'stampPath: docs/overlay/*.md',
        '---',
        'Apply it somewhere else.',
        '',
      ].join('\n'),
    );
    const page = renderWithOverlay(dir);
    assert.ok(row(page, 'execute').includes('/overlay:apply-somewhere-else'));
    assert.equal(row(page, 'execute').includes('/spec:apply'), false);
    assert.ok(lineCount(page) <= MAX_LINES, `${lineCount(page)} lines`);
  });

  it('survives a malformed overlay', () => {
    const dir = overlay(['---', 'leg: execute', 'model: overlay-model', 'stampPath: a.md', '---', ''].join('\n'));
    /** @type {string} */
    let page = '';
    assert.doesNotThrow(() => {
      page = renderWithOverlay(dir);
    });
    for (const leg of LEGS) {
      assert.match(row(page, leg.id), / {2}— {2,}—$/, `${leg.id} is not em-dashed in both columns`);
    }
    const notes = page.split('\n').filter((line) => line.startsWith('bookings could not be read:'));
    assert.equal(notes.length, 1, page);
    assert.ok(lineCount(page) <= MAX_LINES, `${lineCount(page)} lines`);
  });

  it('golden under a neutralised environment', () => {
    assertGolden(GOLDEN, 'help', isolated(() => renderHelp(tempRoot())));
  });

  it('covers every subcommand', () => {
    const tokens = usage().commands.map((line) => line.trim().split(/\s+/)[0]);
    assert.ok(tokens.includes('help'), `no \`help\` row in the usage: ${tokens.join(', ')}`);

    const commands = section(isolated(() => renderHelp(tempRoot())), 'COMMANDS', 'Why:');
    for (const token of tokens.filter((name) => name !== 'help')) {
      assert.ok(commands.includes(`waybill ${token}`), `COMMANDS does not name \`waybill ${token}\``);
    }
  });

  it('names all four sections', () => {
    const page = isolated(() => renderHelp(tempRoot()));
    const offsets = ['FROM ZERO', 'ROUTE', 'WORDS', 'COMMANDS'].map((heading) =>
      page.indexOf(`\n${heading}\n`),
    );
    assert.ok(offsets.every((offset) => offset !== -1), `a heading is missing: ${offsets}`);
    assert.deepEqual([...offsets].sort((a, b) => a - b), offsets, 'the headings are out of order');

    const fromZero = section(page, 'FROM ZERO', 'ROUTE');
    for (const step of ['waybill new', 'waybill bay', 'cd ']) {
      assert.ok(fromZero.includes(step), `FROM ZERO does not name \`${step}\``);
    }
    assert.equal(page.includes('waybill start'), false);
    assert.equal(page.includes('/waybill:start'), false);
  });

  it('same page on the trunk and in a bay', () => {
    const repo = createRepo();
    const bay = addWorktree(repo, 'feat/x');
    assert.equal(isolated(() => renderHelp(repo)), isolated(() => renderHelp(bay)));
  });
});

describe('waybill help', () => {
  it('outside a repository', () => {
    const cwd = tempRoot();
    const { code, out, err } = cli(['help'], cwd);
    assert.equal(code, 0, err);
    assert.equal(out, isolated(() => renderHelp(cwd)));
    assert.equal(err, '');
  });

  it('rejects arguments', () => {
    const topic = cli(['help', 'bay']);
    assert.equal(topic.code, 2);
    assert.equal(topic.out, '');
    assert.match(topic.err, /`help` takes no arguments/);

    const asked = cli(['help', '--help']);
    assert.equal(asked.code, 0);
    assert.match(asked.out, /Usage: waybill/);
  });

  it('--help stays terse', () => {
    // A literal copy of the usage from before `help` existed, so this cannot agree with a `USAGE`
    // that quietly reworded a verb's row or an option while the new row was being added.
    const before = [
      '  new             Begin an effort: the first leg\'s waybill, and nothing else',
      '  bay <branch>    Create the branch and its bay, then hand off the next leg',
      '  next [<branch>] Where this docket stands, and the waybill for the next leg',
      '  status          Where this docket stands, without the waybill',
    ];
    const options = [
      'Options:',
      '  --json            Print the raw resolved state instead of the waybill (`next` only)',
      '  --bay-dir <path>  Where bays are created (`bay` only); overrides WAYBILL_BAY_DIR and',
      '                    `git config waybill.baydir`. Relative paths resolve against the main',
      '                    checkout; the default is .claude/worktrees',
      '  --help            Print this message',
      '',
    ].join('\n');

    const { commands, options: actual } = usage();
    assert.deepEqual(commands.slice(0, -1), before);
    assert.equal(commands.length, before.length + 1);
    assert.ok(commands.at(-1).startsWith('  help '), `the last row is not \`help\`: ${commands.at(-1)}`);
    assert.equal(actual, options);
  });
});
