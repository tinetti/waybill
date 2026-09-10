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
 * and from `waybill bay`, and a lookup table should not depend on its only caller validating for
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
 * Where one docket stands, with no branch attached.
 *
 * `docketOpen` is checked before `leg`, not after: on the base branch `leg` still reads `ideate`
 * (nothing stamps it done from history alone), and reporting a leg position the repository has no
 * business claiming is exactly the bug this state exists to stop.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function position(state) {
  if (!state.docketOpen) return 'no docket open';
  if (state.leg === null) return `all ${LEGS.length} legs complete`;
  return `leg ${state.index} of ${LEGS.length} (${state.leg})`;
}

/**
 * The same position with execute's task count folded into the parenthesis.
 *
 * The fleet gives each docket one line, so there is nowhere to hang the leg strip that carries
 * progress on the single-docket surfaces ({@link strip}). Folding it in here rather than widening
 * {@link position} is deliberate: {@link header} feeds every existing golden file, and progress
 * appearing on its first line would rewrite all of them.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function fleetPosition(state) {
  if (!state.docketOpen || state.leg === null || !state.progress) return position(state);
  const { done, total } = state.progress;
  return `leg ${state.index} of ${LEGS.length} (${state.leg}, ${done} of ${total} tasks)`;
}

/**
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function header(state) {
  return state.branch ? `${state.branch} · ${position(state)}` : position(state);
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
 * Takes a plain warnings list rather than an `Inference`, because the fleet surfaces have N of them
 * and no single state to read `warnings` off — and because a synthetic `Inference` fabricated just
 * to reach this block would be a state no repository is in.
 *
 * @param {string[]} sections
 * @param {string[]} warnings raised while resolving, already attributed where there is more than
 *   one docket to attribute them to
 * @param {import('./inspection.js').Inspection} inspection
 * @returns {string} ends with exactly one newline
 */
function withFindings(sections, warnings, inspection) {
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
  const all = [...warnings, ...(inspection.warnings ?? [])];
  if (all.length > 0) {
    sections.push(['WARNINGS:', ...all.map((text) => `${INDENT}⚠ ${text}`)].join('\n'));
  }

  return `${sections.join('\n\n')}\n`;
}

/**
 * The one shell command Waybill ever names, in the one shape both surfaces that name it use.
 *
 * A tool-invoked shell cannot change the operator's directory, so the move has to be theirs to
 * make — and `waybill bay` and a trunk-resolved `waybill next` both have to ask for it. Two call
 * sites building the line themselves would eventually print two shapes of the same instruction.
 *
 * `alreadyThere` is passed rather than observed: answering it means resolving symlinks, and a
 * renderer that touched the filesystem could not be golden-tested. `isInside` (`src/bay.js`) is
 * what the CLI asks.
 *
 * @param {string} target absolute path to the bay
 * @param {boolean} [alreadyThere] whether the operator is standing in it already
 * @returns {string[]} the one line, or none at all
 */
export function cdLines(target, alreadyThere = false) {
  return alreadyThere ? [] : [`${INDENT}cd ${target}`];
}

/**
 * The whole product in one string: where this repository stands, and what the next session runs.
 *
 * Pure by design — no filesystem, no subprocess, no clock. `waybill bay` prints this same block
 * after creating a bay, and a renderer that went looking for its own inputs could not be reused
 * there.
 *
 * @param {import('./inference.js').Inference} state
 * @param {import('./inspection.js').Inspection} [inspection]
 * @param {string[]} [cd] the {@link cdLines} instruction, when the docket was resolved from outside
 *   its own bay. Empty — the default, and what {@link cdLines} returns for an operator already
 *   there — leaves the block out entirely rather than printing an empty heading.
 * @returns {string} ends with exactly one newline
 */
export function renderWaybill(state, inspection = { ignored: [], warnings: [] }, cd = []) {
  // No docket open means no leg walk to show a checklist of — the strip would otherwise print
  // `▶ ideate` for a leg the repository was never actually working.
  const where = [header(state), ...(state.docketOpen ? strip(state) : [])].join('\n');
  // Before NEXT, not after: the order is the instruction. Move the shell first, then hand the
  // session over — a `/clear` acted on from the wrong directory answers for the wrong docket.
  const bay = cd.length > 0 ? [['IN BAY:', ...cd].join('\n')] : [];
  return withFindings([where, ...bay, nextBlock(state).join('\n')], state.warnings, inspection);
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
  const where = [header(state), ...(state.docketOpen ? strip(state) : [])].join('\n');
  return withFindings([where], state.warnings, inspection);
}

/**
 * How many efforts are in flight, in the plural the repository actually is.
 *
 * Deliberately not {@link header}'s `no docket open`, which is one character away and means the
 * opposite thing: that is one branch carrying no docket, this is a repository with nothing open on
 * any branch.
 *
 * @param {string} branch the trunk's own branch — the fleet is a fact about the repository, and it
 *   is named the same way a docket is
 * @param {import('./fleet.js').Docket[]} dockets
 * @returns {string}
 */
function fleetHeader(branch, dockets) {
  const count = dockets.length === 0 ? 'no' : String(dockets.length);
  return `${branch} · ${count} ${dockets.length === 1 ? 'docket' : 'dockets'} open`;
}

/**
 * One line per docket under an all-caps heading, the position column padded to the longest branch
 * so a reader scans down the legs rather than hunting for them.
 *
 * @param {string} heading
 * @param {import('./fleet.js').Docket[]} dockets
 * @returns {string}
 */
function docketBlock(heading, dockets) {
  const width = Math.max(...dockets.map((docket) => docket.branch.length));
  return [
    heading,
    ...dockets.map(
      (docket) => `${INDENT}${docket.branch.padEnd(width)} · ${fleetPosition(docket.state)}`,
    ),
  ].join('\n');
}

/**
 * Every warning raised resolving the fleet, each prefixed with the branch it came from.
 *
 * Unattributed, a docket that cannot read its own diff reads as a fault in the repository at
 * large — and the operator has no way to tell which working tree to go and look at.
 *
 * @param {import('./fleet.js').Docket[]} dockets
 * @returns {string[]}
 */
function fleetWarnings(dockets) {
  return dockets.flatMap((docket) =>
    docket.state.warnings.map((text) => `${docket.branch}: ${text}`),
  );
}

/**
 * Every effort in flight, for `waybill status` run on the trunk.
 *
 * No waybill: `status` answers where things stand and nothing else, and there is no single next
 * leg to hand off when there is more than one docket.
 *
 * @param {string} branch
 * @param {import('./fleet.js').Docket[]} dockets in the order `fleet()` returned them, which is
 *   deterministic for a given set of bays
 * @param {import('./inspection.js').Inspection} [inspection]
 * @returns {string} ends with exactly one newline
 */
export function renderFleet(branch, dockets, inspection = { ignored: [], warnings: [] }) {
  // An empty fleet gets the header alone. A `DOCKETS:` heading over nothing would read as a list
  // that failed to render rather than a repository with nothing open.
  const listing = dockets.length > 0 ? [docketBlock('DOCKETS:', dockets)] : [];
  return withFindings([fleetHeader(branch, dockets), ...listing], fleetWarnings(dockets), inspection);
}

/**
 * The same fleet, asked to choose from, for `waybill next` on a trunk with more than one docket.
 *
 * `SELECT A DOCKET:` is an exact literal rather than prose: `commands/next.md` keys its one
 * exception to the verbatim rule on finding it, so rewording the heading silently turns the
 * selection prompt off.
 *
 * The command to re-run belongs to this block, blank line and all, rather than being a section of
 * its own — {@link withFindings} joins sections with a blank line and appends its findings after
 * them, so a separate section would let `WARNINGS:` sort in between the list and the instruction.
 *
 * @param {string} branch
 * @param {import('./fleet.js').Docket[]} dockets
 * @param {import('./inspection.js').Inspection} [inspection]
 * @returns {string} ends with exactly one newline
 */
export function renderSelect(branch, dockets, inspection = { ignored: [], warnings: [] }) {
  const choice = `${docketBlock('SELECT A DOCKET:', dockets)}\n\n${INDENT}waybill next <branch>`;
  return withFindings([fleetHeader(branch, dockets), choice], fleetWarnings(dockets), inspection);
}
