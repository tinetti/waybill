import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { addWorktree, cleanupAll, createRepo, pathWithout, tempRoot } from './helpers/repo-fixture.js';

after(cleanupAll);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = path.join(ROOT, 'commands');
const WRAPPER = '2>&1 || echo "waybill: exited $?"';
const MARKER = /^waybill: exited 2$/m;

/**
 * The first `` !` `` line of a command file outside HTML comments, backticks stripped, or `null`.
 * Comments are skipped the way `tests/commands.test.js` skips them, because they are where a line
 * is quoted to be explained rather than run.
 *
 * @param {string} rel path under `commands/`
 * @returns {string|null}
 */
function rawBang(rel) {
  const source = fs.readFileSync(path.join(COMMANDS, ...rel.split('/')), 'utf8');
  let inComment = false;
  for (const line of source.split('\n')) {
    if (line.includes('<!--')) inComment = true;
    const commented = inComment;
    if (line.includes('-->')) inComment = false;
    if (!commented && line.startsWith('!`')) return line.slice(2, line.lastIndexOf('`'));
  }
  return null;
}

/**
 * The command's `!` line with exactly what Claude Code rewrites substituted: the literal
 * `${CLAUDE_PLUGIN_ROOT}` and `$ARGUMENTS`. `split`/`join` rather than `replace`, whose replacement
 * string gives `$&` and `$'` meanings a path or argument should never acquire.
 *
 * @param {string} command e.g. `next`
 * @param {{root?: string, args?: string}} [options]
 * @returns {string}
 */
function bangLine(command, { root = ROOT, args = '' } = {}) {
  const line = rawBang(`${command}.md`);
  assert.notEqual(line, null, `commands/${command}.md has no \`!\` line`);
  return line.split('${CLAUDE_PLUGIN_ROOT}').join(root).split('$ARGUMENTS').join(args);
}

/**
 * Run a command's `!` line through bash, as the harness does. `node` is pinned to the one running
 * this suite, and the real `openspec` is dropped from `PATH` so a developer's install cannot change
 * what the CLI renders.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {{root?: string, args?: string}} [options]
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
function runBang(command, cwd, options) {
  const PATH = [path.dirname(process.execPath), pathWithout('openspec')].join(path.delimiter);
  return spawnSync('bash', ['-c', bangLine(command, options)], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH },
  });
}

/**
 * @param {...string} branches
 * @returns {string} the trunk
 */
function trunkWith(...branches) {
  const repo = createRepo();
  for (const branch of branches) addWorktree(repo, branch);
  return repo;
}

describe('the `!` lines that shell out to the CLI', () => {
  // Claude Code discards a command file whose `!` line exits non-zero — the Task section never
  // renders — so every one of these runs must exit 0, and a refusal is recognised by the marker.

  it('shows `next` refusing on an empty trunk, and still exits 0', () => {
    const result = runBang('next', trunkWith());

    assert.equal(result.status, 0);
    assert.match(result.stdout, /no dockets open/);
    assert.match(result.stdout, MARKER);
  });

  it('shows `next` asking which docket on a crowded trunk, and still exits 0', () => {
    const result = runBang('next', trunkWith('feat/one', 'feat/two'));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /SELECT A DOCKET:/);
    assert.match(result.stdout, MARKER);
  });

  it('issues the one docket’s waybill with no marker, so a real waybill is never read as none', () => {
    const result = runBang('next', trunkWith('feat/one'));

    assert.equal(result.status, 0);
    assert.match(result.stdout, /^\*\*NEXT\*\* — paste each block/m);
    assert.doesNotMatch(result.stdout, /waybill: exited/);
  });

  it('folds `bay`’s rejection of an invalid branch name onto stdout', () => {
    const result = runBang('bay', trunkWith(), { args: 'bad..name' });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '', 'anything left on stderr is the harness’s to drop');
    assert.match(result.stdout, /is not a valid branch name/);
    assert.match(result.stdout, MARKER);
  });

  it('offers `bay`’s branch menu with no marker when no branch is given', () => {
    const result = runBang('bay', trunkWith(), { args: '' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /SELECT A BRANCH:|no branches besides/);
    assert.doesNotMatch(result.stdout, /waybill: exited/);
  });

  for (const command of ['status', 'new', 'bay']) {
    it(`folds \`${command}\`’s not-a-repository error onto stdout`, () => {
      const result = runBang(command, tempRoot());

      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.match(result.stdout, /not inside a git repository/);
      assert.match(result.stdout, MARKER);
    });
  }

  it('reports a clean trunk’s status with no marker', () => {
    const result = runBang('status', trunkWith());

    assert.equal(result.status, 0);
    assert.notEqual(result.stdout.trim(), '');
    assert.doesNotMatch(result.stdout, /waybill: exited/);
  });

  it('still names an unresolved plugin root rather than failing', () => {
    const result = runBang('next', trunkWith(), { root: path.join(tempRoot(), 'missing') });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /CLAUDE_PLUGIN_ROOT is unset/);
  });

  it('wraps every command that invokes the CLI, so a new one cannot ship without it', () => {
    const walk = (dir, prefix = '') =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) return walk(path.join(dir, entry.name), rel);
        return entry.name.endsWith('.md') ? [rel] : [];
      });
    const invoking = walk(COMMANDS)
      .filter((rel) => rawBang(rel)?.includes('src/cli.js'))
      .sort();

    // Pinned rather than `length > 0`, so an extraction that silently finds nothing cannot pass —
    // a sixth command that shells out to the CLI is added here alongside its wrapper.
    assert.deepEqual(invoking, ['bay.md', 'help.md', 'new.md', 'next.md', 'status.md']);
    // Every `node` call is wrapped, not just the first: `bay` has one per branch of its `if`.
    assert.deepEqual(
      invoking.filter((rel) => {
        const line = rawBang(rel);
        return line.match(/node "[^"]*src\/cli\.js"/g).length !== line.split(WRAPPER).length - 1;
      }),
      [],
    );
  });
});
