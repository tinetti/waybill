import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { defaultBranch, hasRemote, mainCheckout, resolveBayPath } from './repo.js';

/**
 * @typedef {{path:string, created:boolean, branchCreated:boolean, base:string|null}} StartResult
 *   `base` is the ref the branch was cut from, and `null` whenever nothing was cut — a no-op, an
 *   existing bay, or a branch that already existed. Naming a base in those cases would be an
 *   invention: no ref was chosen, and the caller would have no way to tell the difference.
 */

/**
 * A failure the operator can act on, as opposed to a bug in Waybill.
 *
 * This module is the first in `src/` that mutates the repository, and neither existing error tier
 * fits it: queries never throw because "I do not know" is a legitimate answer, and loaders throw
 * `file:line:` because a malformed booking is a programming error. A bay that could not be
 * created is neither — it is a real failure with a real remedy, and the CLI is still the only layer
 * allowed to write to a stream or choose an exit code. Every message here therefore states what
 * failed and then, after an em dash, what to do about it.
 */
export class BayError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'BayError';
  }
}

/**
 * Run git and report status alongside both streams.
 *
 * Deliberately not {@link import('./repo.js')}'s `tryGit`: that one collapses every failure to
 * `null`, which is right for a query and useless here, where git's own first line of stderr is the
 * only thing that can explain a refused mutation.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ok:boolean, stdout:string, stderr:string}}
 */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error) return { ok: false, stdout: '', stderr: result.error.message };
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/**
 * @param {string} text
 * @returns {string}
 */
function firstLine(text) {
  return text.split('\n')[0].replace(/^fatal:\s*/, '').trim();
}

/**
 * @typedef {{path:string, branch:string|null, prunable:boolean}} WorktreeRecord
 */

/**
 * Every worktree git has registered, including ones whose directory has since been deleted — those
 * carry a `prunable` line, and conflating them with live ones is what turns the idempotence guard
 * into a `cd` into nothing.
 *
 * @param {string} cwd
 * @returns {WorktreeRecord[]}
 */
function listWorktrees(cwd) {
  const listing = git(cwd, ['worktree', 'list', '--porcelain']);
  if (!listing.ok) return [];

  /** @type {WorktreeRecord[]} */
  const records = [];
  for (const line of listing.stdout.split('\n')) {
    // The `worktree ` prefix is sliced rather than split on whitespace so paths with spaces survive.
    if (line.startsWith('worktree ')) {
      records.push({ path: line.slice('worktree '.length), branch: null, prunable: false });
      continue;
    }
    const current = records[records.length - 1];
    if (!current) continue;
    if (line.startsWith('branch refs/heads/')) current.branch = line.slice('branch refs/heads/'.length);
    if (line === 'prunable' || line.startsWith('prunable ')) current.prunable = true;
  }
  return records;
}

/**
 * Whether `cwd` is `target` or sits somewhere beneath it.
 *
 * Exported because the CLI asks the same question to decide whether printing a `cd` line would be
 * telling the operator to go where they already are.
 *
 * The comparison is made against the resolved path: on macOS the temp root reached through `/var`
 * and the one git reports through `/private/var` are the same directory, and a raw string compare
 * would call a no-op a fresh create.
 *
 * @param {string} target
 * @param {string} cwd
 * @returns {boolean}
 */
export function isInside(target, cwd) {
  let real;
  try {
    real = fs.realpathSync(cwd);
  } catch {
    real = path.resolve(cwd);
  }
  const relative = path.relative(target, real);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Keep a bay that lives inside the main checkout from reading as untracked work.
 *
 * A nested worktree is not merely noise in `git status`: it carries a `.git` file, so `git add -A`
 * stages it as an embedded repository. The line therefore goes in `.git/info/exclude` rather than
 * `.gitignore` — the host repository's ignore file is tracked, and Waybill is a guest that must
 * never commit anything to it. That file lives in the *common* git dir, which is why the path is
 * asked for rather than assumed: run from inside a bay, `--git-dir` would point at the linked
 * worktree's private directory, where nothing reads an exclude file.
 *
 * A container outside the checkout is git's business, not ours, and is left alone.
 *
 * Exported so anything creating a bay by hand can make the same guarantee.
 *
 * @param {string} cwd
 * @param {string} container the directory bays are created in
 * @returns {void}
 */
export function ensureBayIgnored(cwd, container) {
  let relative;
  try {
    relative = path.relative(mainCheckout(cwd), container);
  } catch {
    return;
  }
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return;

  const commonDir = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!commonDir.ok) return;

  const file = path.join(commonDir.stdout, 'info', 'exclude');
  // Anchored and trailing-slashed: this ignores the one container directory, not every path
  // anywhere in the tree that happens to share its name.
  const line = `/${relative.split(path.sep).join('/')}/`;
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing.split('\n').some((entry) => entry.trim() === line)) return;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${existing === '' || existing.endsWith('\n') ? '' : '\n'}${line}\n`);
}

/**
 * The ref a brand-new branch is cut from.
 *
 * `gwt` always uses `origin/<default>` and always fetches; both are wrong in a repository with no
 * remote, which is the shape Waybill's own repository has. And `defaultBranch` answers with the
 * *current* branch when origin publishes no HEAD, so the composed ref is verified rather than
 * trusted — an unverified `origin/<whatever branch you happen to be on>` either fails obscurely or,
 * worse, resolves to the wrong commit.
 *
 * @param {string} cwd
 * @param {string} [requested] an explicit base from the caller
 * @returns {string}
 * @throws {BayError} when no base can be established
 */
function resolveBase(cwd, requested) {
  if (requested !== undefined) {
    if (!resolves(cwd, requested)) {
      throw new BayError(
        `base ref \`${requested}\` does not resolve to a commit — fetch it first, or name one that exists`,
      );
    }
    return requested;
  }

  if (!hasRemote(cwd)) return 'HEAD';

  // Best effort: an unreachable origin is not a reason to refuse when the ref is already local, and
  // a fetch that did work is what makes an as-yet-unfetched default branch resolvable below.
  git(cwd, ['fetch', '--quiet', 'origin']);

  const name = defaultBranch(cwd);
  const base = name === null ? null : `origin/${name}`;
  if (base === null || !resolves(cwd, base)) {
    throw new BayError(
      "cannot determine origin's default branch — run `git remote set-head origin -a`, " +
        'or pass an explicit base ref',
    );
  }
  return base;
}

/**
 * @param {string} cwd
 * @param {string} ref
 * @returns {boolean}
 */
function resolves(cwd, ref) {
  return git(cwd, ['rev-parse', '--quiet', '--verify', `${ref}^{commit}`]).ok;
}

/**
 * Create `branch` and its bay at the configured path, and report where it is.
 *
 * A port of `gwt` (tinetti_dev_tools/files/zsh/git.zsh:265-289) with the three properties a shell
 * function invoked by hand never needed: it is idempotent, it is a no-op from inside the target,
 * and it works in a repository with no remote. The path derivation is not re-done here — inference
 * needs the same convention, so it lives in {@link resolveBayPath} and is consumed.
 *
 * The one thing deliberately *not* ported is `gwt`'s trailing `cd`: a tool-invoked shell cannot
 * change the operator's directory, so the path is returned and the CLI prints it instead.
 *
 * @param {string} branch
 * @param {{cwd:string, base?:string, bayDir?:string}} opts
 * @returns {StartResult}
 * @throws {BayError} on every failure, each carrying its own remedy
 */
export function startBay(branch, opts) {
  const { cwd } = opts;

  if (!branch || branch.trim() === '') {
    throw new BayError('no branch name given — name the branch to start, for example `feat/thing`');
  }
  // Checked before anything is resolved or mutated: this rejects `feat/x y`, `feat/..x` and
  // flag-shaped names alike, so nothing operator-supplied ever reaches `git worktree add`'s parser.
  if (!git(cwd, ['check-ref-format', '--branch', branch]).ok) {
    throw new BayError(
      `\`${branch}\` is not a valid branch name — git will not accept it; try one like \`feat/thing\``,
    );
  }

  let target;
  try {
    target = resolveBayPath(branch, cwd, { bayDir: opts.bayDir });
  } catch {
    throw new BayError(`${cwd} is not inside a git repository — run this from a repository checkout`);
  }

  // Before the idempotence guards rather than after the create: a second `start` is exactly when an
  // exclude line someone dropped should come back, and it costs nothing when it is already there.
  ensureBayIgnored(cwd, path.dirname(target));

  // The operator ran it twice, or ran it where they already are. Neither is a mistake worth
  // punishing, and creating anything here would nest a worktree inside a worktree.
  if (isInside(target, cwd)) return { path: target, created: false, branchCreated: false, base: null };

  const registered = listWorktrees(cwd);
  const here = registered.find((record) => record.path === target);
  if (here) {
    if (here.prunable || !fs.existsSync(target)) {
      throw new BayError(
        `${target} is registered as a worktree but is not on disk — run \`git worktree prune\` and try again`,
      );
    }
    return { path: target, created: false, branchCreated: false, base: null };
  }
  if (fs.existsSync(target)) {
    throw new BayError(
      `${target} already exists and is not a worktree — move or remove it, then start the branch again`,
    );
  }

  // Includes the main checkout, which is the likeliest case of all: standing on the feature branch
  // and asking for its bay. git's own message names the path but not the way out.
  const elsewhere = registered.find((record) => record.branch === branch);
  if (elsewhere) {
    throw new BayError(
      `\`${branch}\` is already checked out at ${elsewhere.path} — switch that checkout to another ` +
        'branch first, or start a differently named branch',
    );
  }

  // Positive pre-check rather than a reliance on git failing: given no base ref, `git worktree add`
  // infers `--orphan` on an unborn HEAD and *succeeds*, leaving a worktree with no history at all.
  if (!git(cwd, ['rev-parse', '--quiet', '--verify', 'HEAD']).ok) {
    throw new BayError(
      'this repository has no commits yet — make an initial commit first, then start the bay',
    );
  }

  const branchExists = git(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  const base = branchExists ? null : resolveBase(cwd, opts.base);

  // `--no-track` for `gwt`'s reason: a new branch tracking origin/<default> makes `git pull` in the
  // new bay try to merge the default branch into the feature branch.
  const added = branchExists
    ? git(cwd, ['worktree', 'add', target, branch])
    : git(cwd, ['worktree', 'add', '--no-track', '-b', branch, target, base]);
  if (!added.ok) {
    throw new BayError(`could not create the bay at ${target} — git said: ${firstLine(added.stderr)}`);
  }

  return { path: target, created: true, branchCreated: !branchExists, base };
}
