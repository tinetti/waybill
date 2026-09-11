import { defaultBranch, listWorktrees, localBranches } from './repo.js';

/**
 * @typedef {{branch:string, bay:string|null}} Candidate
 *   `bay` is the path of the live worktree that has the branch checked out, or `null` when there is
 *   none and `waybill bay <branch>` would cut one.
 */

/**
 * @typedef {{branch:string, bay:string|null, isNew:boolean, reason:string|null}} BranchRow
 *   One line of the `bay --list` menu. `isNew` marks a branch that does not exist yet — suggested
 *   from the terminal, and cut from scratch if chosen. `reason` names the signal that promoted the
 *   row, and is `null` for a row sitting where plain git order put it.
 */

/**
 * Every branch `waybill bay` could be pointed at: every local branch but the trunk, those with no
 * bay first, each group in git's own order.
 *
 * No bay first because that is what the verb is *for* — cutting one. A branch that already has a
 * bay is still listed, since `bay` on it is a clean no-op that prints the `cd` line, but it is the
 * less likely reason to have typed the command.
 *
 * A bay is judged the way {@link import('./fleet.js').fleet} judges a docket: a linked worktree
 * whose directory still exists. One git has registered but whose directory is gone reads as no bay,
 * because there is nothing there to `cd` into.
 *
 * The branch the main checkout has checked out is left out, as well as the trunk. git refuses to
 * check one branch out twice, so `bay` on it fails with a remedy — and a menu should not offer an
 * option whose only outcome is an error.
 *
 * @param {string} cwd anywhere in the repository
 * @returns {Candidate[]}
 */
export function bayCandidates(cwd) {
  const base = defaultBranch(cwd);
  const [main, ...linked] = listWorktrees(cwd);
  const bays = new Map(
    linked
      .filter((record) => record.branch !== null && !record.prunable)
      .map((record) => [record.branch, record.path]),
  );

  const candidates = localBranches(cwd)
    .filter((branch) => branch !== base && branch !== main?.branch)
    .map((branch) => ({ branch, bay: bays.get(branch) ?? null }));
  return [
    ...candidates.filter((candidate) => candidate.bay === null),
    ...candidates.filter((candidate) => candidate.bay !== null),
  ];
}

/**
 * How strongly each kind of signal says "this is the branch", strongest first.
 *
 * The **window** leads because it is the one name that is both local to this pane and usually
 * chosen by hand for the task in it. **History** comes next: it records what was actually typed,
 * but it is shared by every shell on the machine, so it says what the operator has been doing, not
 * what this terminal is for. The **session** is typically named for a project rather than a task,
 * and the **pane title** last of all, because programs set it for themselves and tmux defaults it
 * to the host name.
 */
const SIGNAL_RANK = { window: 0, history: 1, session: 2, pane: 3 };

/**
 * Names tmux gives a window automatically — `automatic-rename` titles it after whatever is running
 * — or that a person uses for a window that is not about any one piece of work. None of them is a
 * branch anybody meant.
 */
const GENERIC_WINDOWS = new Set([
  'aider', 'bash', 'btop', 'bun', 'cargo', 'claude', 'codex', 'dash', 'default', 'deno', 'docker',
  'emacs', 'fish', 'git', 'go', 'htop', 'ksh', 'lazygit', 'less', 'login', 'make', 'man', 'nano',
  'node', 'npm', 'npx', 'nu', 'nvim', 'pnpm', 'python', 'python3', 'ruby', 'sh', 'ssh', 'tail',
  'tcsh', 'tmux', 'top', 'vi', 'vim', 'watch', 'yarn', 'zsh',
]);

/** What a window name must look like, once normalized, to be taken for a branch slug at all. */
const SLUG = /^[a-z0-9][a-z0-9._/-]*$/;

/**
 * One spelling for a name however it was typed: lower case, and every run of spaces, `-` and `_`
 * collapsed to a single `-`. A window titled `Stamp Scoping` and a branch named `fix/stamp_scoping`
 * are plainly the same piece of work.
 *
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text.trim().toLowerCase().replace(/[\s_-]+/g, '-');
}

/**
 * Every spelling of a branch a terminal name could match: the whole name, the whole name flattened
 * to a slug the way bay directories flatten it, and the last path segment — `bay-picker` is what a
 * person calls `feat/bay-picker` when naming a window after it.
 *
 * @param {string} branch
 * @returns {Set<string>}
 */
function spellings(branch) {
  const whole = normalize(branch);
  return new Set([whole, whole.replace(/\//g, '-'), normalize(branch.split('/').pop() ?? '')]);
}

/**
 * The strongest signal that names `branch`, as a sort key and the words that explain it.
 *
 * Checked in {@link SIGNAL_RANK} order, so the first hit is the best one and the row is labelled
 * by the signal it is ranked by.
 *
 * @param {string} branch
 * @param {import('./signals.js').Signals} signals
 * @returns {{key:[number, number], reason:string}|null}
 */
function strongest(branch, signals) {
  const names = spellings(branch);
  const tmux = (kind) => {
    const value = signals.tmux?.[kind] ?? '';
    return normalize(value) !== '' && names.has(normalize(value)) ? value : null;
  };

  const window = tmux('window');
  if (window !== null) return { key: [SIGNAL_RANK.window, 0], reason: `tmux window "${window}"` };
  const recency = signals.history.indexOf(branch);
  if (recency !== -1) return { key: [SIGNAL_RANK.history, recency], reason: 'shell history' };
  const session = tmux('session');
  if (session !== null) return { key: [SIGNAL_RANK.session, 0], reason: `tmux session "${session}"` };
  const pane = tmux('pane');
  if (pane !== null) return { key: [SIGNAL_RANK.pane, 0], reason: `tmux pane "${pane}"` };
  return null;
}

/**
 * A branch that does not exist yet, named after the tmux window, or `null` when the window does
 * not name one.
 *
 * Only the window is asked. History cannot suggest: a `checkout -b` for a branch that no longer
 * exists is a branch that was merged or thrown away, not one waiting to be cut. And the session and
 * pane title are, per {@link SIGNAL_RANK}, rarely about one piece of work.
 *
 * A bare slug gets `feat/` in front, since that is the prefix most work is cut under; a window that
 * already carries a prefix — `fix/flaky-clock` — is taken as written.
 *
 * @param {import('./signals.js').Signals} signals
 * @param {{base:string, repoName:string, isValidBranch:(name:string)=>boolean}} options
 * @param {Candidate[]} candidates
 * @returns {BranchRow|null}
 */
function suggestion(signals, options, candidates) {
  const window = signals.tmux?.window ?? '';
  const slug = normalize(window);
  if (!SLUG.test(slug)) return null;
  // Digits and dots too: tmux numbers unnamed windows, and some CLIs set their process title to
  // their own version number, which then becomes the window name.
  if (GENERIC_WINDOWS.has(slug) || /^[\d.]+$/.test(slug)) return null;
  if (slug === normalize(options.repoName) || slug === normalize(options.base)) return null;

  const branch = slug.includes('/') ? slug : `feat/${slug}`;
  if (branch === options.base || candidates.some((candidate) => candidate.branch === branch)) return null;
  if (!options.isValidBranch(branch)) return null;
  return { branch, bay: null, isNew: true, reason: `tmux window "${window}"` };
}

/**
 * The menu order: branches the terminal names first, strongest signal first, and then everything
 * else in the order {@link bayCandidates} gave it.
 *
 * When nothing existing is named at all, a branch suggested by the tmux window leads instead — the
 * operator named the window for the work and has not cut the branch yet. Only then: once a real
 * branch has been matched, a made-up name would be a guess ranked above a fact.
 *
 * Pure, so every rule above is tested with signals handed in; `isValidBranch` is injected for the
 * same reason, being the one question here that needs git to answer it.
 *
 * @param {Candidate[]} candidates
 * @param {import('./signals.js').Signals} signals
 * @param {{base:string, repoName:string, isValidBranch:(name:string)=>boolean}} options
 *   `base` and `repoName` are the two names a window is most often called that are never a new
 *   branch
 * @returns {BranchRow[]}
 */
export function rankBranches(candidates, signals, options) {
  const scored = candidates.map((candidate) => ({ candidate, signal: strongest(candidate.branch, signals) }));
  const row = ({ candidate, signal }) => ({ ...candidate, isNew: false, reason: signal?.reason ?? null });

  const promoted = scored
    .filter((entry) => entry.signal !== null)
    .sort((a, b) => a.signal.key[0] - b.signal.key[0] || a.signal.key[1] - b.signal.key[1]);
  const rest = scored.filter((entry) => entry.signal === null);

  const fresh = promoted.length === 0 ? suggestion(signals, options, candidates) : null;
  return [...(fresh ? [fresh] : []), ...promoted.map(row), ...rest.map(row)];
}
