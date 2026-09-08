import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Run git and return its trimmed stdout, or `null` when git fails for any reason.
 * Queries never throw: a fresh `git init` with no commits and a directory outside any repository
 * are both expected states for a tool that inspects whatever repo it is pointed at.
 *
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string|null}
 */
function tryGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Absolute path to the main checkout — the anchor every derived path hangs off.
 *
 * Ported from `git-main-worktree` (tinetti_dev_tools/files/zsh/git.zsh:115-117), but the literal
 * `worktree ` prefix is sliced rather than split on whitespace so paths containing spaces survive.
 *
 * @param {string} cwd
 * @returns {string} absolute path
 * @throws {Error} when `cwd` is not inside a git repository
 */
export function mainCheckout(cwd) {
  const listing = tryGit(cwd, ['worktree', 'list', '--porcelain']);
  const first = listing?.split('\n').find((line) => line.startsWith('worktree '));
  if (!first) throw new Error(`not a git repository: ${cwd}`);
  return first.slice('worktree '.length);
}

/** Where bays go when nothing says otherwise: inside the main checkout, beside the other tooling. */
const DEFAULT_BAY_DIR = '.claude/worktrees';

/**
 * The directory bays are created in, as configured — an absolute path, or one relative to the main
 * checkout. Left unresolved here so {@link resolveBayPath} can spend a single `mainCheckout` call.
 *
 * The env var wins over the git config for the usual reason: a shell that exports it is answering
 * for one invocation, and the config is answering for the machine. Blank is not an answer at
 * either tier — `WAYBILL_BAY_DIR=` would otherwise resolve every bay onto the checkout root itself.
 *
 * @param {string} cwd
 * @param {string} [override] a value from the caller, ahead of both tiers
 * @returns {string}
 */
function configuredBayDir(cwd, override) {
  const tiers = [override, process.env.WAYBILL_BAY_DIR, tryGit(cwd, ['config', '--get', 'waybill.baydir'])];
  return tiers.find((value) => value !== undefined && value !== null && value.trim() !== '')?.trim() ?? DEFAULT_BAY_DIR;
}

/**
 * Where a branch's bay lives: the configured container directory, holding a directory named for the
 * main checkout and the branch, with every `/` flattened to `-`.
 *
 * The name keeps `gwt`'s shape (git.zsh:267-288) even though the container no longer has to be the
 * parent directory, and that is the point: `waybill.baydir=..` reproduces the sibling paths `gwt`
 * produced, exactly, so the old convention is a setting rather than a thing that was taken away.
 *
 * @param {string} branch
 * @param {string} cwd
 * @param {{bayDir?:string}} [options] `bayDir` overrides `WAYBILL_BAY_DIR` and `waybill.baydir`
 * @returns {string} absolute path
 */
export function resolveBayPath(branch, cwd, options = {}) {
  const main = mainCheckout(cwd);
  // `resolve` rather than `join`: an absolute setting is the container as it stands, and a relative
  // one is anchored to the main checkout rather than to whatever directory the operator is in.
  const container = path.resolve(main, configuredBayDir(cwd, options.bayDir));
  return path.join(container, `${path.basename(main)}-${branch.replace(/\//g, '-')}`);
}

/**
 * The checked-out branch, or `null` on a detached HEAD or outside a repository.
 *
 * `git symbolic-ref` is used rather than `rev-parse --abbrev-ref HEAD`, which exits 128 in a
 * repository with zero commits.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
export function currentBranch(cwd) {
  return tryGit(cwd, ['symbolic-ref', '--short', 'HEAD']);
}

/**
 * True when the repository has an `origin` remote.
 *
 * @param {string} cwd
 * @returns {boolean}
 */
export function hasRemote(cwd) {
  return tryGit(cwd, ['remote', 'get-url', 'origin']) !== null;
}

/**
 * The branch new work forks from: `origin/HEAD` when the remote publishes one, otherwise the
 * current branch. Never fetches — fetching is a side effect belonging to the bay command,
 * not to a query inference calls repeatedly.
 *
 * @param {string} cwd
 * @returns {string|null}
 */
export function defaultBranch(cwd) {
  const head = tryGit(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^origin\//, '');
  return currentBranch(cwd);
}

/** How many superproject hops are walked before the chain is treated as pathological. */
const MAX_SUBMODULE_DEPTH = 16;

/**
 * The outermost superproject working tree containing `cwd`, or `null` when `cwd` is not inside a
 * submodule at all.
 *
 * The chain is walked to the top rather than hopped once: a submodule of a submodule would
 * otherwise still answer for the wrong repository, which is the whole point of asking.
 *
 * @param {string} cwd
 * @returns {string|null} absolute path, or `null` when there is no superproject
 */
export function superprojectRoot(cwd) {
  let current = cwd;
  for (let hop = 0; hop < MAX_SUBMODULE_DEPTH; hop += 1) {
    const parent = tryGit(current, ['rev-parse', '--show-superproject-working-tree']);
    if (!parent) return hop === 0 ? null : current;
    current = parent;
  }
  return current;
}

/**
 * True when `cwd` sits in a bay — a linked git worktree — rather than in the main checkout.
 *
 * A submodule also has a git-dir distinct from its superproject's, so the superproject check comes
 * first — otherwise a submodule would anchor bay paths to the wrong repository.
 *
 * @param {string} cwd
 * @returns {boolean}
 */
export function inBay(cwd) {
  const superproject = tryGit(cwd, ['rev-parse', '--show-superproject-working-tree']);
  if (superproject === null || superproject !== '') return false;

  const dirs = tryGit(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
  if (dirs === null) return false;
  const [gitDir, commonDir] = dirs.split('\n');
  return Boolean(gitDir) && Boolean(commonDir) && gitDir !== commonDir;
}

/**
 * The working tree root of `cwd` — the bay's own root when inside one.
 *
 * This is not interchangeable with {@link mainCheckout}: stamps resolve their globs against
 * the tree the operator is actually editing, while the main checkout is only the anchor derived
 * paths hang off.
 *
 * @param {string} cwd
 * @returns {string|null} absolute path, or `null` outside a repository
 */
export function checkoutRoot(cwd) {
  return tryGit(cwd, ['rev-parse', '--show-toplevel']);
}

/**
 * True when every commit on `branch` is already contained in `base`.
 *
 * `--format` is used rather than parsing `git branch`'s decorated output, whose leading `* ` marker
 * and `+ ` worktree marker would otherwise have to be stripped by hand.
 *
 * @param {string} branch
 * @param {string} base
 * @param {string} cwd
 * @returns {boolean}
 */
export function isMerged(branch, base, cwd) {
  const listing = tryGit(cwd, ['branch', '--merged', base, '--format=%(refname:short)']);
  if (listing === null) return false;
  return listing.split('\n').some((line) => line.trim() === branch);
}
