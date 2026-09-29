# Implementation Spec: Waybill Fleet — Phase 5

**Contract**: ./contract.md
**Estimated Effort**: L
**Prerequisite**: Phase 4 (pure renderer and the Io seam)
**Risk**: High — the repo's first ANSI output and first stdin handling

## Technical Approach

Phase 5 makes the view live. It adds a paint layer *above* the Phase 4 renderer and changes nothing
below it: no data logic, no layout, no column decisions move. The renderer stays a pure function of
(model, now), and this phase is solely concerned with when to call it, what to do with the string,
and how to give the terminal back afterwards.

**The TTY fork is the whole design.** When `stdout` is a TTY, the command enters a loop: paint,
schedule the next tick, listen for keys. When it is not — piped, redirected, or running under
`node --test` — it takes the Phase 4 path unchanged: one complete frame, exit 0, no escape bytes.
That single branch is what keeps every golden valid and `fleet | grep` working, and it means the
entire live path is opt-out-by-default in tests.

**Repaint is frame diffing, not clearing.** Render the new frame, compare it line by line against the
previous one, and rewrite only changed lines using cursor-up plus erase-line. Clearing the screen
every 2 seconds produces visible flicker and destroys scrollback; the alternate screen buffer
destroys scrollback too and leaves nothing behind when you quit. Diffing keeps the view stable and
leaves the last frame in your terminal history when you exit — which is what you want from a
dashboard you glance at.

**Two lanes, two cadences.** The fast lane — git data from Phases 1 and 2 — refreshes on the ~2s
tick. The slow lane — openspec task counts and the `ps` process walk — refreshes on a longer cycle
and, critically, does not gate the first paint. The first frame goes up with whole-leg bars and blank
activity; the slow lane fills them in on arrival. This is the only place in the project where
progressive fill has meaning, and it is where the 500ms first-paint target applies.

**Terminal restoration is a correctness requirement, not politeness.** Raw mode with a swallowed
`SIGINT` and no restore leaves the operator with a terminal that does not echo. Every exit path —
`q`, Ctrl-C, an uncaught exception, `SIGTERM`, `SIGHUP` — must restore cooked mode and the cursor.
This is the single highest-consequence failure in the phase.

## Feedback Strategy

**Inner-loop command**: `node --test tests/fleet-dash-live.test.js`

**Playground**: The injected `Io` seam from Phase 4 — a fake TTY `out`, an injected `now`, and a
`PassThrough` stream standing in for stdin. The loop is driven by a manual clock, so tests advance
time explicitly rather than sleeping.

**Why this approach**: A timer-driven, input-driven loop is untestable with real timers and a real
terminal. Driving it entirely through injected seams makes every case — a tick, a keypress, a signal,
a slow-lane arrival — deterministic and instant.

## File Changes

### New Files

| File Path                        | Purpose                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| `src/paint.js`                   | Frame diffing, cursor control, terminal save/restore                 |
| `src/live.js`                    | The refresh loop, two-lane scheduling, key handling                  |
| `tests/fleet-dash-live.test.js`  | Tick, keys, restoration, progressive fill                            |
| `tests/fleet-dash-perf.test.js`  | First paint precedes the slow lane; wall-clock ceiling               |

### Modified Files

| File Path        | Changes                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `src/cli.js`     | In the `fleet` handler, branch on `io.isTTY` — live loop when true, Phase 4's one-shot when false |
| `tests/index.js` | Register `./fleet-dash-live.test.js` and `./fleet-dash-perf.test.js`                              |

### Deleted Files

None.

## Implementation Details

### Paint layer

**Overview**: Turn two frame strings into the minimal escape sequence that transforms one into the
other.

```js
/** @typedef {{ write:(s:string)=>void, rows:() => number }} Surface */

/** @returns {string} the escape sequence to transform `prev` into `next` */
export function diffFrames(prev, next) {}

export function enterLive(surface) {}   // hide cursor
export function exitLive(surface) {}    // show cursor, newline
```

Escapes used, and only these: `\x1b[?25l` / `\x1b[?25h` (cursor hide/show), `\x1b[<n>A` (cursor up),
`\x1b[2K` (erase line), `\r` (column 0).

**Key decisions**:

- **No alternate screen buffer.** `\x1b[?1049h` would wipe the frame on exit and take scrollback with
  it. The point of a glance command is that the last frame stays on screen.
- **Line-count changes force a full repaint of the tail.** When the new frame has more or fewer lines
  than the previous one, diffing individual lines is not enough — erase from the first differing line
  to the end and rewrite. Docket counts change between ticks, so this is the common case, not an edge.
- **The diff function is pure and directly testable.** It takes two strings and returns a string. No
  terminal, no state. Every escape-sequence assertion happens against its return value.
- **Never emit an escape when not live.** The one-shot path does not import the paint layer at all.

**Implementation steps**:

1. Write a failing test: `diffFrames(a, a)` returns `''`.
2. Implement line-by-line comparison with cursor-up and erase-line.
3. Add the differing-line-count case with tail erasure.
4. Add cursor hide/show helpers.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-live.test.js`, asserting on the returned string.
- **Experiment**: Five frame pairs — identical; one line changed mid-frame; last line changed; new
  frame longer; new frame shorter. Assert the identical pair emits nothing, and that the
  shorter-frame case erases the orphaned tail lines.
- **Check command**: `node --test tests/fleet-dash-live.test.js`

### Refresh loop and two-lane scheduling

**Overview**: Paint immediately from fast data, then tick.

```js
/** @param {FleetModel} initial @param {Io} io @returns {Promise<number>} exit code */
export function runLive(cwd, opts, io) {}
```

**Key decisions**:

- **First paint uses fast-lane data only**, before any openspec or `ps` call has resolved. This is the
  500ms target, and the perf test asserts the *ordering* — first write precedes slow-stub resolution —
  rather than relying on a wall-clock threshold that would be flaky on a loaded machine with no CI.
- **Fast lane every ~2s, slow lane every ~10s.** The fast lane is local git; the slow lane spawns
  subprocesses per docket and must not run at 2s intervals across ten dockets.
- **A tick never overlaps itself.** If a refresh is still in flight when the next tick fires, skip
  that tick. Otherwise a slow scan across many repos queues work indefinitely.
- **The clock is injected** via `io.now`, and the timer through an injectable scheduler, so tests
  advance time explicitly.
- **Slow-lane results merge into the model, never replace it.** A failed slow lane leaves the previous
  values in place rather than blanking populated columns.

**Implementation steps**:

1. Write a failing test: with a manual clock, two ticks produce two paints.
2. Implement the loop with immediate first paint.
3. Add the separate slow-lane cadence and the merge-not-replace rule.
4. Add the overlap guard.

**Feedback loop**:

- **Playground**: `tests/fleet-dash-live.test.js` with a manual clock and a fake surface capturing writes.
- **Experiment**: Advance the clock through 1, 2, and 6 ticks with a slow lane that resolves on the
  third; assert the first paint contains whole-leg bars, the post-resolution paint contains
  interpolated bars, and that a slow lane that rejects leaves the previous values intact.
- **Check command**: `node --test tests/fleet-dash-live.test.js`

### Key handling and terminal restoration

**Overview**: Raw stdin for `q` and `r`, with restoration guaranteed on every exit path.

```js
export function withRawStdin(stdin, onKey, onExit) {}
```

**Key decisions**:

- **Restoration is registered before raw mode is entered**, not after. If anything between the two
  throws, the terminal is already recoverable.
- **Every exit path restores**: `q`, Ctrl-C (`\x03`), `SIGINT`, `SIGTERM`, `SIGHUP`, `uncaughtException`,
  and normal return. Restoration is idempotent so double-firing is harmless.
- **Ctrl-C is handled, not swallowed.** It restores and exits 0, the same as `q` — this is a viewer,
  and interrupting it is a normal way to leave.
- **Unknown keys are ignored silently.** No beep, no error line.
- **`setRawMode` only when stdin is a TTY.** Under `node --test` stdin is a pipe and `setRawMode` does
  not exist; guard on its presence, not on a platform check.

**Implementation steps**:

1. Write a failing test: a `PassThrough` stdin receiving `q` resolves the loop with exit 0.
2. Implement the raw-mode wrapper with registration-before-entry.
3. Add `r` forcing an immediate refresh outside the tick schedule.
4. Add every signal handler and an idempotent restore.
5. Add a test asserting restore ran after an exception thrown mid-paint.

**Feedback loop**:

- **Playground**: A `PassThrough` as stdin with a spy on the restore function.
- **Experiment**: Send `q`; send `\x03`; send `r` then `q`; emit `SIGINT`; throw inside the renderer.
  Assert exit 0 for the first four, and that the restore spy fired exactly once in all five.
- **Check command**: `node --test tests/fleet-dash-live.test.js`

## Testing Requirements

### Unit Tests

| Test File                       | Coverage                                                       |
| ------------------------------- | ---------------------------------------------------------------- |
| `tests/fleet-dash-live.test.js` | Frame diffing, tick cadence, slow lane, keys, restoration       |
| `tests/fleet-dash-perf.test.js` | First paint precedes slow-lane resolution; generous wall ceiling |

**Key test cases**:

- `diffFrames(a, a)` emits nothing.
- A shorter new frame erases the orphaned tail lines.
- First paint happens before the openspec and `ps` stubs resolve.
- Interpolated bars appear only after the slow lane lands.
- A rejected slow lane leaves previously-populated columns intact.
- A tick firing while a refresh is in flight is skipped, not queued.
- `q` exits 0; Ctrl-C exits 0; `r` forces an off-schedule repaint.
- Restore fires exactly once on `q`, on `SIGINT`, and after an exception mid-paint.
- With `isTTY: false`, no escape byte is ever written and exactly one frame appears.

### Manual Testing

- [ ] Run in a real terminal; confirm no flicker and that scrollback survives.
- [ ] Commit in another window; confirm the row updates within ~2s.
- [ ] Press `q`; confirm the prompt returns with echo working and the last frame still visible.
- [ ] Press Ctrl-C; confirm the same.
- [ ] Resize the terminal mid-run; confirm it does not corrupt the frame.
- [ ] `waybill fleet | cat`; confirm one frame and no escapes.

## Error Handling

| Error Scenario                      | Handling Strategy                                                |
| ----------------------------------- | ------------------------------------------------------------------ |
| Renderer throws mid-loop            | Restore the terminal, print the error to stderr, exit non-zero    |
| A repo disappears between ticks     | Drop it from the next frame; do not crash the loop                |
| Slow lane rejects                   | Keep the previous values; do not blank populated columns          |
| `setRawMode` unavailable            | Skip key handling, keep the timed refresh, log nothing            |
| Terminal resized                    | Next full repaint corrects it; no resize handler in this phase    |
| stdout closes (`| head`)            | EPIPE — exit 0 quietly, as a pager-terminated stream should       |

## Failure Modes

| Component   | Failure Mode                        | Trigger                                       | Impact                                                       | Mitigation                                                        |
| ----------- | ----------------------------------- | --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Raw stdin   | Terminal left in raw mode           | Exit path without restore                     | Operator's shell stops echoing — worst outcome in the project | Register restore before entering; cover every signal; idempotent    |
| Raw stdin   | Ctrl-C swallowed                    | SIGINT handled but not exiting                | Command cannot be killed normally                             | Ctrl-C restores and exits 0                                         |
| Paint       | Flicker or lost scrollback          | Clear-screen or alternate buffer per tick     | Unpleasant to watch; history destroyed                        | Line-diff repaint only; no `\x1b[2J`, no `\x1b[?1049h`             |
| Paint       | Corrupted frame after a row change  | Line-count change repainted line-wise         | Orphaned stale lines below the frame                          | Erase-to-end on line-count change; dedicated shorter-frame test     |
| Paint       | Escapes leak into a pipe            | TTY fork missing or inverted                  | Goldens fail; `fleet | grep` breaks                           | One-shot path never imports the paint layer; explicit no-escape test |
| Loop        | Overlapping refreshes pile up       | Scan slower than the tick across many repos   | Runaway subprocesses, rising load                             | In-flight guard skips the tick                                      |
| Loop        | Slow lane blanks good data          | Failed refresh replacing the model wholesale  | Columns flicker between populated and empty                   | Merge-not-replace; rejection test                                   |
| Loop        | Subprocess storm                    | Slow lane running on the 2s fast cadence      | `ps` and `openspec` spawned constantly                        | Separate ~10s slow cadence                                          |

## Validation Commands

```bash
# Scoped inner loop
node --test tests/fleet-dash-live.test.js
node --test tests/fleet-dash-perf.test.js

# Non-TTY behavior must be unchanged from Phase 4
node --test tests/fleet-dash-cmd.test.js
node src/cli.js fleet | cat | grep -c $'\x1b' || echo "no escapes — correct"

# status still untouched
node --test tests/cli.test.js tests/waybill.test.js tests/fleet.test.js
git diff --exit-code main -- tests/cli.test.js tests/waybill.test.js tests/fleet.test.js \
  tests/golden/status.txt tests/golden/fleet.txt tests/golden/fleet-empty.txt

# Barrel registration
for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done

# Whole suite
node --test tests/
```

## Open Items

- [ ] Decide whether the slow-lane cadence (~10s proposed) should differ for `ps` versus openspec.
      `ps` is cheap and could run on the fast lane; openspec is the expensive one.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
