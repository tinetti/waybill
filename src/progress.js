import fs from 'node:fs';
import path from 'node:path';

import { changeStatus, openspecAvailable } from './openspec.js';

const CHANGES = path.join('openspec', 'changes');

/** Archived changes live one level deeper under this name and are never the active change. */
const ARCHIVE = 'archive';

/** A markdown task checkbox at any indent, under any of the three list bullets. */
const CHECKBOX = /^[ \t]*[-*+][ \t]+\[([ xX])\](?=[ \t]|$)/;

/** An opening or closing code fence, backtick or tilde, at any indent. */
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Drop every fenced code block, so a checkbox shown as an example in a snippet is not counted as
 * work. An unclosed fence swallows the rest of the file, which is the conservative reading — an
 * undercount is visible as stalled progress, an overcount reads as finished work.
 *
 * @param {string} text
 * @returns {string}
 */
function stripFences(text) {
  /** @type {string[]} */
  const kept = [];
  /** @type {string|null} */
  let open = null;

  for (const line of text.split('\n')) {
    const fence = FENCE.exec(line)?.[1][0] ?? null;
    if (open === null) {
      if (fence !== null) open = fence;
      else kept.push(line);
    } else if (fence === open) {
      open = null;
    }
  }

  return kept.join('\n');
}

/**
 * @param {string} text contents of a `tasks.md`
 * @returns {{done:number,total:number}}
 */
function countTasks(text) {
  let done = 0;
  let total = 0;
  for (const line of stripFences(text).split('\n')) {
    const match = CHECKBOX.exec(line);
    if (!match) continue;
    total += 1;
    if (match[1] !== ' ') done += 1;
  }
  return { done, total };
}

/**
 * @param {string} repoRoot
 * @param {string} changeId
 * @returns {string} contents of the change's `tasks.md`, or `''` when there is none
 */
function readTasks(repoRoot, changeId) {
  try {
    return fs.readFileSync(path.join(repoRoot, CHANGES, changeId, 'tasks.md'), 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {string} repoRoot
 * @returns {string[]} active change ids that carry a tasks list, sorted by name
 */
function changeIds(repoRoot) {
  const dir = path.join(repoRoot, CHANGES);
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== ARCHIVE)
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'tasks.md')))
    .sort();
}

/**
 * @param {Set<string>|null} changed the branch's diff against the default branch
 * @returns {Set<string>} ids of the active changes the branch touched, through any file in them
 */
function branchChangeIds(changed) {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const file of changed ?? []) {
    const [top, sub, id, ...rest] = file.split('/');
    if (top === 'openspec' && sub === 'changes' && id && id !== ARCHIVE && rest.length > 0) ids.add(id);
  }
  return ids;
}

/**
 * The change the current branch is working on.
 *
 * Only changes the branch's own diff touches are candidates, so a change inherited from the trunk —
 * shipped but never archived, or someone else's in flight — is never named; `null` for `changed`
 * (the diff could not be computed) means no candidates at all. Among the candidates nothing says
 * which one is live, so the rule is fixed and stated rather than guessed: the first unfinished
 * change by name, falling back to the last name when every change is finished. `openspec list
 * --json` is picked from by the same rule over the same candidates, but this walk requires a
 * `tasks.md` and the CLI does not, so the CLI can name a change this function returns `null` for.
 * `resolveLeg` resolves that one-sided case in the CLI's favour.
 *
 * @param {string} repoRoot
 * @param {Set<string>|null} changed the branch's diff against the default branch
 * @returns {string|null}
 */
export function discoverChangeId(repoRoot, changed) {
  const owned = branchChangeIds(changed);
  const ids = changeIds(repoRoot).filter((id) => owned.has(id));
  if (ids.length === 0) return null;
  for (const id of ids) {
    const { done, total } = countTasks(readTasks(repoRoot, id));
    if (total === 0 || done < total) return id;
  }
  return ids[ids.length - 1];
}

/**
 * `n of N` for the execute leg, from the CLI when it answers and from the tasks list when it does
 * not. Both paths return the same shape so the waybill renderer never branches on which one ran.
 *
 * `total: 0` is reported literally. A change with no tasks is a specs-leg problem, and calling
 * `0 of 0` complete would hide it.
 *
 * @param {string} repoRoot
 * @param {string|null|undefined} changeId `null` means "already looked, there is none"; `undefined`
 *   has {@link discoverChangeId} pick one, so a caller that has resolved an id never pays for a
 *   second walk of `openspec/changes/`
 * @param {Set<string>|null} changed the branch's diff; the CLI may only name a change it touches
 * @returns {{done:number,total:number,source:'openspec'|'tasks-md',changeId:string|null}}
 */
export function executeProgress(repoRoot, changeId, changed) {
  const id = changeId === undefined ? discoverChangeId(repoRoot, changed) : changeId;

  if (openspecAvailable(repoRoot)) {
    const status = changeStatus(repoRoot, id ?? undefined, branchChangeIds(changed));
    if (status) {
      return { done: status.done, total: status.total, source: 'openspec', changeId: status.changeId };
    }
  }

  const counts = id === null ? { done: 0, total: 0 } : countTasks(readTasks(repoRoot, id));
  return { ...counts, source: 'tasks-md', changeId: id };
}
