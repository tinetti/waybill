import { LEGS } from './legs.js';

/**
 * The fleet dashboard's frame: the whole model turned into text, once.
 *
 * Pure by design, in the same sense as `renderWaybill` (`src/waybill.js:286`) and for one more
 * reason besides: `now` arrives as a parameter, so no clock is read here. That is what lets a
 * golden file of a frame stay byte-stable overnight, and what lets phase 5 drive a repaint loop
 * over this function without any of the layout or ordering logic moving into it.
 *
 * Deliberately shares no layout with `renderFleet` (`src/waybill.js:496`). That renderer belongs to
 * `waybill status`, which this work puts explicitly out of scope, and its one-line-per-docket
 * listing answers a different question at a different altitude. The duplication is the price of
 * that boundary: merging the two would silently change what `status` prints.
 */

/** The cell for a fact that was looked for and is not there. An omitted column means the opposite. */
const NONE = '–';

/** Drawn with two blocks rather than a ramp: the frame carries no colour and no partial glyphs. */
const FILLED = '█';
const EMPTY = '░';

/** Between every pair of columns. Two spaces, so a column boundary is readable without a rule. */
const GUTTER = '  ';

export const BAR_WIDTH = 11;

/**
 * Column content widths, gutters excluded.
 *
 * `DOCKET` holds the row's own indentation, so a stacked child spends its nesting out of the same
 * budget its parent spends its name out of and every later column still starts in one place.
 * Twenty-four is what fits `feat/fleet-dashboard` — twenty characters at the four-space docket
 * indent — without an ellipsis, which is the length of a real branch name in this repository.
 *
 * Fixed rather than derived from `process.stdout.columns`: a terminal-width renderer cannot have a
 * golden file. Phase 5 may pass a width in; here the frame is at most 93 columns with every column
 * present, and the last column's padding is trimmed, so a real frame is usually narrower.
 */
const DOCKET = 24;
const LEG = 12;
const AGE = 5;
const PANE = 12;
const ACTIVITY = 12;

/** Indentation, in spaces, of each kind of row. */
const REPO_INDENT = 2;
const DOCKET_INDENT = 4;

/** What marks a docket as cut from the one above it. */
const NEST = '└ ';

/**
 * Time since `then`, as one unit and no decimal point.
 *
 * The ladder stops at weeks: a docket measured in months is a docket nobody is coming back to, and
 * `12w` says that as plainly as `3mo` would while keeping every age in the column the same shape.
 *
 * @param {number|null|undefined} then unix seconds
 * @param {number} now unix seconds
 * @returns {string} e.g. `4d`, `6h`, `12m`, or {@link NONE} when there is no date to measure from
 */
export function humanAge(then, now) {
  if (typeof then !== 'number' || !Number.isFinite(then)) return NONE;
  // A tip dated in the future is somebody else's clock, not a negative age.
  const seconds = Math.max(0, Math.floor(now - then));
  if (seconds < 60) return '0m';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 28) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * How far along the route a docket is, drawn.
 *
 * The base fill is the leg index over the leg count. The execute leg is the one that is worked for
 * days rather than minutes, so when its task count is known that leg's own slice of the bar is
 * filled by `done / total` instead of all-or-nothing — four of nine tasks reads as 5.4 of 7 rather
 * than sitting at 5 of 7 until the last task lands.
 *
 * A missing count falls back to the whole-leg fill rather than to zero. `total: 0` is exactly what
 * a deferred lookup, or a repository with no openspec change, answers with, and drawing that as
 * 0-of-N would show a nearly-finished docket as barely started.
 *
 * Truncated rather than rounded: rounding at this width puts `4 of 9 tasks` and `no count at all`
 * in the same cell, and telling those two apart is the whole point of the interpolation.
 *
 * @param {number} legIndex 1-based, as `Inference.index` reports it
 * @param {number} legTotal
 * @param {{done:number, total:number}|null|undefined} taskProgress the execute leg's count
 * @param {number} width
 * @returns {string} e.g. `███████░░░░`
 */
export function bar(legIndex, legTotal, taskProgress, width) {
  const whole = legIndex / legTotal;
  const share =
    taskProgress && taskProgress.total > 0
      ? (legIndex - 1 + clamp(taskProgress.done / taskProgress.total, 0, 1)) / legTotal
      : whole;
  const filled = Math.floor(clamp(share, 0, 1) * width);
  return FILLED.repeat(filled) + EMPTY.repeat(width - filled);
}

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 * @returns {number}
 */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * `text` shortened to `width` with the middle elided, because the distinguishing part of a branch
 * name is usually its tail — `feat/fleet-dashboard` and `feat/fleet-dashboard-live` differ nowhere
 * a head-truncation would keep.
 *
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function truncate(text, width) {
  const chars = [...text];
  if (chars.length <= width) return text;
  if (width <= 1) return '…'.slice(0, Math.max(0, width));
  const head = Math.ceil((width - 1) / 2);
  const tail = width - 1 - head;
  return `${chars.slice(0, head).join('')}…${tail === 0 ? '' : chars.slice(chars.length - tail).join('')}`;
}

/**
 * One column's worth of text: truncated to fit, then padded so the next column starts where it does
 * on every other row.
 *
 * Padded by code-point count rather than `padEnd`, which counts UTF-16 units — the frame is full of
 * box-drawing and dash glyphs, and one astral character would shift a whole row.
 *
 * @param {string} text
 * @param {number} width
 * @param {'left'|'right'} [align] ages are right-aligned because they are numbers
 * @returns {string}
 */
function cell(text, width, align = 'left') {
  const clipped = truncate(text, width);
  const padding = ' '.repeat(Math.max(0, width - [...clipped].length));
  return align === 'right' ? padding + clipped : clipped + padding;
}

/**
 * @param {{session:string, windowIndex:string, windowName:string}|null|undefined} pane
 * @returns {string}
 */
function paneCell(pane) {
  return pane ? `@${pane.windowIndex}:${pane.windowName}` : NONE;
}

/**
 * @param {import('./procs.js').Activity} activity
 * @returns {string}
 */
function activityCell(activity) {
  if (!activity) return NONE;
  return activity.kind === 'agent' ? activity.name : activity.command;
}

/**
 * The staleness key: the unix second a docket's tip was last written.
 *
 * An unresolved date sorts last rather than first. A repository git would not answer for is not
 * evidence of neglect, and putting it at the top of a list whose whole purpose is "what has been
 * left alone longest" would be a claim the scan never made.
 *
 * @param {import('./fleet.js').Docket} docket
 * @returns {number}
 */
function idleKey(docket) {
  return typeof docket.idleAt === 'number' ? docket.idleAt : Number.POSITIVE_INFINITY;
}

/**
 * Most-idle first, ties broken by branch name so the frame is the same on every scan.
 *
 * @param {import('./fleet.js').Docket} a
 * @param {import('./fleet.js').Docket} b
 * @returns {number}
 */
function byStaleness(a, b) {
  if (idleKey(a) !== idleKey(b)) return idleKey(a) - idleKey(b);
  return a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : 0;
}

/**
 * One repository's dockets, in render order, each with the depth it nests at.
 *
 * Roots — dockets cut from the trunk, and dockets whose named parent is not in this fleet — are
 * sorted by staleness. A stack is then walked from its root in the order the model listed it, so
 * the chain reads in dependency order: a child is shown because of its parent, and re-sorting a
 * subtree by staleness would print the chain backwards as often as not.
 *
 * `placed` is both the cycle guard and the completeness guarantee. A `stackedOn` cycle that
 * survived `breakCycles` (`src/stack.js:81`) leaves its members unreachable from any root, so the
 * second pass renders whatever the walk did not reach flat, at depth 0. A hung renderer and a
 * silently dropped docket are the two failures this avoids.
 *
 * @param {import('./fleet.js').Docket[]} dockets
 * @returns {{docket:import('./fleet.js').Docket, depth:number}[]}
 */
function nest(dockets) {
  const byBranch = new Map(dockets.map((docket) => [docket.branch, docket]));
  /** @type {Map<string, import('./fleet.js').Docket[]>} */
  const children = new Map();
  /** @type {import('./fleet.js').Docket[]} */
  const roots = [];

  for (const docket of dockets) {
    const parent = docket.stackedOn ?? null;
    if (parent === null || parent === docket.branch || !byBranch.has(parent)) {
      roots.push(docket);
      continue;
    }
    children.set(parent, [...(children.get(parent) ?? []), docket]);
  }

  /** @type {{docket:import('./fleet.js').Docket, depth:number}[]} */
  const rows = [];
  /** @type {Set<string>} */
  const placed = new Set();
  const walk = (docket, depth) => {
    if (placed.has(docket.branch)) return;
    placed.add(docket.branch);
    rows.push({ docket, depth });
    for (const child of children.get(docket.branch) ?? []) walk(child, depth + 1);
  };

  for (const root of [...roots].sort(byStaleness)) walk(root, 0);
  for (const docket of dockets) walk(docket, 0);
  return rows;
}

/**
 * Repositories, most-neglected first, judged by their stalest docket.
 *
 * @param {import('./scan.js').RepoFleet[]} repos
 * @returns {import('./scan.js').RepoFleet[]}
 */
function byRepoStaleness(repos) {
  const oldest = (repo) => Math.min(...repo.dockets.map(idleKey));
  return [...repos].sort((a, b) => {
    if (oldest(a) !== oldest(b)) return oldest(a) - oldest(b);
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * @param {number} count
 * @param {string} noun
 * @returns {string}
 */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * @param {{pane:boolean, activity:boolean}} columns
 * @returns {string}
 */
function headerRow(columns) {
  return row(
    [
      cell(`${' '.repeat(REPO_INDENT)}DOCKET`, DOCKET),
      cell('PROGRESS', BAR_WIDTH),
      cell('LEG', LEG),
      cell('OPEN', AGE, 'right'),
      cell('IDLE', AGE, 'right'),
      ...(columns.pane ? [cell('PANE', PANE)] : []),
      ...(columns.activity ? [cell('ACTIVITY', ACTIVITY)] : []),
    ],
  );
}

/**
 * @param {string[]} cells
 * @returns {string} with the last column's padding dropped — goldens make every space load-bearing
 */
function row(cells) {
  return cells.join(GUTTER).trimEnd();
}

/**
 * One docket's line.
 *
 * @param {import('./fleet.js').Docket} docket
 * @param {number} depth
 * @param {number} now
 * @param {{pane:boolean, activity:boolean}} columns
 * @returns {string}
 */
function docketRow(docket, depth, now, columns) {
  const indent = DOCKET_INDENT + depth;
  const prefix = depth === 0 ? '' : NEST;
  const room = Math.max(1, DOCKET - indent - [...prefix].length);
  const label = `${' '.repeat(indent)}${prefix}${truncate(docket.branch, room)}`;

  const { index, leg, progress } = docket.state;
  return row([
    cell(label, DOCKET),
    bar(index, LEGS.length, progress, BAR_WIDTH),
    // No leg left to be on is leg 7 finished, which is a docket whose bay simply has not been
    // removed yet — the one state `fleet` reports that `next` would refuse to issue a waybill for.
    cell(`${index}/${LEGS.length} ${leg ?? 'complete'}`, LEG),
    cell(humanAge(docket.openedAt, now), AGE, 'right'),
    cell(humanAge(docket.idleAt, now), AGE, 'right'),
    ...(columns.pane ? [cell(paneCell(docket.pane), PANE)] : []),
    ...(columns.activity ? [cell(activityCell(docket.activity), ACTIVITY)] : []),
  ]);
}

/**
 * The whole frame: what is in flight everywhere, grouped by repository and ordered by neglect.
 *
 * A column whose source could not be read is left out of every row rather than printed empty. An
 * empty cell is a claim — "we looked, and nothing is there" — and making an unanswered `tmux` or
 * `ps` look identical to that would invite the operator to trust an absence nobody checked.
 *
 * The `⟳` ticker and the `q quit / r refresh` footer belong to phase 5's live mode and are not
 * rendered here: a refresh hint in piped output is noise, and a ticker in a golden file is a clock.
 *
 * @param {import('./scan.js').FleetModel} model
 * @param {number} now unix seconds
 * @returns {string} ends with exactly one newline
 */
export function renderFleetDashboard(model, now) {
  const columns = { pane: model.tmuxAvailable, activity: model.psAvailable };
  const dockets = model.repos.reduce((total, repo) => total + repo.dockets.length, 0);

  const lines = [
    `FLEET  ${plural(dockets, 'docket')} · ${plural(model.repos.length, 'repo')} · ${model.scanned} scanned`,
    '',
  ];

  if (dockets === 0) {
    // The header already carries the scanned count, so this line says only what it adds: the scan
    // ran and found nothing open. An empty body would read as a listing that failed to render.
    lines.push(`${' '.repeat(REPO_INDENT)}nothing in flight`);
  } else {
    lines.push(headerRow(columns));
    for (const repo of byRepoStaleness(model.repos)) {
      lines.push(`${' '.repeat(REPO_INDENT)}${repo.name}`);
      for (const { docket, depth } of nest(repo.dockets)) {
        lines.push(docketRow(docket, depth, now, columns));
      }
    }
  }

  // A repository whose bookings overlay was unreadable, or whose stack detection gave up, is still
  // listed — with legs resolved against different bookings than it declared. Dropping the note
  // would make that frame indistinguishable from an accurate one.
  const warnings = model.repos.flatMap((repo) => repo.warnings);
  if (warnings.length > 0) {
    lines.push('', 'WARNINGS:', ...warnings.map((text) => `${' '.repeat(REPO_INDENT)}${text}`));
  }

  return `${lines.join('\n')}\n`;
}
