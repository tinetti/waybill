# Docket-Scoped Stamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Waybill stamping legs from shipped papers, by resolving `stampPath` globs only against paths the current branch introduced, and by giving the base branch a distinct "no docket open" state.

**Architecture:** A docket is the branch. `defaultBranch` becomes non-null so "on a feature branch" is always decidable; `changedPaths` computes the branch's diff against its merge-base once per run; `stampedByPath` gains a leaf filter requiring a matched path to be in that set; the header reads a new `docketOpen` boolean. No state file is introduced — the tool keeps deriving everything from repository reality.

**Tech Stack:** Node.js ESM (no dependencies), `node:test` + `node:assert/strict`, JSDoc type annotations, `spawnSync` for git.

**Spec:** `docs/superpowers/specs/2026-09-07-docket-scoped-stamps-design.md`

## Global Constraints

- No new runtime dependencies. `package.json` has none and stays that way.
- Test command: `npm test` (= `node --test tests/`). A single suite: `node --test tests/repo.test.js`.
- New suites must be registered in `tests/index.js`, which imports every suite explicitly (Node 22 vs 26 discovery differences). No new suite files are added by this plan, so no change is needed there.
- Git is invoked only through `tryGit(cwd, args)` in `src/repo.js:13-17` — cwd-first, args as an array, no shell, returns trimmed stdout or `null`, never throws.
- Comments explain *why*, not *what*, matching the density already in `src/`. Do not add narration to self-evident lines.
- Golden files regenerate with `UPDATE_GOLDEN=1 npm test`. Never hand-edit a file in `tests/golden/`.
- Every task ends green: `npm test` passes before the commit.

---

### Task 1: `defaultBranch` always resolves a base

**Files:**
- Modify: `src/repo.js:100-112`
- Test: `tests/repo.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `defaultBranch(cwd: string) => string` — return type narrows from `string|null` to `string`, and it never returns the current branch.

- [ ] **Step 1: Write the failing tests**

Add to `tests/repo.test.js`. A `describe('defaultBranch', ...)` block already exists at `:200`; add these as a sibling block beside it:

```js
describe('defaultBranch without origin/HEAD', () => {
  it('falls back to a local main', () => {
    const repo = createRepo({ branch: 'main' });
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.equal(defaultBranch(repo), 'main');
  });

  it('falls back to a local master when there is no main', () => {
    const repo = createRepo({ branch: 'master' });
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.equal(defaultBranch(repo), 'master');
  });

  it('prefers main over master when both exist', () => {
    const repo = createRepo({ branch: 'master' });
    git(repo, ['branch', 'main']);
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.equal(defaultBranch(repo), 'main');
  });

  it('returns main when no candidate branch exists', () => {
    const repo = createRepo({ branch: 'wip' });
    assert.equal(defaultBranch(repo), 'main');
  });

  it('never returns the current branch as the base', () => {
    const repo = createRepo({ branch: 'main' });
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.notEqual(defaultBranch(repo), currentBranch(repo));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/repo.test.js`
Expected: FAIL. The first three fail with `'feat/thing' !== 'main'` (etc.) because today's fallback returns the current branch; the fourth fails with `'wip' !== 'main'`.

- [ ] **Step 3: Implement the probe**

In `src/repo.js`, above `defaultBranch`, add the candidate list:

```js
/**
 * Trunk names probed when the remote publishes no `origin/HEAD`, in preference order.
 * The list exists so a remoteless `master` repository is not told its base is `main`, which would
 * report a docket open while standing on the trunk.
 */
const BASE_CANDIDATES = ['main', 'master', 'trunk'];
```

Replace the body and JSDoc of `defaultBranch` (`src/repo.js:100-112`):

```js
/**
 * The branch new work forks from: `origin/HEAD` when the remote publishes one, otherwise the first
 * conventional trunk that exists locally, otherwise `main`.
 *
 * Never returns the current branch. The previous self-referential fallback made `branch === base`
 * unconditionally true in a remoteless repository, so a docket could never be seen to open there.
 * Never fetches — fetching is a side effect belonging to the bay command, not to a query inference
 * calls repeatedly.
 *
 * @param {string} cwd
 * @returns {string}
 */
export function defaultBranch(cwd) {
  const head = tryGit(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^origin\//, '');

  for (const candidate of BASE_CANDIDATES) {
    if (tryGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`]) !== null) {
      return candidate;
    }
  }
  return BASE_CANDIDATES[0];
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. If an existing assertion expected `defaultBranch` to equal the current branch or to be `null`, it encoded the bug — update it to the new contract and note the change in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/repo.js tests/repo.test.js
git commit -m "fix: resolve a base branch without falling back to the current one"
```

---

### Task 2: `changedPaths` — the branch's diff against its merge-base

**Files:**
- Modify: `src/repo.js` (add an exported function beside `isMerged`)
- Test: `tests/repo.test.js`

**Interfaces:**
- Consumes: `defaultBranch(cwd) => string` from Task 1.
- Produces: `changedPaths(cwd: string, base: string) => string[] | null` — repo-relative, forward-slash paths; `[]` when the branch matches its base; `null` when no merge-base can be found (an explicit *unknown*, never conflated with "nothing changed").

- [ ] **Step 1: Write the failing tests**

Add to `tests/repo.test.js`, importing `changedPaths` alongside the existing `src/repo.js` imports and `writeFile` from the fixture helper:

```js
describe('changedPaths', () => {
  it('is empty on a branch identical to its base', () => {
    const repo = createRepo({ branch: 'main' });
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.deepEqual(changedPaths(repo, 'main'), []);
  });

  it('reports a file committed on the branch', () => {
    const repo = createRepo({ branch: 'main' });
    git(repo, ['checkout', '-b', 'feat/thing']);
    writeFile(path.join(repo, 'docs', 'new.md'), 'x\n');
    git(repo, ['add', 'docs/new.md']);
    git(repo, ['commit', '-m', 'add']);
    assert.deepEqual(changedPaths(repo, 'main'), ['docs/new.md']);
  });

  it('reports staged, unstaged and untracked files', () => {
    const repo = createRepo({ branch: 'main' });
    git(repo, ['checkout', '-b', 'feat/thing']);

    writeFile(path.join(repo, 'staged.md'), 'a\n');
    git(repo, ['add', 'staged.md']);
    writeFile(path.join(repo, 'README.md'), '# edited\n');
    writeFile(path.join(repo, 'untracked.md'), 'c\n');

    const result = changedPaths(repo, 'main');
    assert.deepEqual([...result].sort(), ['README.md', 'staged.md', 'untracked.md']);
  });

  it('does not report a file that only exists on the base branch', () => {
    const repo = createRepo({ branch: 'main' });
    writeFile(path.join(repo, 'shipped.md'), 'old\n');
    git(repo, ['add', 'shipped.md']);
    git(repo, ['commit', '-m', 'ship']);
    git(repo, ['checkout', '-b', 'feat/thing']);
    assert.deepEqual(changedPaths(repo, 'main'), []);
  });

  it('is null when the base ref does not exist', () => {
    const repo = createRepo({ branch: 'main' });
    assert.equal(changedPaths(repo, 'nonexistent'), null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/repo.test.js`
Expected: FAIL with `changedPaths is not a function` (or an import error) — the function does not exist yet.

- [ ] **Step 3: Implement `changedPaths`**

Add to `src/repo.js`, after `checkoutRoot`:

```js
/**
 * Split git's multi-line output into entries.
 *
 * `''.split('\n')` yields `['']`, and an empty diff is the common case here rather than the
 * exception it is for this module's other callers, so the empty entry has to be dropped.
 *
 * @param {string} output
 * @returns {string[]}
 */
function lines(output) {
  return output.split('\n').filter(Boolean);
}

/**
 * Every path the current branch introduces relative to `base` — committed, staged, unstaged and
 * untracked — as repository-relative forward-slash paths.
 *
 * `null` means the question could not be answered: the refs share no history, or `base` does not
 * exist. That is deliberately distinct from `[]` ("nothing changed"), because a caller that scopes
 * stamps by this set must stamp nothing when it cannot tell, rather than fall back to matching
 * whatever is on disk and reinstate the bug this exists to fix.
 *
 * Directories never appear: `git diff --name-only` reports files. A `stampPath` naming a directory
 * therefore cannot stamp a docket.
 *
 * @param {string} cwd
 * @param {string} base
 * @returns {string[]|null}
 */
export function changedPaths(cwd, base) {
  const mergeBase = tryGit(cwd, ['merge-base', base, 'HEAD']);
  if (mergeBase === null) return null;

  // `git diff <commit>` compares the working tree to the commit, so committed, staged and unstaged
  // changes all arrive in one call; only untracked files need the second.
  const tracked = tryGit(cwd, ['diff', '--name-only', mergeBase]);
  const untracked = tryGit(cwd, ['ls-files', '--others', '--exclude-standard']);
  if (tracked === null || untracked === null) return null;

  return [...lines(tracked), ...lines(untracked)];
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repo.js tests/repo.test.js
git commit -m "feat: add changedPaths, the branch's diff against its merge-base"
```

---

### Task 3: `docketOpen` on the repository state

**Files:**
- Modify: `src/legs.js` (the `RepoState` typedef and `ideateIsDone`)
- Modify: `src/inference.js:89` (state assembly) and the not-a-repository early return at `:73-86`
- Test: `tests/inference.test.js`

**Interfaces:**
- Consumes: `defaultBranch(cwd) => string` from Task 1.
- Produces: `RepoState.docketOpen: boolean`, and `Inference.docketOpen: boolean` on the object `resolveLeg` returns. Task 5 renders from the latter.

- [ ] **Step 1: Write the failing tests**

Add to `tests/inference.test.js`:

```js
describe('docketOpen', () => {
  it('is false on the base branch', () => {
    const repo = createRepo({ remote: true, originHead: true });
    assert.equal(resolveLeg(repo).docketOpen, false);
  });

  it('is true in a bay on a feature branch', () => {
    const repo = createRepo({ remote: true, originHead: true });
    const bay = addWorktree(repo, 'feat/thing');
    assert.equal(resolveLeg(bay).docketOpen, true);
  });

  it('is false outside a repository', () => {
    assert.equal(resolveLeg(path.join(tempRoot(), 'missing')).docketOpen, false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/inference.test.js`
Expected: FAIL with `undefined !== false` — `resolveLeg` does not return the field yet.

- [ ] **Step 3: Add the field**

In `src/legs.js`, extend the `RepoState` typedef to carry `docketOpen:boolean`, and replace `ideateIsDone` so the predicate lives in one place:

```js
/**
 * The `ideate` leg leaves no papers by design — a rough-ideation conversation writes nothing —
 * so it is judged by what it must have preceded: any later leg being complete, or a docket being
 * open at all.
 *
 * @param {RepoState} state
 * @param {boolean} laterComplete whether any leg after this one is complete
 * @returns {boolean}
 */
export function ideateIsDone(state, laterComplete) {
  return laterComplete || state.docketOpen;
}
```

In `src/inference.js`, compute it once when the state is assembled (replacing line 89):

```js
  const branch = currentBranch(anchor);
  const base = defaultBranch(anchor);
  // A docket is the branch: nothing is in flight while we stand on the trunk. The `branch` guard is
  // load-bearing — `currentBranch` is null on a detached HEAD, and `null !== 'main'` would
  // otherwise open a docket with no branch to hang it on.
  const docketOpen = Boolean(branch) && branch !== base;

  /** @type {import('./legs.js').RepoState} */
  const state = { cwd: anchor, root, branch, base, docketOpen };
```

Add `docketOpen` to the `Inference` typedef at `src/inference.js:17-20`, to the returned `result` object, and to the not-a-repository early return at `:73-86` as `docketOpen: false`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/legs.js src/inference.js tests/inference.test.js
git commit -m "feat: name the docket-open predicate on the repository state"
```

---

### Task 4: Scope `stampPath` to the docket

This is the fix. It changes an exported signature and every caller in the same task, because a half-threaded `changed` set leaves the suite red.

**Files:**
- Modify: `src/bookings.js:122-152` (`walk`, `stampedByPath`), `:201-203` (`bookingIsDone`), `:214-245` (`evaluateBooking`)
- Modify: `src/inference.js` (`legIsDone` and its caller)
- Test: `tests/bookings.test.js`, `tests/inference.test.js`
- Modify: `tests/helpers/repo-fixture.js` (new `commitPapers` helper)

**Interfaces:**
- Consumes: `changedPaths(cwd, base) => string[]|null` (Task 2), `RepoState.docketOpen` (Task 3).
- Produces:
  - `stampedByPath(pattern: string, repoRoot: string, changed: Set<string>|null) => boolean`
  - `bookingIsDone(booking, repoRoot: string, changed: Set<string>|null) => boolean`
  - `evaluateBooking(booking, repoRoot: string, changed: Set<string>|null) => {done: boolean, warnings: string[]}`
  - `commitPapers(repoDir: string, files: Record<string,string>) => void` in the fixture helper

- [ ] **Step 1: Add the fixture helper**

No repository fixture currently puts papers in *history*, which is exactly why nothing caught this bug. Add to `tests/helpers/repo-fixture.js`:

```js
/**
 * Commit files to the repository's current branch — papers that have already shipped.
 *
 * Fixtures that only write papers into the working tree cannot reproduce the bug this guards:
 * a stamp must distinguish a paper belonging to the change in flight from one merged long ago,
 * and only committed history makes the two look different.
 *
 * @param {string} repoDir
 * @param {Record<string,string>} files path relative to the repo root -> contents
 * @returns {void}
 */
export function commitPapers(repoDir, files) {
  for (const [relative, contents] of Object.entries(files)) {
    writeFile(path.join(repoDir, relative), contents);
  }
  git(repoDir, ['add', '-A']);
  git(repoDir, ['commit', '-m', 'ship papers']);
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/bookings.test.js`, update the existing `describe('stampedByPath', ...)` cases to pass a changed set, and add the new contract. Replace the whole block:

```js
describe('stampedByPath', () => {
  it('matches a literal path relative to the repository root', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'x', 'tasks.md'), '- [ ] a\n');
    const changed = new Set(['openspec/changes/x/tasks.md']);
    assert.equal(stampedByPath('openspec/changes/x/tasks.md', root, changed), true);
    assert.equal(stampedByPath('openspec/changes/y/tasks.md', root, changed), false);
  });

  it('matches an unquoted glob segment', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'waybill', 'contract-data.json'), '{}');
    const changed = new Set(['docs/ideation/waybill/contract-data.json']);
    assert.equal(stampedByPath('docs/ideation/*/contract-data.json', root, changed), true);
    assert.equal(stampedByPath('docs/ideation/*/nothing.json', root, changed), false);
  });

  it('matches a ** segment across depths', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'a', 'b', 'c', 'tasks.md'), '');
    assert.equal(stampedByPath('**/tasks.md', root, new Set(['a/b/c/tasks.md'])), true);
    assert.equal(stampedByPath('**/other.md', root, new Set(['a/b/c/tasks.md'])), false);
  });

  it('does not match a file that exists but is not in the changed set', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'shipped', 'contract.md'), '# old\n');
    assert.equal(stampedByPath('docs/ideation/*/contract.md', root, new Set()), false);
  });

  it('matches only the changed one when several exist on disk', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'docs', 'ideation', 'shipped', 'contract.md'), '# old\n');
    writeFile(path.join(root, 'docs', 'ideation', 'live', 'contract.md'), '# new\n');
    const changed = new Set(['docs/ideation/live/contract.md']);
    assert.equal(stampedByPath('docs/ideation/*/contract.md', root, changed), true);
  });

  it('stamps nothing when the changed set is unknown', () => {
    const root = tempRoot();
    writeFile(path.join(root, 'openspec', 'changes', 'x', 'tasks.md'), '- [ ] a\n');
    assert.equal(stampedByPath('openspec/changes/x/tasks.md', root, null), false);
  });

  it('is false when the repository root does not exist', () => {
    assert.equal(stampedByPath('anything', path.join(tempRoot(), 'missing'), new Set()), false);
  });

  it('does not match a directory, which git never reports as a changed path', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'openspec', 'changes'), { recursive: true });
    assert.equal(stampedByPath('openspec/changes', root, new Set(['openspec/changes'])), false);
  });
});
```

Note the last case: it inverts the previous `matches a directory as well as a file` assertion. That is intended — `git diff --name-only` reports files, so a directory `stampPath` can no longer stamp. No shipped booking names a directory.

In `tests/inference.test.js`, add the end-to-end regressions — the two reproductions from the spec:

```js
describe('shipped papers do not stamp a docket', () => {
  it('reports no docket on a base branch carrying shipped ideation papers', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, {
      'docs/ideation/shipped/contract.md': '# shipped\n',
      'docs/ideation/shipped/contract-data.json': '{}\n',
    });

    const state = resolveLeg(repo);
    assert.equal(state.docketOpen, false);
    assert.equal(state.leg, 'ideate');
    assert.deepEqual(state.completed, []);
  });

  it('reports refine in a fresh bay, not specs', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, {
      'docs/ideation/shipped/contract.md': '# shipped\n',
      'docs/ideation/shipped/contract-data.json': '{}\n',
    });
    const bay = addWorktree(repo, 'feat/thing');

    const state = resolveLeg(bay);
    assert.equal(state.docketOpen, true);
    assert.equal(state.leg, 'refine');
    assert.deepEqual(state.completed, ['ideate', 'bay']);
  });

  it('stamps refine once this docket writes its own papers', () => {
    const repo = createRepo({ remote: true, originHead: true });
    commitPapers(repo, { 'docs/ideation/shipped/contract-data.json': '{}\n' });
    const bay = addWorktree(repo, 'feat/thing');
    writeFile(path.join(bay, 'docs', 'ideation', 'live', 'contract-data.json'), '{}\n');

    assert.equal(resolveLeg(bay).completed.includes('refine'), true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/bookings.test.js tests/inference.test.js`
Expected: FAIL. The `stampedByPath` cases fail because the third argument is ignored, so the "not in the changed set" and "unknown" cases return `true`. The inference regressions fail with `'specs' !== 'refine'` and a `completed` list containing `refine` and `contract`.

- [ ] **Step 4: Thread the changed set through `bookings.js`**

Give `walk` a leaf predicate (`src/bookings.js:122-138`):

```js
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
```

Replace `stampedByPath` (`src/bookings.js:141-152`):

```js
/**
 * `stampPath`: a glob resolved relative to the repository root, matching only paths the current
 * docket introduced. Supports `*` and `?` within a segment and `**` across segments — deliberately
 * not a full glob dialect.
 *
 * The glob alone cannot tell a paper belonging to the change in flight from one that shipped long
 * ago, and matching on existence alone stamps legs from history. `changed` is the docket's own diff;
 * `null` means it could not be computed, and stamps nothing rather than falling back to existence.
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
    const relative = path.relative(repoRoot, absolute).split(path.sep).join('/');
    return changed.has(relative);
  });
}
```

Thread the parameter through `bookingIsDone` and `evaluateBooking`, updating their JSDoc to document `changed` exactly as above:

```js
export function bookingIsDone(booking, repoRoot, changed) {
  return evaluateBooking(booking, repoRoot, changed).done;
}
```

```js
export function evaluateBooking(booking, repoRoot, changed) {
```

and inside it:

```js
      done = stampedByPath(booking.stampPath, repoRoot, changed);
```

`stampCmd` handling is untouched — it receives no docket scoping, by design.

- [ ] **Step 5: Thread the changed set through `inference.js`**

Import `changedPaths` from `./repo.js`. Give `legIsDone` the set and pass it on:

```js
function legIsDone(leg, state, bookings, warnings) {
  if (leg.id === 'bay') return bayIsDone(state);
  if (leg.id === 'cleanup') return cleanupIsDone(state);

  const booking = bookings.get(leg.id);
  if (!booking) return false;

  const result = evaluateBooking(booking, state.root, state.changed);
  warnings.push(...result.warnings);
  return result.done;
}
```

In `resolveLeg`, compute it once beside `docketOpen` and warn when it is unknown, so a leg that never stamps is explained rather than silent:

```js
  const changedList = changedPaths(anchor, base);
  if (changedList === null) {
    warnings.push(`cannot determine what ${branch ?? 'HEAD'} changed against ${base}; no leg will stamp`);
  }
  const changed = changedList === null ? null : new Set(changedList);

  /** @type {import('./legs.js').RepoState} */
  const state = { cwd: anchor, root, branch, base, docketOpen, changed };
```

Add `changed:Set<string>|null` to the `RepoState` typedef in `src/legs.js`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. Expect fallout in `tests/booking-swap.test.js` and any fixture-driven suite whose papers live only in the working tree of a repo whose base ref is missing — those are real: rebuild them on `createRepo({ remote: true, originHead: true })` plus `commitPapers` so a base exists to diff against. Do not weaken an assertion to make it pass; if a case genuinely cannot resolve a base, assert the new warning instead.

- [ ] **Step 7: Confirm `paperPaths` was not disturbed**

Run: `node --test tests/inspection-gitignore.test.js`
Expected: PASS with no edits to `src/inspection.js`. `deglob`/`paperPaths` (`src/inspection.js:31-49`) is the second, independent consumer of `stampPath` — it takes the literal directory prefix for `git check-ignore` and must keep doing so. If this suite needed changing, the glob semantics moved when only the leaf filter should have; revisit step 4.

- [ ] **Step 8: Commit**

```bash
git add src/bookings.js src/inference.js src/legs.js tests/
git commit -m "fix: stamp legs only from papers the docket introduced"
```

---

### Task 5: Render the "no docket open" state

**Files:**
- Modify: `src/waybill.js:44-52` (`header`), and both render entry points at `:178` and `:194`
- Test: `tests/waybill.test.js`, `tests/golden/`
- Create: `tests/fixtures/no-docket.js`
- Modify: `README.md` (the leg table at `:30-40`)

**Interfaces:**
- Consumes: `Inference.docketOpen` (Task 3).
- Produces: no new exports; the rendered header gains a third form.

- [ ] **Step 1: Write the failing test and the fixture**

Create `tests/fixtures/no-docket.js`:

```js
import { commitPapers, createRepo } from '../helpers/repo-fixture.js';

/**
 * A repository standing on its base branch with ideation papers already shipped — the state that
 * used to report `leg 2 of 7 (bay)` from history alone.
 *
 * @returns {import('./ideate.js').LegFixture}
 */
export function noDocketFixture() {
  const repo = createRepo({ remote: true, originHead: true });
  commitPapers(repo, {
    'docs/ideation/shipped/contract.md': '# shipped\n',
    'docs/ideation/shipped/contract-data.json': '{}\n',
  });
  return { dir: repo, repo, branch: 'main' };
}
```

In `tests/waybill.test.js`, first add `docketOpen: true` to the defaults of the synthetic `state()` helper (`:50-76`), beside `branch: 'feat/thing'`:

```js
    branch: 'feat/thing',
    docketOpen: true,
```

This is load-bearing, not tidying. That helper builds an `Inference` by hand for the rendering-rule tests, and once `header` reads `docketOpen`, a missing field is falsy — every synthetic case would render `no docket open` and the suite would fail for a reason unrelated to what it tests.

Then add the golden case, using the file's own helpers — `resolve(dir)` (which strips `openspec` from PATH so the real CLI cannot influence a byte-exact file) and the `CLEAN` findings constant:

```js
it('renders no docket open on the base branch', () => {
  assertGolden('no-docket', renderWaybill(resolve(noDocketFixture().dir), CLEAN));
});
```

Import `noDocketFixture` alongside the other fixture imports at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/waybill.test.js`
Expected: FAIL — `tests/golden/no-docket.txt` does not exist, and the rendered header still reads `main · leg 1 of 7 (ideate)`.

- [ ] **Step 3: Render the state**

Replace `header` in `src/waybill.js:44-52`:

```js
/**
 * @param {import('./inference.js').Inference} state
 * @returns {string}
 */
function header(state) {
  const position = !state.docketOpen
    ? 'no docket open'
    : state.leg === null
      ? `all ${LEGS.length} legs complete`
      : `leg ${state.index} of ${LEGS.length} (${state.leg})`;
  return state.branch ? `${state.branch} · ${position}` : position;
}
```

`state.leg` deliberately stays `ideate` in this state rather than being emptied to signal it: `leg === null` already means "all legs complete" here, and `nextBlock` early-returns on it, which would drop the waybill the operator needs.

Suppress the strip at both entry points (`:178` and `:194`), since a checklist of a docket's progress has nothing to describe when no docket is open:

```js
  const sections = [[header(state), ...(state.docketOpen ? strip(state) : [])].join('\n')];
```

Apply the same change in `renderPosition`.

- [ ] **Step 4: Generate the golden file and check it**

Run: `UPDATE_GOLDEN=1 node --test tests/waybill.test.js`
Then read `tests/golden/no-docket.txt` and confirm it reads:

```
main · no docket open

NEXT:
  /clear, then run:
  /ideation:brainstorm
  └ opus · high effort
```

followed by the body of `bookings/ideation-ideate.md`. If a `✓` strip is still present, step 3 is incomplete — fix it and regenerate rather than accepting the file.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Existing golden files whose header changes must be regenerated with `UPDATE_GOLDEN=1 npm test`; inspect every regenerated diff before staging it, since the flag will happily bless a wrong render.

- [ ] **Step 6: Update the README leg table**

`README.md:30-40` documents how each leg is stamped. Amend the `refine` and `contract` rows to say the glob matches only paths the docket introduced, and add a sentence below the table recording the limitation: `stampCmd` bookings receive no docket scoping, so a command that greps a directory tree can still match papers from history.

- [ ] **Step 7: Commit**

```bash
git add src/waybill.js tests/ README.md
git commit -m "feat: report no docket open on the base branch"
```

---

### Task 6: Verify against the real repository

The bug was found by running the tool on its own repository, and that is where the fix has to be seen to work.

**Files:** none modified.

- [ ] **Step 1: Confirm the base branch reads correctly**

Run from the main checkout: `node src/cli.js status`
Expected: `main · no docket open`, no `✓` strip. Before this plan it read `main · leg 2 of 7 (bay)` with three false ticks.

- [ ] **Step 2: Confirm the bay reads correctly**

Run from this bay: `node src/cli.js next`
Expected: `feat/docket-scoped-stamps · leg 3 of 7 (refine)` — `ideate` and `bay` ticked, `refine` current. Before this plan it read `leg 5 of 7 (specs)`, having stamped `refine` and `contract` from the shipped `pitwall/` papers.

The design documents committed by this branch live under `docs/superpowers/`, not `docs/ideation/`, so they do not match the refine or contract globs and must not tick those legs. If either ticks, the changed-set filter is matching something it should not — investigate before continuing.

- [ ] **Step 3: Record the outputs**

Paste both outputs into the PR description alongside the `npm test` result, as the before/after evidence for the change.
