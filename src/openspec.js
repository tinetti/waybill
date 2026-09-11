import { spawnSync } from 'node:child_process';

/** Milliseconds any openspec invocation is allowed before it is killed. */
const TIMEOUT_MS = 2000;

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string }}
 */
function run(cwd, args) {
  const result = spawnSync('openspec', args, {
    cwd,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return { ok: false, stdout: '' };
  return { ok: true, stdout: result.stdout ?? '' };
}

/**
 * Whether the `openspec` CLI can be invoked at all.
 *
 * Split out from {@link probeOpenspec}, which additionally runs `status --json` to record field
 * names: that call exits 1 against the real 1.9.0 CLI, so a caller that only needs the yes/no would
 * be spending a guaranteed-useless subprocess on every invocation.
 *
 * @param {string} cwd
 * @returns {boolean}
 */
export function openspecAvailable(cwd) {
  return run(cwd, ['--version']).ok;
}

/**
 * Capability probe for the `openspec` CLI.
 *
 * Availability is judged by `openspec --version`, which succeeds unconditionally when the CLI is
 * installed; `openspec status --json` is not a availability test because it demands a change id.
 * The observed top-level JSON field names are recorded rather than assumed, so a later phase reads
 * a shape this phase actually saw.
 *
 * Never throws — an absent CLI is an expected state, and callers fall back to parsing `tasks.md`.
 *
 * @param {string} cwd
 * @returns {{available:boolean, version?:string, fields?:string[]}}
 */
export function probeOpenspec(cwd) {
  const version = run(cwd, ['--version']);
  if (!version.ok) return { available: false };

  /** @type {{available:boolean, version?:string, fields?:string[]}} */
  const probe = { available: true, version: version.stdout.trim() || undefined };

  const status = run(cwd, ['status', '--json']);
  if (status.ok) {
    try {
      const parsed = JSON.parse(status.stdout);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        probe.fields = Object.keys(parsed).sort();
      }
    } catch {
      // Non-JSON output records no fields; the CLI is still available.
    }
  }

  return probe;
}

/**
 * Top-level field names observed on openspec 1.9.0, recorded here rather than assumed.
 *
 * `probeOpenspec` cannot supply them in practice: `openspec status --json` demands `--change` and
 * exits 1 without it, so its `fields` branch only ever fires against a test stub. Treating an
 * absent `probe.fields` as a shape mismatch would make the CLI path dead code, so the shape is
 * checked against these constants instead — and a mismatch is a fallback trigger, not an error.
 */
const PROGRESS_FIELDS = ['total', 'complete'];
const LIST_FIELDS = ['name', 'completedTasks', 'totalTasks'];

/**
 * @param {string} stdout
 * @returns {Record<string, unknown>|null}
 */
function parseObject(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Unparseable output is a fallback trigger, never a throw.
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {string[]} fields
 * @returns {boolean}
 */
function hasFields(value, fields) {
  if (!value || typeof value !== 'object') return false;
  return fields.every((field) => Object.prototype.hasOwnProperty.call(value, field));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * `openspec instructions apply --change <id> --json` is the only subcommand that reports counts for
 * a named change. Its `progress` object spells the finished count `complete`, not `done`.
 *
 * @param {string} cwd
 * @param {string} changeId
 * @returns {{done:number,total:number,changeId:string}|null}
 */
function fromInstructions(cwd, changeId) {
  const result = run(cwd, ['instructions', 'apply', '--change', changeId, '--json']);
  if (!result.ok) return null;

  const parsed = parseObject(result.stdout);
  const progress = parsed?.progress;
  if (!hasFields(progress, PROGRESS_FIELDS)) return null;
  if (!isCount(progress.complete) || !isCount(progress.total)) return null;

  return { done: progress.complete, total: progress.total, changeId };
}

/**
 * `openspec list --json` reports every active change with its counts in one call, so it doubles as
 * change-id discovery when the caller has none. Archived changes are already excluded by the CLI.
 *
 * When no id is given the first unfinished change among `candidates` by name wins, falling back to
 * the last name when every candidate is finished — the same rule the `tasks.md` path applies, so the
 * two sources rank the changes they both see identically. The CLI still lists changes with no
 * `tasks.md`, which the filesystem walk cannot see at all.
 *
 * @param {string} cwd
 * @param {string|undefined} changeId
 * @param {Set<string>} candidates the only ids that may be picked when `changeId` is omitted
 * @returns {{done:number,total:number,changeId:string}|null}
 */
function fromList(cwd, changeId, candidates) {
  const result = run(cwd, ['list', '--json']);
  if (!result.ok) return null;

  const parsed = parseObject(result.stdout);
  if (!Array.isArray(parsed?.changes)) return null;

  const rows = parsed.changes
    .filter((change) => hasFields(change, LIST_FIELDS))
    .filter((change) => typeof change.name === 'string')
    .filter((change) => isCount(change.completedTasks) && isCount(change.totalTasks))
    .map((change) => ({ changeId: change.name, done: change.completedTasks, total: change.totalTasks }))
    .sort((a, b) => (a.changeId < b.changeId ? -1 : a.changeId > b.changeId ? 1 : 0));

  if (rows.length === 0) return null;
  if (changeId) return rows.find((row) => row.changeId === changeId) ?? null;
  const owned = rows.filter((row) => candidates.has(row.changeId));
  return owned.find((row) => row.done < row.total || row.total === 0) ?? owned[owned.length - 1] ?? null;
}

/**
 * Task counts for a change, straight from the CLI.
 *
 * Never throws and never guesses: `null` means "ask `tasks.md` instead", whether the CLI was
 * absent, exited non-zero, timed out, emitted unparseable output, or returned a shape this phase
 * has not seen.
 *
 * @param {string} cwd
 * @param {string|undefined} changeId when omitted, the CLI's own change list picks one
 * @param {Set<string>} candidates the ids that pick may choose from
 * @returns {{done:number,total:number,changeId:string}|null}
 */
export function changeStatus(cwd, changeId, candidates) {
  if (changeId) {
    const direct = fromInstructions(cwd, changeId);
    if (direct) return direct;
  }
  return fromList(cwd, changeId, candidates);
}
