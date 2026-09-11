import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEGS } from './legs.js';
import {
  cdLines,
  renderBaySelect,
  renderFleet,
  renderPosition,
  renderSelect,
  renderWaybill,
} from './waybill.js';
import { resolveLeg } from './inference.js';
import { fleet } from './fleet.js';
import { paperPaths, checkIgnored } from './inspection.js';
import { resolveBookings } from './bookings.js';
import { checkoutRoot, defaultBranch, isValidBranch, mainCheckout, superprojectRoot } from './repo.js';
import { BayError, isInside, openBay } from './bay.js';
import { bayCandidates, rankBranches } from './picker.js';
import { gatherSignals } from './signals.js';

/**
 * @typedef {{out:(text:string)=>void, err:(text:string)=>void,
 *            signals:()=>import('./signals.js').Signals}} Io
 *   `signals` is a thunk rather than a value so the terminal is only read by the one command that
 *   ranks by it — every other verb would otherwise pay a tmux round-trip for nothing.
 */

const USAGE = [
  'Usage: waybill <command> [options]',
  '',
  'Commands:',
  // Route-table order rather than alphabetical, matching the order an effort actually goes through:
  // begin it, cut its bay, ask what comes next, ask where it stands.
  '  new             Begin an effort: the first leg\'s waybill, and nothing else',
  '  bay <branch>    Create the branch and its bay, then hand off the next leg',
  '  next [<branch>] Where this docket stands, and the waybill for the next leg',
  '  status          Where this docket stands, without the waybill',
  '',
  'Options:',
  '  --json            Print the raw resolved state instead of the waybill (`next` only)',
  '  --list            List the branches a bay could be cut or reopened for, and change',
  '                    nothing (`bay` only, and instead of a branch name)',
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
 * Leg 1's state, whichever tree the question was asked from.
 *
 * On the trunk `resolveLeg` already answers leg 1 — nothing stamps from history alone there — so its
 * result is passed through untouched, and the block stays byte-for-byte what the trunk used to print
 * in reply to `next`. Inside a bay it answers for that bay's docket instead, which is a different
 * question, so the first leg is rebuilt here.
 *
 * Rebuilt rather than resolved: `src/inference.js` is deliberately not opened by this change, and a
 * `resolveFirstLeg` exported from it would be one more caller of a module whose whole contract is
 * "infer from the repository". Nothing about leg 1 is inferred — it is where every effort starts.
 *
 * The branch is the *trunk's*, not the bay's. `feat/x · no docket open` would be a false claim about
 * a branch that plainly carries one, and `feat/x · leg 1 of 7 (ideate)` a false claim about where
 * that docket stands; this waybill belongs to the trunk, and the warning says why it was printed
 * here anyway. The warning rides in `state.warnings` rather than going to stderr so it lands in the
 * block's own `WARNINGS:` section — the `` ! `` invocation captures stdout only.
 *
 * @param {string} cwd
 * @param {string} root the working tree root {@link repoRoot} resolved
 * @param {Map<string, import('./bookings.js').Booking>} bookings
 * @returns {import('./inference.js').Inference}
 */
function firstLeg(cwd, root, bookings) {
  const state = resolveLeg(cwd, bookings);
  if (!state.docketOpen) return state;

  return {
    leg: LEGS[0].id,
    index: 1,
    completed: [],
    skipped: [],
    booking: bookings.get(LEGS[0].id),
    branch: defaultBranch(root),
    docketOpen: false,
    changeId: null,
    warnings: [
      ...state.warnings,
      `new efforts begin on the trunk, and ${state.branch} already carries a docket — this is ` +
        'still leg 1\'s waybill, and the ideate leg writes nothing to disk wherever it is run',
    ],
  };
}

/**
 * `waybill new` — begin an effort: leg 1's waybill, and nothing else.
 *
 * The block is the one the trunk used to answer `next` with, moved to the verb that means it. In a
 * terminal that is the whole command: printing a waybill is all a CLI can do, because it has no
 * session to invoke anything in. `/waybill:new` shows the same block and then runs what it names.
 *
 * No exit contract of its own, and no branch to take: the fleet cannot change the answer, because
 * `new` is asked before there is a docket to be ambiguous about. Every argument is rejected for the
 * reason `status` rejects them — `next --json` is the one machine-readable surface, and a second one
 * would be another shape to keep in step.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} exit code
 */
function begin(cwd, args, io) {
  // `--help` is answered by `run` before dispatch, so no argument reaching here is one we know.
  if (args.length > 0) {
    io.err(`waybill: unknown option \`${args[0]}\` for \`new\`\n${USAGE}\n`);
    return 2;
  }

  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  const bookings = resolveBookings(cwd, KNOWN_LEGS);
  const state = firstLeg(cwd, root, bookings);

  io.out(renderWaybill(state, checkIgnored(root, paperPaths(bookings))));
  return 0;
}

/**
 * `waybill bay --list` — the branches a bay could be cut or reopened for, ordered by what the
 * terminal says is being worked on, and nothing changed.
 *
 * It exists for `/waybill:bay` typed with no argument: a session can offer these as a menu, where
 * a bare `bay` could only fail. That failure is still what the CLI gives a bare `bay` — the verb's
 * contract is one branch or a usage error, and a terminal user who forgot the name is better served
 * by being told than by a listing they did not ask for.
 *
 * Exit 0 even when there is nothing to list, since "no branches besides the trunk" is a complete
 * answer rather than a failure, and the `` ! `` invocation that asks drops its Task on a non-zero
 * exit. Everything goes to stdout, which is the only stream that invocation shows.
 *
 * @param {string} cwd
 * @param {Io} io
 * @returns {number} exit code
 */
function listBranches(cwd, io) {
  const root = repoRoot(cwd, io);
  if (root === null) return 2;

  const base = defaultBranch(root);
  const rows = rankBranches(bayCandidates(root), io.signals(), {
    base,
    repoName: path.basename(mainCheckout(root)),
    isValidBranch: (name) => isValidBranch(root, name),
  });
  io.out(renderBaySelect(base, rows));
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
 * `--list` is the one other thing `bay` answers, and it answers it instead of a branch rather than
 * alongside one — see {@link listBranches}.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @param {Io} io
 * @returns {number} exit code
 */
function bay(cwd, args, io) {
  /** @type {string[]} */
  const positional = [];
  /** @type {string|undefined} */
  let bayDir;
  let list = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--list') {
      list = true;
      continue;
    }
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

  if (list) {
    // Rejected rather than ignored. A branch beside `--list` is two requests, and answering either
    // one silently drops the other. `--bay-dir` would do nothing at all: the list finds bays wherever
    // git has them registered, not where the setting says new ones go — so accepting it would let
    // an operator believe the listing had been narrowed to that directory when it had not.
    if (positional.length > 0 || bayDir !== undefined) {
      io.err(`waybill: \`--list\` takes no branch name and no \`--bay-dir\`\n${USAGE}\n`);
      return 2;
    }
    return listBranches(cwd, io);
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

/**
 * Subcommands, as a Map so a bare `constructor` on the command line resolves to nothing.
 *
 * `new` is a reserved word, so the verb and its handler are the one pair here that cannot share a
 * name — the key is what the operator types, and `begin` is what JavaScript will accept.
 */
const COMMANDS = new Map([
  ['new', begin],
  ['bay', bay],
  ['next', next],
  ['status', status],
]);

/**
 * Argument parsing lives here and only here: `bin/waybill` is a wrapper around this function, and a
 * second parser in the wrapper would drift from it.
 *
 * `signals` is injected alongside the streams because it is the same kind of thing: something
 * outside the repository that a test must be able to replace. Left to itself, `bay --list` reads
 * the real tmux window and shell history, and a suite run inside tmux would order its menus by
 * whatever the developer happened to be doing.
 *
 * @param {string[]} [argv] arguments after the program name
 * @param {{cwd?:string, out?:(text:string)=>void, err?:(text:string)=>void,
 *          signals?:()=>import('./signals.js').Signals}} [options]
 * @returns {number} exit code
 */
export function run(argv = [], options = {}) {
  const out = options.out ?? ((text) => process.stdout.write(text));
  const err = options.err ?? ((text) => process.stderr.write(text));
  const signals = options.signals ?? (() => gatherSignals());
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
  return command(cwd, args, { out, err, signals });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
