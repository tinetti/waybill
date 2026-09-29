/**
 * The paint layer: two frame strings in, the bytes that turn one into the other out.
 *
 * Sits strictly above the renderer (`src/fleet-dash.js:338`) and knows nothing about what a frame
 * contains — no columns, no dockets, no clock. That separation is what keeps every golden file valid:
 * the one-shot path writes the renderer's string and never comes here, so a pipe cannot see an escape
 * byte even by accident.
 *
 * Four escapes are used and no others. Notably absent: `\x1b[2J` (clear screen), which flickers, and
 * `\x1b[?1049h` (alternate screen buffer), which takes the frame *and* the scrollback away the moment
 * you quit. A glance command should leave its last frame on your screen.
 */

/** @typedef {{write:(text:string)=>void}} Surface where a frame goes. `io.out`, in practice. */

const HIDE_CURSOR = '\u001b[?25l';
const SHOW_CURSOR = '\u001b[?25h';

/** Erase the whole line the cursor is on, leaving the cursor where it was. */
const ERASE_LINE = '\u001b[2K';

/**
 * @param {number} rows
 * @returns {string} the cursor moved up `rows` lines, or nothing at all for a move of zero — `\x1b[0A`
 *   still moves one line on some terminals
 */
const up = (rows) => (rows > 0 ? `\u001b[${rows}A` : '');

/**
 * A frame's lines, without the empty string its trailing newline would otherwise produce.
 *
 * @param {string} frame
 * @returns {string[]}
 */
function linesOf(frame) {
  return frame.endsWith('\n') ? frame.slice(0, -1).split('\n') : frame.split('\n');
}

/**
 * The escape sequence that transforms `prev` into `next`, in place.
 *
 * ## The cursor contract
 *
 * Both the caller's first `write(frame)` and every patch returned here leave the cursor at column 0
 * of the row immediately *below* the frame — the row a plain `write` would have left it on. Every
 * patch is computed against that resting position and returns to it, so frames can be diffed one
 * after another indefinitely without the paint layer holding any state.
 *
 * ## Why the two branches
 *
 * With the line counts equal, only the lines that differ are rewritten, and the cursor steps between
 * them with linefeeds. With the counts unequal, everything from the first difference to the end of
 * the frame is rewritten: the rows below the change have all shifted, so comparing them pairwise
 * would find differences that are only misalignment. A shorter frame then erases the rows the old
 * one occupied and the new one does not — without that, yesterday's last docket stays on screen
 * below a frame that no longer lists it.
 *
 * A docket count that changes between ticks is the ordinary case, not an edge one, which is why the
 * unequal branch is written to be correct rather than clever.
 *
 * Every write is preceded by `\r`. Column 0 is then never in doubt, whatever the terminal does with
 * a linefeed.
 *
 * @param {string} prev the frame currently on screen
 * @param {string} next the frame that should be
 * @returns {string} empty when the two frames are identical — an idle fleet must not flicker
 */
export function diffFrames(prev, next) {
  if (prev === next) return '';

  const before = linesOf(prev);
  const after = linesOf(next);

  let first = 0;
  while (first < before.length && first < after.length && before[first] === after[first]) first += 1;

  /** @type {string[]} */
  const out = [up(before.length - first)];
  let row = first;

  if (before.length === after.length) {
    for (let line = first; line < after.length; line += 1) {
      if (before[line] === after[line]) continue;
      // Down to the line by linefeed: cursor-down is not in this layer's vocabulary, and stepping
      // over an unchanged line costs one byte against rewriting it.
      out.push('\n'.repeat(line - row), '\r', ERASE_LINE, after[line], '\n');
      row = line + 1;
    }
    // Back to the resting row below the frame.
    out.push('\n'.repeat(before.length - row));
    return out.join('');
  }

  for (let line = first; line < after.length; line += 1) out.push('\r', ERASE_LINE, after[line], '\n');

  const orphans = before.length - after.length;
  if (orphans > 0) {
    // The rows the old frame occupied below the new one, blanked and then climbed back out of.
    out.push(`\r${ERASE_LINE}\n`.repeat(orphans), up(orphans));
  }
  return out.join('');
}

/**
 * @param {Surface} surface
 * @returns {void}
 */
export function enterLive(surface) {
  surface.write(HIDE_CURSOR);
}

/**
 * Give the terminal back: the cursor visible again, and one newline so the shell prompt does not
 * land on the row the next repaint would have used.
 *
 * Deliberately leaves the last frame where it is. That is the point of refusing the alternate screen
 * buffer — what you were looking at when you pressed `q` is still there afterwards.
 *
 * @param {Surface} surface
 * @returns {void}
 */
export function exitLive(surface) {
  surface.write(`${SHOW_CURSOR}\r\n`);
}

/** Signals that mean "this process is going away". Each one has to give the terminal back first. */
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * Read keys from `stdin`, with restoration guaranteed on every way out.
 *
 * The ordering here is the whole safety argument: every handler that restores is registered *before*
 * raw mode is entered, so there is no window in which the terminal is raw and nothing is listening
 * for the process to end. An operator left with a shell that does not echo is the worst outcome this
 * command can produce, and it is worth two lines of care to make unreachable.
 *
 * `setRawMode` is called only when stdin has one. Under `node --test` stdin is a pipe and the method
 * does not exist; the key listener is still attached, because a pipe delivers keys perfectly well —
 * it just delivers them a line at a time.
 *
 * @param {NodeJS.ReadStream} stdin
 * @param {(key:string) => void} onKey one call per code point, escape sequences included
 * @param {(error:Error|null) => void} onExit the process is ending; `null` for a signal, the error
 *   for an uncaught exception. The terminal is already restored by the time this is called.
 * @returns {() => void} restore, idempotent — safe to call from every exit path and from all of them
 */
export function withRawStdin(stdin, onKey, onExit) {
  let restored = false;

  /** @param {Buffer|string} chunk @returns {void} */
  const onData = (chunk) => {
    for (const key of String(chunk)) onKey(key);
  };

  /** @param {unknown} error @returns {void} */
  const onUncaught = (error) => {
    restore();
    onExit(error instanceof Error ? error : new Error(String(error)));
  };

  /** @type {Map<string, () => void>} */
  const onSignal = new Map(
    SIGNALS.map((name) => [
      name,
      () => {
        restore();
        onExit(null);
      },
    ]),
  );

  /** @returns {void} */
  function restore() {
    if (restored) return;
    restored = true;
    process.off('uncaughtException', onUncaught);
    for (const [name, handler] of onSignal) process.off(name, handler);
    stdin.off('data', onData);
    if (typeof stdin.setRawMode === 'function') stdin.setRawMode(false);
    stdin.pause();
  }

  process.on('uncaughtException', onUncaught);
  for (const [name, handler] of onSignal) process.on(name, handler);

  if (typeof stdin.setRawMode === 'function') stdin.setRawMode(true);
  stdin.on('data', onData);
  stdin.resume();

  return restore;
}
