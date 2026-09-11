import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LEGS } from '../src/legs.js';
import { renderSelect, renderWaybill } from '../src/waybill.js';
import { parseFrontmatter } from '../src/frontmatter.js';
import { loadBookings } from '../src/bookings.js';
import { cleanupAll, tempRoot, writeFile } from './helpers/repo-fixture.js';

after(cleanupAll);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = path.join(ROOT, 'commands');
const BOOKINGS = path.join(ROOT, 'bookings');

/**
 * The command set Waybill claims to ship.
 *
 * It lives here rather than in a `commands` key in `.claude-plugin/plugin.json` deliberately, and
 * the reason was measured against a scratch install rather than assumed: with no key, `commands/`
 * is discovered by convention and everything resolves, nested files included; with a file-path
 * array (`"commands": ["./commands/top.md", "./commands/sub/nested.md"]`) the nested command stops
 * resolving entirely, which would silently unregister all four `commands/spec/*.md`. Not one
 * plugin manifest installed on this machine declares the key. A list the loader never reads still
 * gives this suite the second opinion it needs: a renamed or deleted command file fails against it
 * either way. `spec-phase-5.md` records the deviation.
 */
const DECLARED = [
  'bay.md',
  'cleanup.md',
  'new.md',
  'next.md',
  'spec/apply.md',
  'spec/archive.md',
  'spec/explore.md',
  'spec/propose.md',
  'status.md',
];

/**
 * Every `*.md` under `dir`, as slash-joined relative paths. The walk recurses because
 * `commands/spec/` is namespaced — a flat `readdirSync` would report the four vendored routing
 * commands as missing while they sit right there.
 *
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]} sorted
 */
function shipped(dir, prefix = '') {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return shipped(path.join(dir, entry.name), rel);
      return entry.name.endsWith('.md') ? [rel] : [];
    })
    .sort();
}

/**
 * Why each of `files` is not a usable command file, if it is not.
 *
 * `description` is asserted rather than "it parses", because parsing is not a real check on its
 * own: a file with no frontmatter at all comes back as an empty map instead of throwing, so a
 * command whose fences were lost would pass a parse-only test and then install with no description.
 *
 * @param {string} dir
 * @param {string[]} files relative paths, as {@link shipped} returns them
 * @returns {string[]}
 */
function problems(dir, files) {
  const found = [];
  for (const rel of files) {
    const file = path.join(dir, ...rel.split('/'));
    let meta;
    try {
      ({ meta } = parseFrontmatter(fs.readFileSync(file, 'utf8'), rel));
    } catch (error) {
      // Already `<file>:<line>: <message>` — the parser names its own source.
      found.push(error.message);
      continue;
    }
    if (!meta.description) found.push(`${rel}: frontmatter names no description`);
  }
  return found;
}

/**
 * A throwaway copy of the shipped command tree, so the negative cases below break a real directory
 * rather than asserting against a hand-built one that never resembled the product.
 *
 * @returns {string} the copied `commands/` directory
 */
function scratch() {
  const dir = path.join(tempRoot(), 'commands');
  for (const rel of DECLARED) {
    const target = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(COMMANDS, ...rel.split('/')), target);
  }
  return dir;
}

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

describe('the shipped command set', () => {
  it('agrees with the declared set in both directions', () => {
    assert.deepEqual(shipped(COMMANDS), DECLARED);
  });

  it('gives every command file frontmatter with a description', () => {
    assert.deepEqual(problems(COMMANDS, DECLARED), []);
  });

  it('notices a declared command file that was renamed', () => {
    const dir = scratch();
    fs.renameSync(path.join(dir, 'status.md'), path.join(dir, 'position.md'));

    const found = shipped(dir);
    assert.equal(found.includes('status.md'), false);
    assert.notDeepEqual(found, DECLARED);
  });

  it('notices a command file shipped without being declared', () => {
    const dir = scratch();
    writeFile(path.join(dir, 'stray.md'), '---\ndescription: "stray"\n---\n');

    assert.notDeepEqual(shipped(dir), DECLARED);
  });

  it('rejects a command file that lost its frontmatter fences entirely', () => {
    const dir = scratch();
    writeFile(path.join(dir, 'status.md'), '# Waybill: status\n\nno frontmatter here\n');

    assert.deepEqual(problems(dir, DECLARED), ['status.md: frontmatter names no description']);
  });

  it('rejects a command file whose frontmatter does not parse', () => {
    const dir = scratch();
    writeFile(
      path.join(dir, 'status.md'),
      '---\ndescription: "one"\ndescription: "two"\n---\nbody\n',
    );

    assert.deepEqual(problems(dir, DECLARED), ['status.md:3: duplicate key `description`']);
  });

  it('spells the plugin root the one way Claude Code actually substitutes', () => {
    // `${CLAUDE_PLUGIN_ROOT}` is not an environment variable and never reaches bash as one.
    // Claude Code rewrites the literal out of the command body first, matching `${CLAUDE_PLUGIN_ROOT}`
    // or a bare `$CLAUDE_PLUGIN_ROOT` and nothing else. So a defensive `${CLAUDE_PLUGIN_ROOT:-}` is
    // the one spelling guaranteed to fail: the rewrite skips it for want of an exact match, bash
    // finds no such variable, expands it to nothing, and the test collapses to `[ -f /src/cli.js ]`.
    // Every command then reports an unset root on a plugin that is installed and working.
    //
    // The sweep covers every line that is *not* inside an HTML comment, rather than only the
    // lines beginning `` !` ``: the rewrite is over the whole command body, so a root named in a
    // Task section — `next.md` names one, in the command it tells the session to re-run — is
    // substituted on exactly the same terms and breaks on exactly the same misspelling. HTML
    // comments are the one exclusion, because they are where the broken spelling is deliberately
    // written out and explained; a sweep that flagged those would delete its own documentation.
    const offenders = [];
    for (const rel of DECLARED) {
      const source = fs.readFileSync(path.join(COMMANDS, ...rel.split('/')), 'utf8');
      let inComment = false;
      source.split('\n').forEach((line, i) => {
        if (line.includes('<!--')) inComment = true;
        const commented = inComment;
        if (line.includes('-->')) inComment = false;
        if (commented) return;
        for (const [found] of line.matchAll(/\$\{CLAUDE_PLUGIN_ROOT[^}]*\}/g)) {
          if (found !== '${CLAUDE_PLUGIN_ROOT}') offenders.push(`${rel}:${i + 1}: ${found}`);
        }
      });
    }
    assert.deepEqual(offenders, []);
  });

  it('keeps the vendored routing commands byte-identical to what they encode', () => {
    // The whole point of vendoring is that the `model:`/`effort:` frontmatter *is* the routing.
    // A copy that quietly lost it would still parse and still install.
    const routing = {
      'spec/apply.md': { model: 'inherit', effort: undefined },
      'spec/archive.md': { model: 'sonnet', effort: 'low' },
      'spec/explore.md': { model: 'opus', effort: 'high' },
      'spec/propose.md': { model: 'opus', effort: 'high' },
    };
    for (const [rel, expected] of Object.entries(routing)) {
      const source = fs.readFileSync(path.join(COMMANDS, ...rel.split('/')), 'utf8');
      const { meta } = parseFrontmatter(source, rel);
      assert.equal(meta.model, expected.model, rel);
      assert.equal(meta.effort, expected.effort, rel);
      assert.match(source, /\$ARGUMENTS/, `${rel} lost its argument line`);
    }
  });

  it('runs `new` at the model and effort the ideate booking names, and nothing else at any', () => {
    // `new` is the one command whose waybill is for *this* session, and a session cannot switch its
    // own model — so it declares one, and the value has to be the booking's. Asserted against the
    // booking's parsed frontmatter rather than against `opus`/`high`: rebook ideate to sonnet and
    // this reports that the command disagrees, which is the failure worth having. A literal would
    // simply be a second place to state the same routing, free to drift from the first.
    const meta = (dir, rel) =>
      parseFrontmatter(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'), rel).meta;

    const booking = meta(BOOKINGS, 'ideation-ideate.md');
    assert.ok(booking.model, 'the ideate booking names no model, so the pin below asserts nothing');
    assert.equal(meta(COMMANDS, 'new.md').model, booking.model);
    assert.equal(meta(COMMANDS, 'new.md').effort, booking.effort);

    // The inversion is half the requirement: every other command's waybill is for the *next*
    // session, so declaring a model there would silently override the booking's own choice.
    for (const rel of DECLARED.filter((name) => name !== 'new.md' && !name.startsWith('spec/'))) {
      assert.equal(meta(COMMANDS, rel).model, undefined, `${rel} declares a model`);
      assert.equal(meta(COMMANDS, rel).effort, undefined, `${rel} declares an effort`);
    }
  });

  it('keys `next`\'s one exception to the verbatim rule on the heading the renderer emits', () => {
    // Two files now state the same routing, and `renderSelect`'s own doc comment records why that
    // is dangerous: reword the heading and the selection prompt silently turns off, with no error
    // anywhere. So the command file is asserted against the literal the renderer *actually*
    // produces rather than against a second hand-typed copy of it — a copy is simply a second
    // place to state one fact, free to drift from the first.
    //
    // An empty fleet is not a state `renderSelect` is ever called in; it is the cheapest way to
    // get the heading out of it with no synthetic `Inference` to build, because `docketBlock`
    // renders the heading alone when there are no dockets to list under it.
    const heading = renderSelect('main', [])
      .split('\n')
      .find((line) => line.endsWith(':'));
    assert.ok(heading, 'renderSelect emits no heading line for the command file to key on');

    const source = fs.readFileSync(path.join(COMMANDS, 'next.md'), 'utf8');
    assert.ok(source.includes(heading), `commands/next.md does not branch on \`${heading}\``);

    // The rule the exception is carved out of is the other half of the requirement. A file that
    // grew the branch but lost `verbatim` would satisfy the check above while paraphrasing every
    // ordinary waybill — which is the failure the single unconditional rule exists to prevent.
    assert.match(source, /\*\*verbatim\*\*/, 'commands/next.md no longer states the verbatim rule');
  });

  it('declares AskUserQuestion on `next`\'s allowed-tools line, since the list is restrictive', () => {
    // `allowed-tools` is an allowlist, not a hint: a tool left off it is unavailable, and the
    // silence is total — the prompt simply never happens and the session carries on as though
    // asking had not been part of the instruction. Asserted through the parser rather than by
    // grepping the file, because the parser only ever reads the frontmatter block, so this cannot
    // be satisfied by the tool name appearing in the prose that explains it.
    const { meta } = parseFrontmatter(
      fs.readFileSync(path.join(COMMANDS, 'next.md'), 'utf8'),
      'next.md',
    );
    assert.match(meta['allowed-tools'] ?? '', /\bAskUserQuestion\b/);
  });

  it('asks the CLI for markdown in `next` and `bay`, the re-run after selection included', () => {
    // The fences have to come from the tool, where a golden pins them, rather than from a session
    // reformatting plain text — so both waybill-showing commands must request them.
    const source = (rel) => fs.readFileSync(path.join(COMMANDS, rel), 'utf8');
    assert.ok(source('next.md').includes('cli.js" next --markdown'));
    assert.ok(source('next.md').includes('next --markdown <branch>'));
    assert.ok(source('bay.md').includes('cli.js" bay --markdown'));
    assert.equal(source('new.md').includes('--markdown'), false, '`new` rejects the option');
  });

  it('tells `new` to run only the last command line, and never /clear, /model or /effort', () => {
    // Read literally against the command list, a session could run `/clear` — erasing its own
    // instruction — or `/model`, which changes the operator's default for every later session.
    const source = fs.readFileSync(path.join(COMMANDS, 'new.md'), 'utf8');
    assert.match(source, /only the last/);
    for (const command of ['/clear', '/model', '/effort']) {
      assert.ok(source.includes(`\`${command}\``), `new.md does not name ${command}`);
    }
  });

  it('points no command file at the removed "then run:" handover line', () => {
    for (const rel of ['new.md', 'next.md', 'bay.md']) {
      const source = fs.readFileSync(path.join(COMMANDS, rel), 'utf8');
      assert.equal(/then run:/.test(source), false, rel);
    }
  });
});

describe('the plugin manifest', () => {
  it('is valid JSON naming the plugin', () => {
    const plugin = readJson('.claude-plugin/plugin.json');
    assert.equal(plugin.name, 'waybill');
    assert.ok(plugin.description, 'plugin.json has no description');
    assert.ok(Array.isArray(plugin.keywords) && plugin.keywords.length > 0);
  });

  it('carries the same name and version as package.json, so an install cannot report two', () => {
    const plugin = readJson('.claude-plugin/plugin.json');
    const pkg = readJson('package.json');
    assert.equal(plugin.name, pkg.name);
    assert.equal(plugin.version, pkg.version);
  });

  it('declares no `commands` key — the loader discovers commands/ by convention', () => {
    assert.equal(readJson('.claude-plugin/plugin.json').commands, undefined);
  });
});

/**
 * The shipped bookings, copied to a throwaway directory so a swap can be applied to them without
 * touching the developer's checkout.
 *
 * @returns {string} the copied `bookings/` directory
 */
function scratchBookings() {
  const dir = path.join(tempRoot(), 'bookings');
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(BOOKINGS).filter((name) => name.endsWith('.md'))) {
    fs.copyFileSync(path.join(BOOKINGS, entry), path.join(dir, entry));
  }
  return dir;
}

describe('the worked alternative binding in examples/', () => {
  // Nothing under `examples/` is on any load path — `loadBookings` only ever reads `bookings/` —
  // so a typo in `leg`, `argument`, or the stamp would surface for the first time on the
  // operator who followed the README and overwrote their working booking with it.
  it('loads as a drop-in replacement for the execute booking', () => {
    const dir = scratchBookings();
    fs.copyFileSync(
      path.join(ROOT, 'examples', 'superpowers-execute.md'),
      path.join(dir, 'openspec-execute.md'),
    );

    const bookings = loadBookings(dir, { knownLegs: LEGS.map((leg) => leg.id) });
    const booking = bookings.get('execute');
    assert.ok(booking, 'the swapped booking does not bind the execute leg');
    assert.equal(booking.command, 'superpowers:subagent-driven-development');
    assert.equal(bookings.size, fs.readdirSync(dir).length, 'the swap left a leg unbound');
  });

  it('renders a waybill naming the skill with no argument appended', () => {
    const dir = scratchBookings();
    fs.copyFileSync(
      path.join(ROOT, 'examples', 'superpowers-execute.md'),
      path.join(dir, 'openspec-execute.md'),
    );
    const booking = loadBookings(dir, { knownLegs: LEGS.map((leg) => leg.id) }).get('execute');

    // `changeId` is deliberately non-null: `argument: none` is the only thing keeping it off the
    // end of a skill name that takes no argument.
    const waybill = renderWaybill({
      leg: 'execute',
      index: 6,
      completed: ['ideate', 'bay', 'refine', 'contract', 'specs'],
      skipped: [],
      booking,
      branch: 'feat/thing',
      changeId: 'add-thing',
      warnings: [],
    });

    assert.match(waybill, /^superpowers:subagent-driven-development$/m);
    assert.equal(waybill.includes('subagent-driven-development add-thing'), false);
  });
});

describe('criterion 7: zero dependencies and no build step', () => {
  const pkg = readJson('package.json');

  it('declares no dependencies of any kind', () => {
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
    assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), []);
  });

  it('declares no build script', () => {
    assert.equal((pkg.scripts ?? {}).build, undefined);
  });

  it('points both bin names at one executable shim that exists', () => {
    assert.equal(pkg.bin.waybill, 'bin/waybill');
    assert.equal(pkg.bin.wyb, 'bin/waybill');
    const shim = path.join(ROOT, pkg.bin.waybill);
    assert.equal(fs.existsSync(shim), true);
    assert.notEqual(fs.statSync(shim).mode & 0o111, 0, 'bin/waybill is not executable');
  });

  it('keeps argument parsing out of the shim, so it cannot drift from the CLI', () => {
    const shim = fs.readFileSync(path.join(ROOT, 'bin', 'waybill'), 'utf8');
    assert.match(shim, /^#!\/usr\/bin\/env node$/m);
    assert.match(shim, /run\(process\.argv\.slice\(2\)\)/);
  });

  it('actually runs: `waybill --help` exits 0 and prints the usage banner', () => {
    // Reading the shim's text cannot catch a broken import path or a throw on load — the file
    // would still contain both lines above and still be dead on arrival for anyone who ran it.
    const result = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'waybill'), '--help'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: waybill <command> \[options\]$/m);
    assert.match(result.stdout, /^ {2}status +Where this docket stands, without the waybill$/m);
  });
});
