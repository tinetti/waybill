import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from './legs.js';
import { cdLines, renderFleet, renderPosition, renderSelect, renderWaybill } from './waybill.js';
import { resolveLeg } from './inference.js';
import { fleet } from './fleet.js';
import { paperPaths, checkIgnored } from './inspection.js';
import { resolveBookings } from './bookings.js';
import { checkoutRoot, superprojectRoot } from './repo.js';
import { BayError, isInside, openBay } from './bay.js';

const USAGE = [
  'Usage: waybill <command> [options]',
  '',
  'Commands:',
  '  bay <branch>    Create the branch and its bay, then hand off the next leg',
  '  next [<branch>] Where this docket stands, and the waybill for the next leg',
  '  status          Where this docket stands, without the waybill',
  '',
  'Options:',
  '  --json            Print the raw resolved state instead of the waybill (`next` only)',
  '  --bay-dir <path>  Where bays are created (`bay` only); overrides WAYBILL_BAY_DIR and',
  '                    `git config waybill.baydir`. Relative paths resolve against the main',
  '                    checkout; the default is .claude/worktrees',
  '  --help            Print this message',
].join('\n');

/**
 * Options `next` accepts. Anything else is rejected rather than ignored: `--jsonn` silently
 * printing the human waybill would be misparsed by the very script `--json` exists for.
 */
const NEXT_FLAGS = new Set(['--json']);

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

/** The legs a booking may be declared for, resolved once per command rather than per lookup. */
const KNOWN_LEGS = { knownLegs: LEGS.map((leg) => leg.id) };

/**
 * What to call the tree the operator is standing in when it carries no docket.
 *
 * A detached HEAD has no branch, and it reads as the trunk here because `docketOpen` is false —
 * so without this the fleet header would interpolate `null` and claim `null · 2 dockets open`.
 *
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function trunkName(state) {
  return state.branch ?? 'detached HEAD';
}

/**
 * One docket's waybill, issued from outside its own bay.
 *
 * Both the bookings and the leg are resolved from the *bay*, not from the operator's tree, for the
 * reason `bay` re-resolves too (`src/cli.js:179`): a bay carries its own `.waybill/bookings`
 * overlay, and answering from the trunk would quietly hand back a waybill the docket never booked.
 * The `cd` line goes through the renderer's own block rather than a heading of this command's, so
 * it and `bay` cannot print two shapes of the same instruction.
 *
 * @param {import('./fleet.js').Docket} docket
 * @param {string} cwd where the operator actually is
 * @param {boolean} json
 * @param {{out:(text:string)=>void}} io
 * @returns {number} exit code
 */
function issueWaybill(docket, cwd, json, io) {
  const bookings = resolveBookings(docket.path, KNOWN_LEGS);
  const state = resolveLeg(docket.path, bookings);

  if (json) {
    io.out(`${JSON.stringify(state, null, 2)}\n`);
    return 0;
  }

  io.out(
    renderWaybill(
      state,
      checkIgnored(docket.path, paperPaths(bookings)),
      cdLines(docket.path, isInside(docket.path, cwd)),
    ),
  );
  return 0;
}

/**
 * The answer when no waybill could be issued: one line naming the way forward, and exit 2.
 *
 * On **stdout**, against this file's habit of putting every exit-2 message on stderr. The primary
 * consumer is the `` ! `` invocation in `commands/next.md`, which captures stdout only — a message
 * telling the operator how to proceed is useless in a stream the session never shows. Argument
 * parse errors keep stderr: those are the CLI's own complaint, not an answer about the repository.
 *
 * `--json` keeps the fleet alongside the message rather than dropping to a bare error, because
 * that array is why `status` needs no machine-readable surface of its own.
 *
 * @param {string} message without the `waybill: ` prefix
 * @param {import('./fleet.js').Docket[]} dockets what the caller could name instead
 * @param {boolean} json
 * @param {{out:(text:string)=>void}} io
 * @returns {number} exit code
 */
function noWaybill(message, dockets, json, io) {
  if (json) {
    const payload = {
      error: message,
      // A projection rather than the whole inference: this is a menu, and the state a caller acts
      // on comes back in full from the `next <branch>` that follows.
      dockets: dockets.map((docket) => ({
        branch: docket.branch,
        path: docket.path,
        leg: docket.state.leg,
        index: docket.state.index,
      })),
    };
    io.out(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    io.out(`waybill: ${message}\n`);
  }
  return 2;
}

/**
 * `waybill next [<branch>]` — resolve one docket, check the paper paths, print one waybill.
 *
 * **Exit 0 if and only if exactly one waybill was issued.** No docket to report on and more than
 * one to choose between are both "no waybill", so both exit 2 and a caller has one condition to
 * test rather than three. Inside a bay the question is unambiguous and the answer is unchanged;
 * on the trunk it is the fleet that decides, because the trunk itself carries no docket.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} exit code
 */
function next(cwd, args, io) {
  /** @type {string[]} */
  const positional = [];
  for (const arg of args) {
    // `--help` is answered by `run` before dispatch, so no option here is one we know.
    if (arg.startsWith('-')) {
      if (NEXT_FLAGS.has(arg)) continue;
      io.err(`waybill: unknown option \`${arg}\` for \`next\`\n${USAGE}\n`);
      return 2;
    }
    positional.push(arg);
  }

  const [named, ...extra] = positional;
  if (extra.length > 0) {
    io.err(`waybill: \`next\` takes at most one branch name\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  const json = args.includes('--json');
  const bookings = resolveBookings(cwd, KNOWN_LEGS);

  // A named branch is answered the same way from anywhere — the trunk, or another bay — so it is
  // resolved before the docket question is even asked. The bay is found in the enumerated fleet
  // rather than derived from the branch name: `bay` honours `--bay-dir` and the environment, and a
  // worktree git knows about is a docket wherever it happens to live on disk.
  if (named !== undefined) {
    const dockets = fleet(root, bookings);
    const docket = dockets.find((candidate) => candidate.branch === named);
    if (docket === undefined) {
      const remedy = `no bay for ${named} — cut one with \`waybill bay ${named}\``;
      return noWaybill(remedy, dockets, json, io);
    }
    return issueWaybill(docket, cwd, json, io);
  }

  const state = resolveLeg(cwd, bookings);

  if (!state.docketOpen) {
    // `root` rather than `cwd`, so a submodule's own worktrees are not enumerated for a question
    // `repoRoot` has already redirected to the superproject.
    const dockets = fleet(root, bookings);
    if (dockets.length === 0) {
      return noWaybill('no dockets open — begin one with `waybill new`', dockets, json, io);
    }
    if (dockets.length === 1) return issueWaybill(dockets[0], cwd, json, io);
    if (json) {
      const remedy = 'more than one docket open — name one with `waybill next <branch>`';
      return noWaybill(remedy, dockets, json, io);
    }
    io.out(renderSelect(trunkName(state), dockets, checkIgnored(root, paperPaths(bookings))));
    return 2;
  }

  if (json) {
    io.out(`${JSON.stringify(state, null, 2)}\n`);
    return 0;
  }

  io.out(renderWaybill(state, checkIgnored(root, paperPaths(bookings))));
  return 0;
}

/**
 * `waybill status` — the same last stamp `next` reports, with the handover left out.
 *
 * On the trunk that is the fleet: every docket in flight, each one's warnings attributed to the
 * branch they came from. Deliberately takes no options at all, `--json` included. `next --json`
 * already prints the whole resolved state and the fleet beside it, and a second machine-readable
 * surface would be a second thing to keep in step with a shape that has no reason to differ.
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

  const bookings = resolveBookings(cwd, KNOWN_LEGS);
  const state = resolveLeg(cwd, bookings);
  const inspection = checkIgnored(root, paperPaths(bookings));

  // Standing on the trunk, "where does this docket stand" has no docket to be about, and the
  // honest answer is every docket there is. Chosen by where the operator stands rather than by a
  // flag, so the verb still answers exactly one question.
  if (!state.docketOpen) {
    io.out(renderFleet(trunkName(state), fleet(root, bookings), inspection));
    return 0;
  }

  io.out(renderPosition(state, inspection));
  return 0;
}

/**
 * `waybill bay <branch>` — cut the branch and its bay, then hand off the leg that follows.
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
function bay(cwd, args, io) {
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
      io.err(`waybill: unknown option \`${arg}\` for \`bay\`\n${USAGE}\n`);
      return 2;
    }
    positional.push(arg);
  }

  const [branch, ...extra] = positional;
  if (!branch || extra.length > 0) {
    io.err(`waybill: \`bay\` takes exactly one branch name\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  /** @type {import('./bay.js').BayResult} */
  let result;
  try {
    result = openBay(branch, { cwd: root, bayDir });
  } catch (error) {
    // Only this module's own failures are operator-facing; anything else is a bug and must not be
    // dressed up as advice.
    if (!(error instanceof BayError)) throw error;
    io.err(`waybill: ${error.message}\n`);
    return 2;
  }

  const bookings = resolveBookings(result.path, KNOWN_LEGS);
  const state = resolveLeg(result.path, bookings);

  // The `cd` line itself comes from the renderer, so this block and the one a trunk-resolved
  // `next` prints cannot drift into two shapes of the same instruction. Only the heading above it
  // is `bay`'s own: this surface reports what it just created, and that block is frozen.
  const alreadyThere = isInside(result.path, cwd);
  const lines = alreadyThere
    ? [`already inside the ${branch} bay at ${result.path} — nothing to do`]
    : [
        result.created
          ? `bay created at ${result.path}`
          : `bay already exists at ${result.path}`,
        ...cdLines(result.path, alreadyThere),
      ];

  io.out(`${lines.join('\n')}\n\n`);
  io.out(renderWaybill(state, checkIgnored(result.path, paperPaths(bookings))));
  return 0;
}

/** Subcommands, as a Map so a bare `constructor` on the command line resolves to nothing. */
const COMMANDS = new Map([
  ['bay', bay],
  ['next', next],
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
