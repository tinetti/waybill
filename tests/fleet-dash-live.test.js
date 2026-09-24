import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';

import { diffFrames, enterLive, exitLive, withRawStdin } from '../src/paint.js';
import { runLive } from '../src/live.js';
import { run } from '../src/cli.js';
import { cleanupAll, tempRoot } from './helpers/repo-fixture.js';

after(cleanupAll);

/** The injected clock. Every age in this suite is stated as a distance back from it. */
const NOW = 1_780_000_000;

const HOUR = 3600;
const DAY = 24 * HOUR;

const HIDE = '\u001b[?25l';
const SHOW = '\u001b[?25h';
const ERASE = '\u001b[2K';

/**
 * Flush the microtask queue and the `setImmediate` queue a few times over.
 *
 * `pendingProgress` (`src/inference.js:66`) schedules its lookup with `setImmediate`, and the slow
 * lane then paints in a `.then` after it, so a single turn is not enough to see the whole chain.
 *
 * @returns {Promise<void>}
 */
async function settle() {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/**
 * A manual clock standing in for `setInterval`.
 *
 * The live loop takes its scheduler as a parameter precisely so a test never sleeps: `advance`
 * fires whatever would have fired in that many milliseconds, in one synchronous burst, and then
 * lets the promise queue drain.
 *
 * @returns {{schedule:(fn:()=>void, ms:number)=>()=>void, advance:(ms:number)=>Promise<void>,
 *            live:()=>number}}
 */
function manualClock() {
  /** @type {{fn:()=>void, ms:number, left:number}[]} */
  const timers = [];
  return {
    schedule(fn, ms) {
      const timer = { fn, ms, left: ms };
      timers.push(timer);
      return () => {
        const at = timers.indexOf(timer);
        if (at !== -1) timers.splice(at, 1);
      };
    },
    async advance(ms) {
      for (const timer of [...timers]) {
        timer.left -= ms;
        while (timer.left <= 0) {
          timer.left += timer.ms;
          timer.fn();
        }
      }
      await settle();
    },
    live: () => timers.length,
  };
}

/**
 * A stdin that answers `setRawMode`, so a test can watch the terminal being taken and given back.
 *
 * @returns {{stream:PassThrough & {setRawMode:(value:boolean)=>void}, modes:boolean[]}}
 */
function fakeStdin() {
  const stream = /** @type {PassThrough & {setRawMode:(value:boolean)=>void, isTTY:boolean}} */ (
    new PassThrough()
  );
  /** @type {boolean[]} */
  const modes = [];
  stream.isTTY = true;
  stream.setRawMode = (value) => {
    modes.push(value);
  };
  return { stream, modes };
}

/**
 * One docket, shaped exactly as `src/scan.js` hands it over with `deferProgress` on.
 *
 * @param {string} branch
 * @param {{index?:number,
 *          pending?:(() => Promise<{done:number,total:number,source:string,changeId:string|null}|null>)|null}} [fields]
 * @returns {import('../src/fleet.js').Docket}
 */
function docket(branch, fields = {}) {
  const { index = 5, pending = null } = fields;
  return {
    branch,
    path: `/bays/${branch.replace(/\//g, '-')}`,
    state: {
      leg: 'execute',
      index,
      completed: [],
      skipped: [],
      // Exactly what a `deferProgress` scan hands over: no count, and a thunk that will fetch one.
      progress: null,
      progressPending: pending,
      branch,
      docketOpen: true,
      changeId: null,
      warnings: [],
    },
    openedAt: NOW - 4 * DAY,
    idleAt: NOW - 6 * HOUR,
    stackedOn: null,
    pane: null,
    activity: null,
  };
}

/**
 * One repository's worth of fleet. Both environment columns are off, so a frame here is the same
 * width on a machine with tmux running as on one without.
 *
 * @param {import('../src/fleet.js').Docket[]} dockets
 * @returns {import('../src/scan.js').FleetModel}
 */
function model(dockets) {
  return {
    root: '/projects',
    inRepo: true,
    scanned: 1,
    repos: [{ root: '/projects/repo', name: 'repo', trunk: 'main', bookings: new Map(), dockets, warnings: [] }],
    tmuxAvailable: false,
    psAvailable: false,
  };
}

/**
 * Drive {@link runLive} with everything outside the process replaced.
 *
 * `scans` is a list of thunks, one per scan the loop performs; the last one is reused once the list
 * runs out, so a test that only cares about the first two frames says only those two. Each thunk
 * must build a *fresh* model — the loop fills slow-lane values into the object it was handed.
 *
 * @param {{scans:(() => import('../src/scan.js').FleetModel)[], stdin?:NodeJS.ReadStream}} options
 * @returns {{code:Promise<number>, writes:string[], errors:string[], clock:ReturnType<typeof manualClock>,
 *            scans:()=>number, frame:()=>string}}
 */
function live(options) {
  const { scans, stdin = new PassThrough() } = options;
  /** @type {string[]} */
  const writes = [];
  /** @type {string[]} */
  const errors = [];
  const clock = manualClock();
  let calls = 0;

  const scan = () => {
    calls += 1;
    return scans[Math.min(calls, scans.length) - 1]();
  };

  const code = runLive(
    '/projects',
    { scan, schedule: clock.schedule, fastMs: 2000, slowMs: 10_000 },
    {
      out: (text) => writes.push(text),
      err: (text) => errors.push(text),
      now: () => NOW,
      isTTY: true,
      stdin,
      signals: () => ({ tmux: null, history: [] }),
    },
  );

  return { code, writes, errors, clock, scans: () => calls, frame: () => replay(writes) };
}

/**
 * A terminal, in about thirty lines, so the diff can be checked by its *effect* rather than by the
 * bytes it happens to emit.
 *
 * Models only what this phase is allowed to emit: cursor-up, erase-line, carriage return, linefeed,
 * and cursor visibility. Linefeed moves down without returning to column 0, which is what a terminal
 * in raw mode does and the reason every write here is preceded by `\r`.
 *
 * @param {string[]} chunks everything written to the surface, in order
 * @returns {string} the visible screen, with the trailing blank rows kept so an orphaned line shows
 */
function replay(chunks) {
  /** @type {string[]} */
  const screen = [];
  let row = 0;
  let column = 0;
  const text = chunks.join('');

  const at = (index) => {
    while (screen.length <= index) screen.push('');
    return index;
  };
  const put = (value) => {
    const line = screen[at(row)].padEnd(column, ' ');
    screen[row] = line.slice(0, column) + value + line.slice(column + value.length);
    column += value.length;
  };

  for (let i = 0; i < text.length; ) {
    if (text[i] === '\u001b') {
      const escape = /^\u001b\[(\?25[lh]|2K|\d+A)/.exec(text.slice(i));
      assert.ok(escape, `unsupported escape at ${i}: ${JSON.stringify(text.slice(i, i + 8))}`);
      const body = escape[1];
      if (body === '2K') screen[at(row)] = '';
      else if (body.endsWith('A')) row = Math.max(0, row - Number(body.slice(0, -1)));
      i += escape[0].length;
      continue;
    }
    if (text[i] === '\r') {
      column = 0;
      i += 1;
      continue;
    }
    if (text[i] === '\n') {
      // A linefeed on stdout still returns to column 0: `setRawMode` is a stdin setting, so the
      // terminal's own LF-to-CRLF output translation is untouched by live mode.
      row += 1;
      column = 0;
      at(row);
      i += 1;
      continue;
    }
    const next = text.slice(i).search(/[\u001b\r\n]/);
    const chunk = next === -1 ? text.slice(i) : text.slice(i, i + next);
    put(chunk);
    i += chunk.length;
  }

  return screen.join('\n');
}

describe('diffFrames', () => {
  const three = 'alpha\nbravo\ncharlie\n';

  it('emits nothing at all for two identical frames', () => {
    assert.equal(diffFrames(three, three), '');
  });

  it('rewrites one changed line in the middle, leaving the rest alone', () => {
    const next = 'alpha\nBRAVO\ncharlie\n';
    const patch = diffFrames(three, next);

    assert.match(patch, /\u001b\[2A/, 'the cursor must climb to the changed line');
    assert.equal(patch.includes('alpha'), false, 'an unchanged line must not be rewritten');
    assert.equal(replay([three, patch]), next);
  });

  it('rewrites the last line without touching the two above it', () => {
    const next = 'alpha\nbravo\nCHARLIE\n';
    const patch = diffFrames(three, next);

    assert.equal(patch.includes('bravo'), false);
    assert.equal(replay([three, patch]), next);
  });

  it('paints the tail when the new frame is longer', () => {
    const next = 'alpha\nbravo\nCHARLIE\ndelta\necho\n';

    assert.equal(replay([three, diffFrames(three, next)]), next);
  });

  it('erases the orphaned tail when the new frame is shorter', () => {
    const next = 'alpha\nBRAVO\n';
    const patch = diffFrames(three, next);

    // The bytes matter here as well as the effect: without the erase the screen keeps `charlie`
    // below a frame that no longer has a third line.
    assert.equal(patch.split(ERASE).length - 1 >= 2, true, patch);
    assert.equal(replay([three, patch]), `${next}\n`, 'the orphaned row must be blank');
  });

  it('leaves the cursor below the new frame, so the next diff lands where it expects', () => {
    const second = 'alpha\nBRAVO\n';
    const third = 'ALPHA\nbravo\ncharlie\n';

    const patches = [three, diffFrames(three, second), diffFrames(second, third)];
    assert.equal(replay(patches), third);
  });

  it('never clears the screen and never reaches for the alternate buffer', () => {
    for (const [before, after] of [
      [three, 'alpha\nBRAVO\ncharlie\n'],
      [three, 'alpha\n'],
      [three, 'alpha\nbravo\ncharlie\ndelta\n'],
    ]) {
      const patch = diffFrames(before, after);
      assert.equal(patch.includes('\u001b[2J'), false, patch);
      assert.equal(patch.includes('\u001b[?1049'), false, patch);
      assert.equal(patch.includes('\u001b[H'), false, patch);
    }
  });
});

describe('enterLive / exitLive', () => {
  it('hides the cursor on the way in and shows it again on the way out', () => {
    /** @type {string[]} */
    const writes = [];
    const surface = { write: (text) => writes.push(text) };

    enterLive(surface);
    exitLive(surface);

    assert.equal(writes[0], HIDE);
    assert.match(writes[1], /\u001b\[\?25h/);
    assert.equal(writes.join('').includes('\u001b[?1049'), false);
  });
});

describe('withRawStdin', () => {
  it('takes raw mode and gives it back, exactly once however often restore is called', () => {
    const { stream, modes } = fakeStdin();
    const restore = withRawStdin(stream, () => {}, () => {});

    assert.deepEqual(modes, [true]);
    restore();
    restore();
    assert.deepEqual(modes, [true, false]);
  });

  it('still reads keys when setRawMode is unavailable, rather than giving up on input', async () => {
    const stdin = new PassThrough();
    /** @type {string[]} */
    const keys = [];
    const restore = withRawStdin(stdin, (key) => keys.push(key), () => {});

    stdin.write('qr');
    await settle();
    restore();

    assert.deepEqual(keys, ['q', 'r']);
  });

  it('restores before handing a signal on, so the terminal is cooked by the time anyone reacts', () => {
    const { stream, modes } = fakeStdin();
    /** @type {boolean[]} */
    const cookedAtExit = [];
    const restore = withRawStdin(stream, () => {}, () => cookedAtExit.push(modes.includes(false)));

    process.emit('SIGTERM');
    restore();

    assert.deepEqual(cookedAtExit, [true]);
    assert.deepEqual(modes, [true, false]);
  });
});

describe('runLive', () => {
  it('paints once immediately, then once per fast tick', async () => {
    const session = live({ scans: [() => model([docket('feat/one')])] });
    await settle();

    assert.equal(session.scans(), 1, 'the first frame is painted before any tick');
    assert.match(session.writes.join(''), /feat\/one/);

    await session.clock.advance(2000);
    await session.clock.advance(2000);
    assert.equal(session.scans(), 3);

    await finish(session);
  });

  it('writes nothing on a tick whose frame is identical, so an idle fleet does not flicker', async () => {
    const session = live({ scans: [() => model([docket('feat/one')])] });
    await settle();
    const first = session.writes.length;

    await session.clock.advance(2000);

    assert.equal(session.writes.length, first, session.writes.slice(first).join(''));
    await finish(session);
  });

  it('repaints only the row that moved when one docket changes leg', async () => {
    let leg = 5;
    const session = live({ scans: [() => model([docket('feat/one', { index: leg }), docket('feat/two')])] });
    await settle();
    const before = session.frame();

    leg = 6;
    await session.clock.advance(2000);

    const patch = session.writes.slice(-1).join('');
    assert.equal(patch.includes('feat/two'), false, 'the untouched row was rewritten');
    assert.notEqual(session.frame(), before);
    assert.match(session.frame(), /6\/7/);
    await finish(session);
  });

  it('paints whole-leg bars first, then fills them in when the slow lane lands', async () => {
    const progress = { done: 4, total: 9, source: 'tasks-md', changeId: 'add-thing' };
    const session = live({
      scans: [() => model([docket('feat/one', { pending: async () => progress })])],
    });

    const first = session.frame();
    await settle();
    const filled = session.frame();

    assert.match(first, /█{7}░{4}/, first);
    assert.notEqual(filled, first, 'the slow lane never landed');
    assert.match(filled, /█{6}░{5}/, filled);
    await finish(session);
  });

  it('keeps the filled bar across the next fast tick, which knows nothing about task counts', async () => {
    const progress = { done: 4, total: 9, source: 'tasks-md', changeId: 'add-thing' };
    const session = live({
      scans: [() => model([docket('feat/one', { pending: async () => progress })])],
    });
    await settle();

    await session.clock.advance(2000);

    assert.match(session.frame(), /█{6}░{5}/, session.frame());
    await finish(session);
  });

  it('leaves a populated column alone when the slow lane rejects', async () => {
    const progress = { done: 4, total: 9, source: 'tasks-md', changeId: 'add-thing' };
    let attempt = 0;
    const pending = async () => {
      attempt += 1;
      if (attempt === 1) return progress;
      throw new Error('openspec went away');
    };
    const session = live({ scans: [() => model([docket('feat/one', { pending })])] });
    await settle();
    const filled = session.frame();

    await session.clock.advance(10_000);
    // And on through the next fast tick, which rebuilds the model from a scan that knows no task
    // counts at all — the point where a slow lane that had forgotten its last answer would show.
    await session.clock.advance(2000);

    assert.equal(attempt, 2, 'the slow lane did not run a second time');
    assert.equal(session.frame(), filled, 'a failed refresh blanked a column it had already filled');
    assert.match(session.frame(), /█{6}░{5}/, session.frame());
    await finish(session);
  });

  it('skips a tick that fires while a refresh is still in flight', async () => {
    const session = live({
      scans: [() => model([docket('feat/one', { pending: () => new Promise(() => {}) })])],
    });
    await settle();
    const scans = session.scans();

    // The slow lane from the first paint never settles, so every tick below must be dropped rather
    // than queued — otherwise a scan slower than the tick piles subprocesses up without bound.
    await session.clock.advance(2000);
    await session.clock.advance(2000);

    assert.equal(session.scans(), scans);
    await finish(session);
  });

  it('gives up when the very first scan throws, rather than holding a blank screen', async () => {
    const session = live({
      scans: [
        () => {
          throw new Error('nothing to scan');
        },
      ],
    });

    assert.equal(await session.code, 1);
    assert.match(session.errors.join(''), /nothing to scan/);
  });

  it('keeps the last good frame when a scan throws, rather than taking the terminal down', async () => {
    let calls = 0;
    const session = live({
      scans: [
        () => model([docket('feat/one')]),
        () => {
          calls += 1;
          throw new Error('the repository went away');
        },
      ],
    });
    await settle();
    const before = session.frame();

    await session.clock.advance(2000);

    assert.equal(calls, 1);
    assert.equal(session.frame(), before);
    assert.deepEqual(session.errors, []);
    await finish(session);
  });
});

describe('runLive keys and restoration', () => {
  it('exits 0 on `q`, restoring the terminal and showing the cursor', async () => {
    const { stream, modes } = fakeStdin();
    const session = live({ scans: [() => model([docket('feat/one')])], stdin: stream });
    await settle();

    stream.write('q');
    assert.equal(await session.code, 0);
    assert.deepEqual(modes, [true, false]);
    assert.match(session.writes.join(''), /\u001b\[\?25h/);
    assert.equal(session.clock.live(), 0, 'a timer outlived the loop');
  });

  it('exits 0 on Ctrl-C, because interrupting a viewer is an ordinary way to leave it', async () => {
    const { stream, modes } = fakeStdin();
    const session = live({ scans: [() => model([docket('feat/one')])], stdin: stream });
    await settle();

    stream.write('\u0003');
    assert.equal(await session.code, 0);
    assert.deepEqual(modes, [true, false]);
  });

  it('exits 0 on SIGINT, with the terminal restored exactly once', async () => {
    const { stream, modes } = fakeStdin();
    const session = live({ scans: [() => model([docket('feat/one')])], stdin: stream });
    await settle();

    process.emit('SIGINT');
    assert.equal(await session.code, 0);
    assert.deepEqual(modes, [true, false]);
  });

  it('forces an off-schedule repaint on `r`', async () => {
    const { stream } = fakeStdin();
    let leg = 5;
    const session = live({ scans: [() => model([docket('feat/one', { index: leg })])], stdin: stream });
    await settle();
    const scans = session.scans();

    leg = 6;
    stream.write('r');
    await settle();

    assert.equal(session.scans(), scans + 1);
    assert.match(session.frame(), /6\/7/);
    await finish(session);
  });

  it('ignores a key it does not know, in silence', async () => {
    const { stream } = fakeStdin();
    const session = live({ scans: [() => model([docket('feat/one')])], stdin: stream });
    await settle();
    const scans = session.scans();

    stream.write('\u001b[A');
    stream.write('x');
    await settle();

    assert.equal(session.scans(), scans);
    assert.deepEqual(session.errors, []);
    await finish(session);
  });

  it('restores the terminal and exits non-zero when the paint itself throws', async () => {
    const { stream, modes } = fakeStdin();
    /** @type {string[]} */
    const errors = [];
    const code = runLive(
      '/projects',
      { scan: () => model([docket('feat/one')]), schedule: manualClock().schedule },
      {
        out: () => {
          throw new Error('the terminal hung up');
        },
        err: (text) => errors.push(text),
        now: () => NOW,
        isTTY: true,
        stdin: stream,
        signals: () => ({ tmux: null, history: [] }),
      },
    );

    assert.equal(await code, 1);
    assert.deepEqual(modes, [true, false], 'the terminal was left in raw mode');
    assert.match(errors.join(''), /the terminal hung up/);
  });
});

describe('the TTY fork', () => {
  it('returns a plain exit code and no escape byte when stdout is not a terminal', () => {
    /** @type {string[]} */
    const writes = [];
    const code = run(['fleet'], {
      cwd: tempRoot(),
      out: (text) => writes.push(text),
      err: () => {},
      signals: () => ({ tmux: null, history: [] }),
      isTTY: false,
      now: () => NOW,
    });

    assert.equal(code, 0);
    assert.equal(writes.join('').includes('\u001b'), false, writes.join(''));
    assert.equal(writes.join('').includes('q quit'), false);
  });

  it('enters the live loop when stdout is a terminal, and leaves on `q`', async () => {
    const { stream, modes } = fakeStdin();
    /** @type {string[]} */
    const writes = [];
    const code = run(['fleet'], {
      cwd: tempRoot(),
      out: (text) => writes.push(text),
      err: () => {},
      signals: () => ({ tmux: null, history: [] }),
      isTTY: true,
      now: () => NOW,
      stdin: stream,
    });

    assert.equal(typeof code, 'object', 'the live path must hand back a promise');
    await settle();
    stream.write('q');

    assert.equal(await code, 0);
    assert.deepEqual(modes, [true, false]);
    assert.match(writes.join(''), /\u001b\[\?25l/);
    assert.match(writes.join(''), /q quit/);
    assert.equal(writes.join('').includes(SHOW), true);
  });
});

/**
 * Shut a session down and wait for it, so no suite leaves a loop holding process-level handlers.
 *
 * @param {{code:Promise<number>}} session
 * @returns {Promise<void>}
 */
async function finish(session) {
  process.emit('SIGTERM');
  await session.code;
}
