import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from './legs.js';
import { renderWaybill, renderPosition } from './waybill.js';
import { BUILTIN_BOOKINGS, resolveLeg } from './inference.js';
import { paperPaths, checkIgnored } from './inspection.js';
import { loadBookings } from './bookings.js';
import { checkoutRoot, superprojectRoot } from './repo.js';
import { BayError, isInside, startBay } from './bay.js';

const USAGE = [
  'Usage: waybill <command> [options]',
  '',
  'Commands:',
  '  next            Where this docket stands, and the waybill for the next leg',
  '  start <branch>  Create the branch and its bay, then hand off the next leg',
  '  status          Where this docket stands, without the waybill',
  '',
  'Options:',
  '  --json            Print the raw resolved state instead of the waybill (`next` only)',
  '  --bay-dir <path>  Where bays are created (`start` only); overrides WAYBILL_BAY_DIR and',
  '                    `git config waybill.baydir`. Relative paths resolve against the main',
  '                    checkout; the default is .claude/worktrees',
  '  --help            Print this message',
].join('\n');

/**
 * Options `next` accepts. Anything else is rejected rather than ignored: `--jsonn` silently
 * printing the human waybill would be misparsed by the very script `--json` exists for.
 */
const NEXT_FLAGS = new Set(['--json']);

/** Every line the CLI writes below a heading is indented by this, matching the waybill. */
const INDENT = '  ';

/**
 * The repository every subcommand answers for, or `null` once the operator has been told there is
 * none.
 *
 * `resolveLeg` deliberately never throws outside a repository — it returns a plausible-looking
 * `ideate` leg plus a warning — so the no-git case has to be caught before it, not around it. The
 * submodule redirect is applied first so the inspection, the resolved state, and any bay created
 * here all answer for one repository.
 *
 * @param {string} cwd
 * @param {{err:(text:string)=>void}} io
 * @returns {string|null} absolute path to the working tree root
 */
function repoRoot(cwd, io) {
  const root = checkoutRoot(superprojectRoot(cwd) ?? cwd);
  if (root === null) {
    io.err(
      `waybill: ${cwd} is not inside a git repository — run waybill from a repository checkout\n`,
    );
    return null;
  }
  return root;
}

/**
 * `waybill next` — resolve the leg, check the paper paths, print one waybill.
 *
 * Exit 0 whenever a leg resolved, inspection findings included: the inspection is advice and the
 * waybill is the product. Exit 2 is reserved for "there is nothing here to answer about".
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} exit code
 */
function next(cwd, args, io) {
  const unknown = args.find((arg) => !NEXT_FLAGS.has(arg));
  if (unknown !== undefined) {
    io.err(`waybill: unknown option \`${unknown}\` for \`next\`\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  const bookings = loadBookings(BUILTIN_BOOKINGS, { knownLegs: LEGS.map((leg) => leg.id) });
  const state = resolveLeg(cwd, bookings);

  if (args.includes('--json')) {
    io.out(`${JSON.stringify(state, null, 2)}\n`);
    return 0;
  }

  io.out(renderWaybill(state, checkIgnored(root, paperPaths(bookings))));
  return 0;
}

/**
 * `waybill status` — the same last stamp `next` reports, with the handover left out.
 *
 * Deliberately takes no options at all, `--json` included. `next --json` already prints the whole
 * resolved state, and a second machine-readable surface would be a second thing to keep in step
 * with a shape that has no reason to differ.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} exit code
 */
function status(cwd, args, io) {
  // `--help` is answered by `run` before dispatch, so no argument reaching here is one we know.
  if (args.length > 0) {
    io.err(`waybill: unknown option \`${args[0]}\` for \`status\`\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  const bookings = loadBookings(BUILTIN_BOOKINGS, { knownLegs: LEGS.map((leg) => leg.id) });
  const state = resolveLeg(cwd, bookings);

  io.out(renderPosition(state, checkIgnored(root, paperPaths(bookings))));
  return 0;
}

/**
 * `waybill start <branch>` — cut the branch and its bay, then hand off the leg that follows.
 *
 * Leaving the operator at a bare success message would recreate the exact gap Waybill exists to
 * close, so the waybill is printed here too. It is resolved from the *new* bay rather than from
 * `cwd`: the bay leg takes its stamp from the branch that is checked out, so asked from the
 * operator's tree the answer would still be "create a bay" — the leg just done.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} exit code
 */
function start(cwd, args, io) {
  /** @type {string[]} */
  const positional = [];
  /** @type {string|undefined} */
  let bayDir;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--bay-dir') {
      // A missing value would otherwise swallow the branch name, or the flag itself.
      bayDir = args[index + 1];
      if (bayDir === undefined || bayDir.startsWith('-')) {
        io.err(`waybill: \`--bay-dir\` takes a path\n${USAGE}\n`);
        return 2;
      }
      index += 1;
      continue;
    }
    // `--help` is answered by `run` before dispatch, so no other option here is one we know.
    if (arg.startsWith('-')) {
      io.err(`waybill: unknown option \`${arg}\` for \`start\`\n${USAGE}\n`);
      return 2;
    }
    positional.push(arg);
  }

  const [branch, ...extra] = positional;
  if (!branch || extra.length > 0) {
    io.err(`waybill: \`start\` takes exactly one branch name\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  /** @type {import('./bay.js').StartResult} */
  let result;
  try {
    result = startBay(branch, { cwd: root, bayDir });
  } catch (error) {
    // Only this module's own failures are operator-facing; anything else is a bug and must not be
    // dressed up as advice.
    if (!(error instanceof BayError)) throw error;
    io.err(`waybill: ${error.message}\n`);
    return 2;
  }

  const bookings = loadBookings(BUILTIN_BOOKINGS, { knownLegs: LEGS.map((leg) => leg.id) });
  const state = resolveLeg(result.path, bookings);

  // The one place Waybill names a shell command rather than a slash command: a tool-invoked shell
  // cannot change the operator's directory, so the move has to be theirs to make.
  const lines = isInside(result.path, cwd)
    ? [`already inside the ${branch} bay at ${result.path} — nothing to do`]
    : [
        result.created
          ? `bay created at ${result.path}`
          : `bay already exists at ${result.path}`,
        `${INDENT}cd ${result.path}`,
      ];

  io.out(`${lines.join('\n')}\n\n`);
  io.out(renderWaybill(state, checkIgnored(result.path, paperPaths(bookings))));
  return 0;
}

/** Subcommands, as a Map so a bare `constructor` on the command line resolves to nothing. */
const COMMANDS = new Map([
  ['next', next],
  ['start', start],
  ['status', status],
]);

/**
 * Argument parsing lives here and only here: `bin/waybill` is a wrapper around this function, and a
 * second parser in the wrapper would drift from it.
 *
 * @param {string[]} [argv] arguments after the program name
 * @param {{cwd?:string, out?:(text:string)=>void, err?:(text:string)=>void}} [options]
 * @returns {number} exit code
 */
export function run(argv = [], options = {}) {
  const out = options.out ?? ((text) => process.stdout.write(text));
  const err = options.err ?? ((text) => process.stderr.write(text));
  const cwd = options.cwd ?? process.cwd();
  const [name, ...args] = argv;

  // Help is answered wherever it appears, not only as the first word: `waybill next --help` is what
  // an operator types, and rendering a waybill in reply would be an answer to a different question.
  if (argv.includes('--help') || argv.includes('-h')) {
    out(`${USAGE}\n`);
    return 0;
  }
  if (name === undefined) {
    err(`${USAGE}\n`);
    return 2;
  }

  const command = COMMANDS.get(name);
  if (!command) {
    err(`waybill: unknown command \`${name}\`\n${USAGE}\n`);
    return 2;
  }
  return command(cwd, args, { out, err });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
