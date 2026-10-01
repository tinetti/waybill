import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOOKABLE_IDS } from '../src/legs.js';
import { paperPaths, checkIgnored } from '../src/inspection.js';
import { loadBookings } from '../src/bookings.js';
import { cleanupAll, createRepo, tempRoot, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

const BOOKINGS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bookings');

/**
 * The product spawns git with the developer's real environment, so a global `core.excludesFile` on
 * this machine would otherwise decide whether the "clean repo" fixture is clean.
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
 * @param {string|null} gitignore contents, or `null` for a repository with no `.gitignore` at all
 * @returns {string} repository root
 */
function repoIgnoring(gitignore) {
  const dir = createRepo({ commit: false });
  if (gitignore !== null) writeFile(path.join(dir, '.gitignore'), gitignore);
  return dir;
}

const check = (cwd, paths) => isolated(() => checkIgnored(cwd, paths));

describe('checkIgnored', () => {
  it('reports a paper directory the host repository ignores', () => {
    const result = check(repoIgnoring('/openspec/\n'), ['docs/ideation/', 'openspec/']);
    assert.deepEqual(result.ignored, ['openspec/']);
    assert.deepEqual(result.warnings, []);
  });

  it('stays silent in a clean repository — check-ignore exiting 1 is the success case', () => {
    const result = check(repoIgnoring('node_modules/\n'), ['docs/ideation/', 'openspec/']);
    assert.deepEqual(result.ignored, []);
    assert.deepEqual(result.warnings, []);
  });

  it('stays silent when the repository has no .gitignore at all', () => {
    const result = check(repoIgnoring(null), ['docs/ideation/', 'openspec/']);
    assert.deepEqual(result.ignored, []);
    assert.deepEqual(result.warnings, []);
  });

  it('reports every hit when several paper paths are ignored', () => {
    const result = check(repoIgnoring('/openspec/\n/docs/\n'), ['docs/ideation/', 'openspec/']);
    assert.deepEqual(result.ignored.sort(), ['docs/ideation/', 'openspec/']);
  });

  it('honours a negation, because git does', () => {
    const result = check(repoIgnoring('/openspec/\n!/openspec/\n'), ['openspec/']);
    assert.deepEqual(result.ignored, []);
  });

  it('matches a directory-only pattern against a directory that does not exist yet', () => {
    // The whole point of the inspection: the paper is one the workflow has not written. Git only
    // matches `/openspec/` against a nonexistent path when the query itself carries the slash, so
    // this asserts the trailing slash survives all the way to the subprocess.
    const dir = repoIgnoring('/openspec/\n');
    assert.equal(fs.existsSync(path.join(dir, 'openspec')), false);
    assert.deepEqual(check(dir, ['openspec/']).ignored, ['openspec/']);
  });

  it('matches a glob-free directory booking, because paperPaths gives it the slash it needs', () => {
    // A directory-only rule naming the paper directory itself matches a path that does not exist
    // yet only when the query says it is a directory, so a booking that happens to carry no glob
    // would otherwise slip past the very check this exists for.
    const dir = repoIgnoring('/plans/changes/\n');
    assert.deepEqual(check(dir, ['plans/changes']).ignored, [], 'git needs the slash');

    const bookings = new Map([['specify', { leg: 'specify', stampPath: 'plans/changes' }]]);
    const queries = paperPaths(bookings);
    assert.ok(queries.includes('plans/changes/'), `no directory query in ${queries.join(', ')}`);
    assert.deepEqual(check(dir, queries).ignored, ['plans/changes/']);
  });

  it('reports nothing and warns when git refuses to answer at all', () => {
    const result = check(tempRoot(), ['openspec/']);
    assert.deepEqual(result.ignored, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /check-ignore/);
  });

  it('never throws outside a repository', () => {
    assert.doesNotThrow(() => check(tempRoot(), ['openspec/']));
  });

  it('asks git nothing when there are no paths to ask about', () => {
    const result = check(repoIgnoring('/openspec/\n'), []);
    assert.deepEqual(result, { ignored: [], warnings: [] });
  });

  it('resolves paths against the cwd it is given, so it must be handed the repository root', () => {
    const dir = repoIgnoring('/openspec/\n');
    const sub = path.join(dir, 'src');
    fs.mkdirSync(sub, { recursive: true });
    assert.deepEqual(check(sub, ['openspec/']).ignored, []);
    assert.deepEqual(check(dir, ['openspec/']).ignored, ['openspec/']);
  });
});

describe('paperPaths', () => {
  const shipped = () => loadBookings(BOOKINGS, { knownLegs: BOOKABLE_IDS });

  it('de-globs the shipped bookings down to the two wrapper-owned directories', () => {
    assert.deepEqual(paperPaths(shipped()), ['docs/ideation/', 'openspec/']);
  });

  it('never hands a glob to git, because a glob would be reported back verbatim', () => {
    for (const query of paperPaths(shipped())) {
      assert.equal(/[*?]/.test(query), false, `${query} still contains a glob`);
    }
  });

  it('collapses a nested prefix into its ancestor rather than naming one rule twice', () => {
    const bookings = new Map([
      ['specify', { leg: 'specify', stampPath: 'openspec/changes/*/tasks.md' }],
      ['execute', { leg: 'execute', stampPath: 'openspec/changes/*/design.md' }],
    ]);
    assert.deepEqual(paperPaths(bookings), ['docs/ideation/', 'openspec/']);
  });

  it('keeps a directory the wrapper does not already cover', () => {
    const bookings = new Map([['specify', { leg: 'specify', stampPath: 'plans/*/tasks.md' }]]);
    assert.deepEqual(paperPaths(bookings), ['docs/ideation/', 'openspec/', 'plans/']);
  });

  it('ignores a booking that stamps by command only', () => {
    const bookings = new Map([['ideate', { leg: 'ideate', stampCmd: 'false' }]]);
    assert.deepEqual(paperPaths(bookings), ['docs/ideation/', 'openspec/']);
  });

  it('queries a glob-free file pattern without inventing a trailing slash', () => {
    const bookings = new Map([['specify', { leg: 'specify', stampPath: 'notes/PLAN.md' }]]);
    assert.deepEqual(paperPaths(bookings), ['docs/ideation/', 'notes/PLAN.md', 'openspec/']);
  });

  it('marks a glob-free directory pattern as a directory, since git will not guess', () => {
    const bookings = new Map([['specify', { leg: 'specify', stampPath: 'plans/changes' }]]);
    assert.deepEqual(paperPaths(bookings), ['docs/ideation/', 'openspec/', 'plans/changes/']);
  });
});
