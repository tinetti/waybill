import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from './frontmatter.js';
import { checkoutRoot, configPath, expandTilde } from './repo.js';

/**
 * @typedef {{leg:string,command:string,model:string,effort?:string,handover?:string,
 *            argument?:'change-id'|'branch'|'none',stampPath?:string,stampCmd?:string,
 *            body:string,path:string}} Booking
 */

/**
 * The bookings Waybill ships with — the base every overlay is applied on top of. It lives in this
 * module rather than beside the inference because it is a fact about where bookings are kept, and
 * {@link resolveBookings} is the one thing that has to know it.
 */
export const BUILTIN_BOOKINGS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bookings');

export const REQUIRED = ['leg', 'command', 'model'];
export const OPTIONAL = ['effort', 'handover', 'argument', 'stampPath', 'stampCmd'];

/**
 * Which repository fact the renderer appends to `command`.
 *
 * Closed rather than free-form, and validated here rather than at render time: a booking that
 * asked for `change_id` would otherwise interpolate nothing and hand the next session a command
 * missing its argument, with nothing on screen to say why.
 */
const ARGUMENT_SOURCES = ['change-id', 'branch', 'none'];

/** Milliseconds a `stampCmd` is allowed before it is killed. */
const STAMP_TIMEOUT_MS = 10000;

/**
 * The exit code a `stampCmd` uses to say it could not answer, as distinct from answering "no".
 *
 * 125 rather than 1, because 1 is what every ordinary failing command returns and a stamp that
 * cannot reach its forge is not the same fact as a branch with no request open. Rather than 126 or
 * 127, which the shell owns, and rather than 128+n, which signals own. GNU `timeout` and `env`
 * already use 125 for exactly this meaning: the harness failed, not the thing it was asked about.
 *
 * A stamp exiting 125 may print one line of reason on stdout; it is quoted back in the warning.
 *
 * **A stamp's stdout is user-visible.** Its first line reaches the operator's terminal verbatim,
 * and from there into transcripts, screenshots and pasted issue reports. Print nothing you would
 * not show a bystander — never a token, never a URL carrying one, never the raw output of an
 * auth-status command. Waybill does not redact and cannot: it cannot tell a reason from a
 * credential.
 */
export const STAMP_UNKNOWN = 125;

/**
 * Load, validate, and index the bookings in `dir`.
 *
 * @param {string} dir directory holding `*.md` bookings
 * @param {{ knownLegs?: Iterable<string> }} [options] when `knownLegs` is given, a booking
 *   binding any other leg is rejected; the leg model that owns that list lives in a later layer.
 * @returns {Map<string, Booking>} keyed by leg
 * @throws {Error} on a malformed booking, a missing stamp, or two bookings claiming one leg
 */
export function loadBookings(dir, options = {}) {
  const known = options.knownLegs ? new Set(options.knownLegs) : null;

  /** @type {string[]} */
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return new Map();
  }

  /** @type {Map<string, Booking>} */
  const bookings = new Map();
  for (const entry of entries.filter((name) => name.endsWith('.md')).sort()) {
    const file = path.join(dir, entry);
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'), file);

    for (const key of REQUIRED) {
      if (!meta[key]) throw new Error(`${file}: missing required key \`${key}\``);
    }
    if (!meta.stampPath && !meta.stampCmd) {
      throw new Error(
        `${file}: booking must define \`stampPath\` or \`stampCmd\`; ` +
          'a leg with no stamp can never be marked done',
      );
    }
    if (known && !known.has(meta.leg)) {
      throw new Error(`${file}: unknown leg \`${meta.leg}\``);
    }
    if (meta.argument !== undefined && !ARGUMENT_SOURCES.includes(meta.argument)) {
      throw new Error(
        `${file}: unknown \`argument\` source \`${meta.argument}\`; ` +
          `expected one of ${ARGUMENT_SOURCES.join(', ')}`,
      );
    }

    const existing = bookings.get(meta.leg);
    if (existing) {
      throw new Error(`duplicate leg \`${meta.leg}\`: ${existing.path} and ${file}`);
    }

    /** @type {Booking} */
    const booking = { leg: meta.leg, command: meta.command, model: meta.model, body, path: file };
    for (const key of OPTIONAL) {
      if (meta[key] !== undefined) booking[key] = meta[key];
    }
    bookings.set(booking.leg, booking);
  }

  return bookings;
}

/**
 * The overlay directory as configured, unresolved, or `null` when nothing configures one.
 *
 * The tiers follow {@link import('./repo.js').resolveBayPath}'s for the same reason: a shell that
 * exports the variable is answering for one invocation, and the config is answering for the
 * machine. Blank is not an answer at either tier — an exported `WAYBILL_BOOKINGS_DIR=` would
 * otherwise overlay the checkout root itself and bind every leg to nothing.
 *
 * There is deliberately no CLI flag and no default: an overlay is a standing choice about how this
 * machine or this repository finishes work, not something retyped per invocation, and a default
 * would make Waybill read a directory nobody configured.
 *
 * Both tiers expand a leading `~`, by the route each one has: {@link expandTilde} for the
 * environment, git's own `--type=path` for the config.
 *
 * Exported for `waybill doctor`, which reports which overlay is in force: a second reading of
 * `WAYBILL_BOOKINGS_DIR` / `waybill.bookingsdir` over there would be free to drift from this one.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
export function configuredBookingsDir(cwd) {
  const tiers = [expandTilde(process.env.WAYBILL_BOOKINGS_DIR), configPath(cwd, 'waybill.bookingsdir')];
  return tiers.find((value) => value !== undefined && value !== null && value.trim() !== '')?.trim() ?? null;
}

/**
 * The bookings in force for `cwd`: the built-ins, with any configured overlay laid over them by leg.
 *
 * A leg the overlay binds is replaced *whole* rather than merged key by key. A booking is one
 * coherent statement — command, model, and the stamp that says when that command is finished — and
 * a merge would let an overlay change the command while silently keeping a stamp written for the
 * command it replaced. Replacement is also what `tests/booking-swap.test.js` already measures a
 * swap as.
 *
 * The overlay is validated exactly as the built-ins are, so an unknown leg or two of its own files
 * claiming one leg is an error rather than a silently dropped override. A directory that does not
 * exist is not an error: {@link loadBookings} reads it as empty, which is what an overlay pointing
 * at a machine's not-yet-created config directory should mean.
 *
 * @param {string} cwd
 * @param {{ knownLegs?: Iterable<string> }} [options] passed through to {@link loadBookings}
 * @returns {Map<string, Booking>} keyed by leg
 * @throws {Error} on a malformed booking in either the built-ins or the overlay
 */
export function resolveBookings(cwd, options = {}) {
  const builtins = loadBookings(BUILTIN_BOOKINGS, options);

  const configured = configuredBookingsDir(cwd);
  if (configured === null) return builtins;

  // Anchored on the tree the operator is actually in rather than on the main checkout, matching
  // where `stampPath` resolves its globs: in a bay, `.waybill/bookings` is the branch's own answer.
  // `checkoutRoot` returns null outside a repository, where `cwd` is the only anchor there is.
  const dir = path.resolve(checkoutRoot(cwd) ?? cwd, configured);
  return new Map([...builtins, ...loadBookings(dir, options)]);
}

/**
 * @param {string} segment
 * @returns {RegExp}
 */
function segmentToRegExp(segment) {
  const source = segment
    .split('')
    .map((char) => {
      if (char === '*') return '[^/]*';
      if (char === '?') return '[^/]';
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/**
 * @param {string} dir
 * @returns {import('node:fs').Dirent[]}
 */
function readdirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * @param {string} dir
 * @param {string[]} segments
 * @param {(absolute:string) => boolean} accept applied to a matched leaf
 * @returns {boolean}
 */
function walk(dir, segments, accept) {
  if (segments.length === 0) return fs.existsSync(dir) && accept(dir);
  const [head, ...rest] = segments;

  if (head === '**') {
    if (walk(dir, rest, accept)) return true;
    return readdirSafe(dir).some(
      (entry) => entry.isDirectory() && walk(path.join(dir, entry.name), segments, accept),
    );
  }
  if (!head.includes('*') && !head.includes('?')) return walk(path.join(dir, head), rest, accept);

  const pattern = segmentToRegExp(head);
  return readdirSafe(dir).some(
    (entry) => pattern.test(entry.name) && walk(path.join(dir, entry.name), rest, accept),
  );
}

/**
 * `stampPath`: a glob resolved relative to the repository root, matching only paths the current
 * docket introduced. Supports `*` and `?` within a segment and `**` across segments — deliberately
 * not a full glob dialect.
 *
 * The glob alone cannot tell a paper belonging to the change in flight from one that shipped long
 * ago, and matching on existence alone stamps legs from history. `changed` is the docket's own diff;
 * `null` means it could not be computed, and stamps nothing rather than falling back to existence.
 *
 * Limitation worth knowing before writing a booking: a pattern whose *last* segment is `**` can only
 * ever match a directory, and no directory is ever in `changed`, so such a pattern answers false
 * forever with nothing on screen to explain it. End the pattern with a segment that names files —
 * `docs/ideation/*` then `/contract.md`, or `.../*.md` — instead.
 *
 * @param {string} pattern
 * @param {string} repoRoot
 * @param {Set<string>|null} changed repository-relative forward-slash paths
 * @returns {boolean}
 */
export function stampedByPath(pattern, repoRoot, changed) {
  if (changed === null) return false;
  const segments = pattern.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) return false;

  return walk(repoRoot, segments, (absolute) => {
    // A directory leaf can never be a changed path, and this makes that a property rather than an
    // accident of git's output formats: `git diff --name-only` reports only files, and the one
    // directory `git ls-files --others` can emit — an untracked nested repository — arrives as
    // `vendor/sub/`, whose trailing slash no `path.relative` result below could ever equal.
    if (!fs.statSync(absolute).isFile()) return false;
    const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
    return changed.has(relative);
  });
}

/**
 * Run a `stampCmd`, separating "it ran and said no" from the two ways it can fail to answer at
 * all. Only the failures are worth reporting: a stamp that answers `false` forever with no
 * explanation is the hard-stall failure mode.
 *
 * Three outcomes, not two. `notFound` is the shell's 127 — the binary is not on `PATH`.
 * `unknown` is {@link STAMP_UNKNOWN} — the binary *is* there and said it could not answer for this
 * repository, which no exit code the shell owns can express. Both set `ran: false`, because a
 * stamp that could not answer is not a stamp that said yes; the distinction lives in the warning.
 *
 * stdout is piped rather than discarded so the 125 branch can quote the stamp's own reason. Only
 * its first line is kept, and only on 125 — an ordinary chatty stamp cannot inject text into a
 * warning. The cost: a stamp that floods stdout past `maxBuffer` now sets `result.error` and reads
 * as "could not be executed" where it previously read as a plain verdict.
 *
 * @param {string} command
 * @param {string} cwd
 * @returns {{ran:boolean, notFound:boolean, unknown:boolean, status:number|null, reason:string|null}}
 */
function runStamp(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    timeout: STAMP_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status === null) {
    return { ran: false, notFound: false, unknown: false, status: null, reason: null };
  }
  if (result.status === 127) {
    return { ran: false, notFound: true, unknown: false, status: 127, reason: null };
  }
  if (result.status === STAMP_UNKNOWN) {
    const first = (result.stdout ?? '').split('\n')[0].trim();
    return {
      ran: false,
      notFound: false,
      unknown: true,
      status: STAMP_UNKNOWN,
      reason: first === '' ? null : first,
    };
  }
  return { ran: true, notFound: false, unknown: false, status: result.status, reason: null };
}

/**
 * The word a shell would look up first — the best available guess at which binary was missing.
 *
 * @param {string} command
 * @returns {string}
 */
function binaryOf(command) {
  return command.trim().split(/\s+/)[0];
}

/**
 * The one wording for a stamp that could not run, so the two call sites cannot drift apart.
 *
 * "missing binary" rather than the shell's own "command not found": the latter reads as if the
 * stamp answered no, and this is the case where it never answered at all. The full command follows
 * the binary name because `shell: true` means 127 can come from any word in a pipeline — naming the
 * first word is a guess, and printing both makes a wrong guess checkable rather than misleading.
 *
 * Three wordings, deliberately distinct. "missing binary" is 127 and nothing else — a stamp naming
 * a command this machine does not have. "could not answer" is {@link STAMP_UNKNOWN}, where the
 * binary ran and reported that it cannot speak for this repository; the stamp's own reason is
 * quoted, falling back to the command when it printed nothing. "could not be executed" is
 * everything left: a spawn failure, the timeout, a signal.
 *
 * @param {string} prefix '' from {@link stampedByCmd}, `${label}: ` from {@link evaluateBooking}
 * @param {string} command
 * @param {{ran:boolean, notFound:boolean, unknown:boolean, status:number|null, reason:string|null}} result
 * @returns {string}
 */
function stampWarning(prefix, command, result) {
  if (result.notFound) return `${prefix}stampCmd missing binary \`${binaryOf(command)}\`: ${command}`;
  if (result.unknown) return `${prefix}stampCmd could not answer: ${result.reason ?? command}`;
  return `${prefix}stampCmd could not be executed: ${command}`;
}

/**
 * `stampCmd`: judged by exit code alone. A stamp never throws, because one broken booking must not
 * stop inference.
 *
 * A stamp that could not answer — missing binary (exit 127), {@link STAMP_UNKNOWN}, spawn failure,
 * timeout — is still not-done, but it says so through `warnings` rather than silently: a stamp
 * naming a binary this machine does not have, or a forge CLI that cannot speak for this
 * repository, would otherwise stall a leg forever with no explanation. Only an ordinary non-zero
 * exit is silent, because that is a stamp that ran and honestly said "not finished yet".
 *
 * stdout does not decide the verdict, but it is no longer discarded: see {@link STAMP_UNKNOWN} for
 * the one line that reaches the operator, and why a stamp author must treat it as public.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {string[]} [warnings] collected in place; a stamp that could not run at all says so here
 * @returns {boolean}
 */
export function stampedByCmd(command, cwd, warnings = []) {
  const result = runStamp(command, cwd);
  if (!result.ran) warnings.push(stampWarning('', command, result));
  return result.ran && result.status === 0;
}

/**
 * Evaluate a booking's stamps. Both must pass when both are present — there are no boolean
 * combinators and no expression language by design.
 *
 * The rule lives once, in {@link evaluateBooking}; this is the verdict without the warnings, for
 * callers that have nothing to report them to. Two copies of "both must pass, path first" would
 * drift.
 *
 * @param {Pick<Booking,'stampPath'|'stampCmd'>} booking
 * @param {string} repoRoot
 * @param {Set<string>|null} changed repository-relative forward-slash paths
 * @returns {boolean}
 */
export function bookingIsDone(booking, repoRoot, changed) {
  return evaluateBooking(booking, repoRoot, changed).done;
}

/**
 * The booking's verdict, plus the warnings a caller needs to explain a leg that never completes.
 * A stamp that cannot be executed at all — missing binary, spawn failure, timeout — is still
 * not-done, but silently so it would look identical to honest work remaining.
 *
 * @param {Booking} booking
 * @param {string} repoRoot
 * @param {Set<string>|null} changed repository-relative forward-slash paths
 * @returns {{done:boolean, warnings:string[]}}
 */
export function evaluateBooking(booking, repoRoot, changed) {
  /** @type {string[]} */
  const warnings = [];
  const label = booking.path ?? `<${booking.leg}>`;
  let checked = false;
  let done = true;

  if (booking.stampPath) {
    checked = true;
    try {
      done = stampedByPath(booking.stampPath, repoRoot, changed);
    } catch (error) {
      warnings.push(`${label}: stampPath failed: ${error.message}`);
      done = false;
    }
  }

  if (done && booking.stampCmd) {
    checked = true;
    const result = runStamp(booking.stampCmd, repoRoot);
    if (!result.ran) {
      warnings.push(stampWarning(`${label}: `, booking.stampCmd, result));
      done = false;
    } else {
      done = result.status === 0;
    }
  }

  return { done: checked && done, warnings };
}
