import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILTIN_BOOKINGS, OPTIONAL, REQUIRED, loadBookings } from '../src/bookings.js';
import { run } from '../src/cli.js';
import { renderHelp } from '../src/help.js';
import { LEGS } from '../src/legs.js';
import { cleanupAll, tempRoot, withEnv } from './helpers/repo-fixture.js';

after(cleanupAll);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const GOLDEN = path.join(ROOT, 'tests', 'golden');
/** @param {string} name @returns {string} */
const read = (name) => fs.readFileSync(path.join(GUIDE, name), 'utf8');
const EXTRA_TERMS = ['handover', 'handler', 'route', 'fleet', 'overlay', 'papers', 'freight forwarder'];

/**
 * The page reads bookings through the operator's environment, so an overlay configured on this
 * machine would otherwise change the WORDS block the glossary is checked against.
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

/**
 * Fenced blocks, opened by /^```(\S*)$/ and closed by /^```$/, both at column 0. A fence left
 * open at the end of the file fails, so a missing close cannot swallow the rest of a chapter.
 *
 * @param {string} md
 * @returns {{info:string, body:string}[]}
 */
function fences(md) {
  /** @type {{info:string, body:string}[]} */
  const found = [];
  /** @type {{info:string, lines:string[]} | null} */
  let open = null;
  for (const line of md.split('\n')) {
    if (open === null) {
      const start = /^```(\S*)$/.exec(line);
      if (start) open = { info: start[1], lines: [] };
    } else if (line === '```') {
      found.push({ info: open.info, body: open.lines.map((text) => `${text}\n`).join('') });
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  assert.equal(open, null, `a \`\`\`${open?.info} fence is never closed`);
  return found;
}

/**
 * The slash-command names in one directory: every `*.md` file, without its extension.
 *
 * @param {string} dir
 * @returns {string[]}
 */
const commandNames = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -'.md'.length));

/** @param {string} id @returns {string} */
const golden = (id) => fs.readFileSync(path.join(GOLDEN, `${id}.txt`), 'utf8');

describe('guide', () => {
  it('rides every leg in order', () => {
    const headings = [...read('01-ride-along.md').matchAll(/^## Leg (\d) · ([a-z]+)\b/gm)];
    assert.deepEqual(
      headings.map((match) => match[2]),
      LEGS.map((leg) => leg.id),
    );
    headings.forEach((match, i) => {
      assert.equal(Number(match[1]), i + 1, `\`${match[2]}\` is numbered ${match[1]}, not ${i + 1}`);
    });
  });

  it('samples match their goldens', () => {
    const blocks = fences(read('01-ride-along.md'));
    const goldens = new Map(LEGS.map((leg) => [leg.id, golden(leg.id)]));
    const matched = new Set();
    const samples = blocks.filter((block) => block.info === 'waybill');
    for (const { body } of samples) {
      const id = [...goldens].find(([, text]) => text === body)?.[0];
      assert.ok(id, `a waybill sample matches no leg golden:\n${body}`);
      matched.add(id);
    }
    for (const leg of LEGS) assert.ok(matched.has(leg.id), `no waybill sample for \`${leg.id}\``);
    assert.ok(samples.length >= 7, `${samples.length} waybill samples`);

    const firstLines = [...goldens.values()].map((text) => text.split('\n')[0]);
    for (const { info, body } of blocks.filter((block) => block.info !== 'waybill')) {
      for (const first of firstLines) {
        assert.equal(body.includes(first), false, `a \`\`\`${info} fence holds a waybill: ${first}`);
      }
    }
  });

  it('defines every help-card word', () => {
    const words = section(isolated(() => renderHelp(tempRoot())), 'WORDS', 'COMMANDS')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim().split(/\s+/)[0]);
    assert.ok(words.length > 0, 'the WORDS block names no terms');
    const headings = new Set(read('02-glossary.md').split('\n').filter((line) => line.startsWith('### ')));
    for (const term of [...words, ...EXTRA_TERMS]) {
      assert.ok(headings.has(`### ${term}`), `the glossary has no \`### ${term}\` heading`);
    }
  });

  it('every term is translated', () => {
    const lines = read('02-glossary.md').split('\n');
    const starts = lines.flatMap((line, i) => (line.startsWith('### ') ? [i] : []));
    assert.ok(starts.length >= 15, `${starts.length} glossary headings`);
    starts.forEach((start, n) => {
      const entry = lines.slice(start + 1, starts[n + 1] ?? lines.length);
      assert.ok(
        entry.some((line) => line.startsWith('**Literally:**')),
        `\`${lines[start]}\` has no **Literally:** line`,
      );
    });
  });

  it('references the whole surface', () => {
    const reference = read('03-reference.md');
    const commands = path.join(ROOT, 'commands');
    const top = commandNames(commands);
    const spec = commandNames(path.join(commands, 'spec'));
    assert.ok(top.length > 0 && spec.length > 0, 'no command files found');
    for (const name of top) assert.ok(reference.includes(`/waybill:${name}`), `no \`/waybill:${name}\``);
    for (const name of spec) assert.ok(reference.includes(`spec:${name}`), `no \`spec:${name}\``);

    const flags = [...usage().options.matchAll(/--[a-z][a-z-]*/g)].map((match) => match[0]);
    assert.ok(flags.length > 0, 'the Options block names no flags');
    for (const flag of flags) assert.ok(reference.includes(flag), `no \`${flag}\``);

    for (const key of [...REQUIRED, ...OPTIONAL]) {
      assert.ok(reference.includes(`\`${key}\``), `no \`${key}\` code span`);
    }

    for (const literal of ['WAYBILL_BOOKINGS_DIR', 'waybill.bookingsdir', 'WAYBILL_BAY_DIR', 'waybill.baydir']) {
      assert.ok(reference.includes(literal), `no \`${literal}\``);
    }
  });

  it("lists every carrier's prerequisites", () => {
    const namespaces = new Set(
      [...loadBookings(BUILTIN_BOOKINGS).values()].map((booking) => booking.command.slice(1).split(':')[0]),
    );
    assert.ok(namespaces.size > 0, 'the built-in bookings name no carriers');
    const expected = [...namespaces];
    if (namespaces.has('spec')) expected.push('openspec');
    const rest = section(read('03-reference.md'), '## Prerequisites');
    const next = rest.indexOf('\n## ');
    const prerequisites = next === -1 ? rest : rest.slice(0, next);
    for (const name of expected) {
      assert.ok(prerequisites.includes(name), `## Prerequisites does not name \`${name}\``);
    }
  });

  it('links resolve', () => {
    const files = fs.readdirSync(GUIDE).filter((name) => name.endsWith('.md'));
    let total = 0;
    for (const file of files) {
      for (const [, target] of read(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
        total += 1;
        const resolved = path.resolve(GUIDE, target.split('#')[0]);
        assert.ok(fs.existsSync(resolved), `${file}: \`${target}\` does not resolve`);
      }
    }
    assert.ok(total >= 3, `${total} relative links`);

    const index = read('README.md');
    for (const chapter of ['01-ride-along.md', '02-glossary.md', '03-reference.md']) {
      assert.ok(index.includes(`](${chapter})`) || index.includes(`](./${chapter})`), `README.md does not link ${chapter}`);
    }
  });
});
