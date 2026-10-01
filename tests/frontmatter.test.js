import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter — accepted syntax', () => {
  it('parses flat key: value scalars and returns the body verbatim', () => {
    const { meta, body } = parseFrontmatter(
      ['---', 'leg: ideate', 'command: /ideation:ideation', 'model: opus', '---', 'Waybill text.', ''].join('\n'),
    );
    assert.deepEqual(meta, {
      leg: 'ideate',
      command: '/ideation:ideation',
      model: 'opus',
    });
    assert.equal(body, 'Waybill text.\n');
  });

  it('splits on the first colon only, so command values keep their own colons', () => {
    const { meta } = parseFrontmatter('---\ncommand: /ideation:ideation\n---\n');
    assert.equal(meta.command, '/ideation:ideation');
  });

  it('accepts an unquoted glob containing *', () => {
    const { meta } = parseFrontmatter('---\nstampPath: docs/ideation/*/contract-data.json\n---\n');
    assert.equal(meta.stampPath, 'docs/ideation/*/contract-data.json');
  });

  it('accepts a booking with zero keys', () => {
    const { meta, body } = parseFrontmatter('---\n---\nbody\n');
    assert.deepEqual(meta, {});
    assert.equal(body, 'body\n');
  });

  it('accepts a booking with one key and an empty body', () => {
    const { meta, body } = parseFrontmatter('---\nleg: specify\n---\n');
    assert.deepEqual(meta, { leg: 'specify' });
    assert.equal(body, '');
  });

  it('preserves a literal --- line inside the body', () => {
    const { meta, body } = parseFrontmatter('---\nleg: execute\n---\nintro\n\n---\n\noutro\n');
    assert.equal(meta.leg, 'execute');
    assert.equal(body, 'intro\n\n---\n\noutro\n');
  });

  it('returns the whole source as body when there is no frontmatter', () => {
    const source = 'no fences here\njust prose\n';
    const { meta, body } = parseFrontmatter(source);
    assert.deepEqual(meta, {});
    assert.equal(body, source);
  });

  it('trims values and blank frontmatter lines', () => {
    const { meta } = parseFrontmatter('---\n\nleg:   ideate   \n\nmodel: opus\n---\n');
    assert.deepEqual(meta, { leg: 'ideate', model: 'opus' });
  });

  it('keeps an empty value as an empty string', () => {
    const { meta } = parseFrontmatter('---\nhandover:\n---\n');
    assert.deepEqual(meta, { handover: '' });
  });

  it('strips quotes only when they wrap the entire value', () => {
    const { meta } = parseFrontmatter(
      ['---', 'a: "quoted value"', "b: 'single'", 'c: say "hi" now', 'd: "unbalanced', '---', ''].join('\n'),
    );
    assert.equal(meta.a, 'quoted value');
    assert.equal(meta.b, 'single');
    assert.equal(meta.c, 'say "hi" now');
    assert.equal(meta.d, '"unbalanced');
  });

  it('tolerates CRLF line endings', () => {
    const { meta, body } = parseFrontmatter('---\r\nleg: specify\r\n---\r\nwaybill\r\n');
    assert.deepEqual(meta, { leg: 'specify' });
    assert.equal(body, 'waybill\n');
  });

  it('does not coerce numbers or booleans', () => {
    const { meta } = parseFrontmatter('---\neffort: 3\nhandover: true\n---\n');
    assert.equal(meta.effort, '3');
    assert.equal(meta.handover, 'true');
  });
});

describe('parseFrontmatter — rejected syntax', () => {
  const rejects = (source, pattern) => {
    assert.throws(() => parseFrontmatter(source, '/tmp/x.md'), pattern);
  };

  it('rejects an unterminated fence, naming the path and line', () => {
    rejects('---\nleg: ideate\nbody with no closing fence\n', /\/tmp\/x\.md:1:.*closing/i);
  });

  it('rejects a list item', () => {
    rejects('---\nleg: ideate\n- one\n---\n', /\/tmp\/x\.md:3:.*list/i);
  });

  it('rejects a nested indent', () => {
    rejects('---\nleg: ideate\n  nested: value\n---\n', /\/tmp\/x\.md:3:.*(indent|nest)/i);
  });

  it('rejects a | block scalar', () => {
    rejects('---\nbody: |\n---\n', /\/tmp\/x\.md:2:.*block/i);
  });

  it('rejects a > block scalar', () => {
    rejects('---\nbody: >-\n---\n', /\/tmp\/x\.md:2:.*block/i);
  });

  it('rejects a duplicate key', () => {
    rejects('---\nleg: ideate\nleg: specify\n---\n', /\/tmp\/x\.md:3:.*duplicate/i);
  });

  it('rejects a line with no colon', () => {
    rejects('---\nleg\n---\n', /\/tmp\/x\.md:2:/);
  });

  it('rejects a key that is not a bare identifier', () => {
    rejects('---\n# comment: value\n---\n', /\/tmp\/x\.md:2:/);
  });

  it('names a default source label when no path is given', () => {
    assert.throws(() => parseFrontmatter('---\n- one\n---\n'), /<frontmatter>:2:/);
  });
});
