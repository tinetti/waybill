import path from 'node:path';

import { LEGS } from './legs.js';
import { resolveBookings } from './bookings.js';

/**
 * The page's hard line budget, counted with blank lines. Exported so the test asserts against this
 * constant rather than a second literal that could drift from it.
 */
export const MAX_LINES = 45;

/**
 * What stamps a wrapper-owned leg. Those two judge themselves in `src/legs.js` rather than through
 * a booking, so there is no booking field to read the phrase from.
 */
const WRAPPER_STAMPS = { bay: 'bay exists', cleanup: 'merged, bay gone' };

/** Stands in for a carrier or a stamp the bookings in force could not supply. */
const NONE = '—';

const INTRO = [
  'waybill — the route, the words, and the four verbs',
  '',
  'FROM ZERO',
  '  1. On the trunk:        waybill new         leg 1\'s waybill; run what it names',
  '  2. Once the idea holds: waybill bay feat/x  create the branch and its bay',
  '  3. Move in:             cd <the path bay printed> — a session skips this step',
  '  4. Every new session:   waybill next        the waybill for the next leg',
  '  5. Run what it names — in a session its /waybill:next <branch>/<leg> moves you',
  '',
  'ROUTE',
];

const OUTRO = [
  '',
  'WORDS',
  '  trunk    the default branch; efforts begin here, and no docket is open on it',
  '  docket   the branch; open whenever anything but the trunk is checked out',
  '  bay      the docket\'s own worktree, so the main checkout is never touched',
  '  leg      one stage of the route, run in one session',
  '  stamp    the mark a leg leaves in the repo; how waybill knows it is done',
  '  booking  which carrier, model and effort run a leg; swappable per machine',
  '  carrier  the command a booking names for its leg',
  '  waybill  the instruction for exactly one leg, issued fresh every session',
  '',
  'COMMANDS',
  '  waybill new              begin an effort: leg 1\'s waybill, and nothing else',
  '  waybill bay <branch>     create the branch and its bay, then hand off',
  '  waybill next [<branch>]  where this docket stands, and the next leg\'s waybill',
  '  waybill status           where it stands, or the whole fleet on the trunk',
  '',
  'Why: nothing is tracked — every leg is judged by its stamp, read off the repo.',
  '     One waybill per session: the map is yours, the waybill is the handler\'s.',
  '',
  'Ride-along, glossary and reference: docs/guide/ in the waybill repo',
];

/**
 * What marks a leg done, as the route shows it. The first rule that applies wins.
 *
 * @param {import('./legs.js').Leg} leg
 * @param {import('./bookings.js').Booking} booking
 * @returns {string}
 */
function stampOf(leg, booking) {
  if (leg.owner === 'wrapper' && WRAPPER_STAMPS[leg.id]) return WRAPPER_STAMPS[leg.id];
  if (leg.progress) return 'all tasks ticked';
  if (booking.stampPath) return path.posix.basename(booking.stampPath);
  return 'repo state';
}

/**
 * One row per leg, generated from the leg model rather than from the bookings, so a leg with no
 * booking still gets its row and adding a leg changes the page with no edit here.
 *
 * @param {Map<string, import('./bookings.js').Booking>} bookings
 * @returns {string[]}
 */
function routeLines(bookings) {
  const rows = LEGS.map((leg, i) => {
    const booking = bookings.get(leg.id);
    return {
      index: String(i + 1),
      id: leg.id,
      carrier: booking?.command ?? NONE,
      stamp: booking ? stampOf(leg, booking) : NONE,
    };
  });
  const width = (key) => Math.max(...rows.map((row) => [...row[key]].length));
  const pad = (text, size) => text + ' '.repeat(size - [...text].length);
  const [index, id, carrier] = [width('index'), width('id'), width('carrier')];

  return rows.map(
    (row) =>
      `  ${row.index.padStart(index)}  ${pad(row.id, id)}  ${pad(row.carrier, carrier)}  ${row.stamp}`,
  );
}

/**
 * The one-screen reference page: the from-zero walkthrough, the route, the words, and the verbs.
 *
 * Reads booking configuration and nothing else — no branch, worktree or diff — so the page is the
 * same wherever it is asked from. It never fails over the bookings either: the operator reaches for
 * it when lost, and three-quarters of it does not depend on them. A resolution failure empties the
 * route to dashes and adds one line naming the problem rather than aborting.
 *
 * @param {string} cwd used only to resolve the bookings in force
 * @returns {string}
 */
export function renderHelp(cwd) {
  /** @type {Map<string, import('./bookings.js').Booking>} */
  let bookings;
  /** @type {string|null} */
  let problem = null;
  try {
    bookings = resolveBookings(cwd, { knownLegs: LEGS.map((leg) => leg.id) });
  } catch (error) {
    bookings = new Map();
    problem = error.message.split('\n')[0];
  }

  const lines = [
    ...INTRO,
    ...routeLines(bookings),
    ...(problem === null ? [] : [`bookings could not be read: ${problem}`]),
    ...OUTRO,
  ];
  return `${lines.join('\n')}\n`;
}
