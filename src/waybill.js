import { LEGS } from './legs.js';

/**
 * What the `handover` key means for the operator. An unrecognised value is rendered verbatim rather
 * than dropped, so a booking can ask for something Waybill never anticipated and still be obeyed.
 */
const HANDOVER_LINES = {
  transfer: '/clear, then run:',
  through: 'run:',
};

/** Used when a booking declares no `handover` at all — the command still needs introducing. */
const DEFAULT_HANDOVER = 'run:';

/**
 * The repository fact a booking's `argument` names. Every value returns `null` when the repository
 * cannot supply it, and a null argument is omitted rather than interpolated empty — a command with
 * a blank argument is one the next session cannot run.
 *
 * A Map rather than an object literal, for the same reason `src/cli.js` uses one for subcommands: a
 * booking whose `argument` reads `constructor` would find a function on a plain object's prototype
 * and be called with the resolved state. `loadBookings` rejects that key today, so this is depth
 * rather than a live bug — but the renderer is also reachable with hand-built bookings from tests
 * and from `waybill start`, and a lookup table should not depend on its only caller validating for
 * it.
 */
const ARGUMENT_SOURCES = new Map([
  ['change-id', (state) => state.changeId],
  ['branch', (state) => state.branch],
  ['none', () => null],
]);

/**
 * What a booking gets when it names no `argument`. It is the change id because that is what every
 * spec-driven command takes; the key exists for the targets that take something else — the cleanup
 * leg finishes a *branch* — and for the ones that take nothing at all.
 */
const DEFAULT_ARGUMENT = 'change-id';

const INDENT = '  ';

/**
 * `docketOpen` is checked before `leg`, not after: on the base branch `leg` still reads `ideate`
 * (nothing stamps it done from history alone), and reporting a leg position the repository has no
 * business claiming is exactly the bug this state exists to stop.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function header(state) {
  const position = !state.docketOpen
    ? 'no docket open'
    : state.leg === null
      ? `all ${LEGS.length} legs complete`
      : `leg ${state.index} of ${LEGS.length} (${state.leg})`;
  return state.branch ? `${state.branch} · ${position}` : position;
}

/**
 * The leg strip: a positional walk of {@link LEGS}, not a replay of `completed`. Work done out of
 * order leaves completed legs *after* the current one, and concatenating the two lists would print
 * them in an order the repository never went through.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string[]}
 */
function strip(state) {
  const completed = new Set(state.completed);
  const skipped = new Set(state.skipped);
  const lines = [];

  const ticks = LEGS.filter((leg) => completed.has(leg.id)).map((leg) => `✓ ${leg.id}`);
  if (ticks.length > 0) lines.push(`${INDENT}${ticks.join('  ')}`);

  if (state.leg !== null) {
    const progress = state.progress
      ? ` (${state.progress.done} of ${state.progress.total} tasks)`
      : '';
    lines.push(`${INDENT}▶ ${state.leg}${progress}`);
  }

  for (const leg of LEGS) {
    if (skipped.has(leg.id)) lines.push(`${INDENT}⚠ ${leg.id} (skipped)`);
  }
  return lines;
}

/**
 * Indent the booking body without leaving trailing whitespace on its blank lines — golden files
 * make every space load-bearing.
 *
 * @param {string} body
 * @returns {string[]}
 */
function waybillText(body) {
  const trimmed = body.trim();
  if (trimmed === '') return [];
  return ['', ...trimmed.split('\n').map((line) => (line === '' ? '' : `${INDENT}${line}`))];
}

/**
 * @param {import('./inference.js').Inference} state
 * @returns {string[]}
 */
function nextBlock(state) {
  if (state.leg === null) {
    return ['NEXT:', `${INDENT}nothing to hand off — every leg is complete`];
  }

  const booking = state.booking;
  if (!booking) {
    return [
      'NEXT:',
      `${INDENT}no booking is bound to the ${state.leg} leg`,
      `${INDENT}└ add one under bookings/ to give this leg a waybill`,
    ];
  }

  // The argument is dropped whenever the repository cannot supply it — `changeId` is null until a
  // change exists on disk, and the whole point of the specs leg is that it does not yet. Omitting
  // it is the only honest option: an empty one would hand the next session a command it cannot run.
  const source =
    ARGUMENT_SOURCES.get(booking.argument ?? DEFAULT_ARGUMENT) ??
    ARGUMENT_SOURCES.get(DEFAULT_ARGUMENT);
  const argument = source(state);
  const command = argument ? `${booking.command} ${argument}` : booking.command;

  // Only what the booking declares. A default effort would be a choice nobody made, attributed to
  // a booking that never made it.
  const detail = booking.effort ? `${booking.model} · ${booking.effort} effort` : booking.model;

  return [
    'NEXT:',
    `${INDENT}${HANDOVER_LINES[booking.handover] ?? booking.handover ?? DEFAULT_HANDOVER}`,
    `${INDENT}${command}`,
    `${INDENT}└ ${detail}`,
    ...waybillText(booking.body),
  ];
}

/**
 * Everything both surfaces say about the repository, appended to whatever `sections` they lead
 * with. The inspection findings and the warnings are facts about where the docket stands, not about
 * the handover, so `waybill status` reports them exactly as `waybill next` does.
 *
 * @param {string[]} sections
 * @param {import('./inference.js').Inference} state
 * @param {import('./inspection.js').Inspection} inspection
 * @returns {string} ends with exactly one newline
 */
function withFindings(sections, state, inspection) {
  if (inspection.ignored.length > 0) {
    sections.push(
      [
        'IGNORED BY GIT:',
        ...inspection.ignored.map(
          (query) => `${INDENT}⚠ ${query} — papers written here will never be committed`,
        ),
      ].join('\n'),
    );
  }

  // Last, and never suppressed: a leg that silently repeats forever is the worst failure this tool
  // has, and the warning naming the booking is the only thing that explains it.
  const warnings = [...state.warnings, ...(inspection.warnings ?? [])];
  if (warnings.length > 0) {
    sections.push(['WARNINGS:', ...warnings.map((text) => `${INDENT}⚠ ${text}`)].join('\n'));
  }

  return `${sections.join('\n\n')}\n`;
}

/**
 * The whole product in one string: where this repository stands, and what the next session runs.
 *
 * Pure by design — no filesystem, no subprocess, no clock. `waybill start` prints this same block
 * after creating a bay, and a renderer that went looking for its own inputs could not be reused
 * there.
 *
 * @param {import('./inference.js').Inference} state
 * @param {import('./inspection.js').Inspection} [inspection]
 * @returns {string} ends with exactly one newline
 */
export function renderWaybill(state, inspection = { ignored: [], warnings: [] }) {
  // No docket open means no leg walk to show a checklist of — the strip would otherwise print
  // `▶ ideate` for a leg the repository was never actually working.
  const position = [header(state), ...(state.docketOpen ? strip(state) : [])].join('\n');
  return withFindings([position, nextBlock(state).join('\n')], state, inspection);
}

/**
 * Where the docket stands, without a waybill, for `waybill status`.
 *
 * The NEXT block is the one thing left out, and leaving it out is the point: re-issuing an
 * instruction to an operator who has already acted on it invites it to be run twice. Sharing
 * {@link withFindings} with {@link renderWaybill} is what keeps the two surfaces from disagreeing
 * about where the same repository stands.
 *
 * @param {import('./inference.js').Inference} state
 * @param {import('./inspection.js').Inspection} [inspection]
 * @returns {string} ends with exactly one newline
 */
export function renderPosition(state, inspection = { ignored: [], warnings: [] }) {
  const position = [header(state), ...(state.docketOpen ? strip(state) : [])].join('\n');
  return withFindings([position], state, inspection);
}
