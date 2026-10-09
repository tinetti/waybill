# Implementation Spec: Next-Leg Brief - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 1 adds everything deterministic: a `brief` verb, one optional booking key, and two additions to
the markdown handover (a `BRIEF:` keyed line and a context suffix on the `RUN:` line). No command
files and no docs change here — Phase 2 owns those.

The split that keeps this testable is the one the repo already uses: `src/waybill.js` stays a pure
renderer fed by a `Route`, and `src/cli.js` gathers the repository facts. So the CLI computes a
`context` object (brief path, whether the file exists, the ideation directory, the skipped legs,
the leg after this session) and hands it to the renderer through `route`; the renderer only formats.
Golden files then pin the formatting without any test having to build a bay.

Target-leg resolution is deliberately the simplest rule that is correct: **the brief target is
`state.leg` when that leg's booking carries a `brief:` key, and otherwise there is nothing to brief.**
No walking the route table. It works because inference already resolves `state.leg` to the first
not-done leg at the moment `brief` runs: in the ideate session after `/waybill:bay`, that is `refine`;
after a refine session that carried on into contract and stamped `contract.md`, it is `specs`; if
contract did not finish, it is `contract`, which has no `brief:` key, so no brief is written — which is
the honest answer rather than a brief aimed at the wrong leg.

`RUN:` stays exactly one line, because `commands/next.md` acts on keyed lines line-by-line. The brief
reaches the session as a path plus a one-line context suffix, never as multi-line prose.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Layered context (Waybill facts always, model-written brief when present)** — rejected: brief only, or facts only. Facts alone lose the brainstorm at `/clear`; a brief alone lets a model misstate facts Waybill already knows.
- **Untracked file in the bay, self-ignored via `.waybill/handoff/.gitignore`** — rejected: git common dir; committed on the branch. The owner wants it visible in the worktree; committing pollutes the PR diff and diff-based inference.
- **Key the file by the reading leg (`handoff/refine.html`)** — rejected: key by the writing leg. Exact lookup; no resolving the latest done leg across skips.
- **Start-of-leg run assembles and passes; never generates** — rejected: generate from disk when none exists. Disk cannot recover an unwritten brainstorm.
- **HTML only, passed by path with facts inline** — rejected: inline stripped HTML; HTML+Markdown twin; a format setting. No converter to maintain, one source file.
- **Display runs emit a `BRIEF:` keyed line the command files key on** — rejected: command files deciding from prose conditions. Only the CLI can resolve overlays to know a leg takes a brief, and command files key only on exported literals.
- **`waybill brief` takes an optional `<branch>` and resolves like `next`** — the ideate session is still on the trunk after `/waybill:bay`.
- **`brief:` is a one-line guidance string** — rejected: multi-line block scalar. `src/frontmatter.js` rejects block scalars.
- **Checks guard on test/golden existence before running** — rejected: bare `--test-name-pattern` checks. A name filter matching nothing exits 0.
- **Only refine and specs take a brief** — rejected: refine only; every transfer leg. execute's `/spec:apply` argument handling is unverified for extra text.

## Feedback Strategy

**Inner-loop command**: `node --test tests/waybill.test.js`

**Playground**: the existing test suite. `tests/fixtures/*.js` build scenario repos and
`assertGolden` (with `UPDATE_GOLDEN=1` for the first record) pins rendered output.

**Why this approach**: every change in this phase is a pure-function output change or a CLI exit
code, and the suite already has fixtures for both.

## File Changes

### New Files

| File Path            | Purpose                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/brief.js`       | Resolve the brief target leg, the handoff directory and file path, ensure the self-ignoring `.gitignore`     |
| `tests/brief.test.js`| Unit tests for `src/brief.js` (target resolution, path building, `.gitignore` contents); add to `tests/index.js` |
| `tests/golden/refine-brief.md`    | `next --markdown <branch>/refine` with a brief present |
| `tests/golden/refine-no-brief.md` | the same with no brief present                         |
| `tests/golden/specs-brief.md`     | `next --markdown <branch>/specs` with a brief present  |

### Modified Files

| File Path                      | Changes                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `src/bookings.js`              | Add `brief` to `OPTIONAL` and to the `Booking` typedef                                                           |
| `src/waybill.js`               | Export `BRIEF`; extend the `Route` typedef with `context`; emit the `BRIEF:` line and the `RUN:` context suffix   |
| `src/cli.js`                   | New `brief` verb in `COMMANDS` and `USAGE`; build `route.context` in `issueWaybill` and `next`                    |
| `src/help.js`                  | Add `brief` to the help card, keeping the 45-line budget; the header says "the four verbs" and must be reworded   |
| `tests/golden/help.txt`        | Re-record after the help change                                                                                  |
| `bookings/ideation-refine.md`  | Add a one-line `brief:` guidance key                                                                             |
| `bookings/openspec-specs.md`   | Add a one-line `brief:` guidance key                                                                             |
| `tests/index.js`               | Import `./brief.test.js`, or the suite never runs                                                                |
| `tests/waybill.test.js`        | Cases for the three new goldens and the `BRIEF:` line                                                            |
| `tests/cli.test.js`            | `describe('waybill brief')` and `it('removes a bay holding a brief')`                                            |
| `tests/help.test.js`           | Update if the verb count or line budget assertion names four verbs                                               |
| Existing display goldens       | Re-record those whose next leg is brief-taking, so the new `BRIEF:` line is pinned                               |

## Implementation Details

### `src/brief.js`

**Pattern to follow**: `src/bookings.js` (pure-ish module, `fs` at the edges, JSDoc types).

**Overview**: everything about where a brief lives and which leg it is for, with no rendering and no
git of its own.

```js
/** The directory inside a bay that holds briefs, and the file that keeps it out of git. */
export const HANDOFF_DIR = path.join('.waybill', 'handoff');

/**
 * The leg a brief would be written for, or null when nothing takes one.
 * @param {import('./inference.js').Inference} state
 * @returns {string|null}
 */
export function briefTarget(state) {
  if (!state.docketOpen || state.leg === null) return null;
  return state.booking?.brief ? state.leg : null;
}

/** @returns {string} absolute path of the brief for `leg` in `bay` */
export function briefPath(bay, leg) {
  return path.join(bay, HANDOFF_DIR, `${leg}.html`);
}

/** @returns {boolean} */
export function briefExists(bay, leg) { ... }

/**
 * Create `<bay>/.waybill/handoff/` and its `*` .gitignore if absent. Idempotent.
 * @returns {string} the brief's path
 */
export function ensureHandoff(bay, leg) { ... }
```

**Key decisions**:

- `.gitignore` holds exactly `*\n`, so the directory ignores itself and no repo-level ignore file is
  touched. This is what keeps `git status` clean and lets `git worktree remove` work without `--force`
  (verified during the interview: ignored files do not block removal).
- `briefTarget` reads the booking, so a `.waybill/bookings` overlay that adds `brief:` to another leg
  works for free.

**Implementation steps**:

1. Write `tests/brief.test.js` first: target resolution for a booking with and without `brief`, for a
   closed docket, and for `state.leg === null`; `briefPath` shape; `ensureHandoff` creating the dir and
   `.gitignore` with `*` and being safe to call twice.
2. Add the import to `tests/index.js`.
3. Implement until green.

**Feedback loop**:

- **Playground**: `tests/brief.test.js` with a `tempRoot()` directory.
- **Experiment**: call `ensureHandoff` twice on the same bay; assert one `.gitignore` with contents `*`.
- **Check command**: `node --test tests/brief.test.js`

### Booking `brief:` key

**Overview**: one optional frontmatter key holding a single line of guidance about what the receiving
command needs.

**Key decisions**:

- One line only — `src/frontmatter.js` accepts flat scalars and throws on block scalars.
- Unlike `argument`, the value is free text, not a closed enum: it is guidance for a model, not a
  lookup key. No validation beyond "non-empty string".

**Implementation steps**:

1. Add `'brief'` to `OPTIONAL` in `src/bookings.js` and to the `Booking` typedef.
2. `bookings/ideation-refine.md`: `brief: What the brainstorm settled — the decision and its concrete problem, the assumptions, each rejected alternative with its reason, and what is explicitly out.`
3. `bookings/openspec-specs.md`: `brief: What the contract settled — the approved scope tier, the phase this change covers, the decisions already made, and what is explicitly out.`
4. A test in `tests/bookings.test.js` that the key survives loading and overlay replacement.

### `BRIEF:` keyed line and the `RUN:` context suffix

**Pattern to follow**: `src/waybill.js` `keyedLines` and the `ENTER_BAY`/`RUN`/`NEXT_LEG` exports.

**Overview**: display runs gain one keyed line; run-mode `RUN:` gains a one-line context suffix.

```js
export const BRIEF = 'BRIEF:';

/**
 * @typedef {object} BriefContext
 * @property {string|null} briefPath   absolute path of the brief for the leg being handed off
 * @property {boolean} briefExists
 * @property {string|null} ideationDir e.g. docs/ideation/next-leg-brief
 * @property {string[]} skipped
 * @property {string|null} after       the leg that starts after this session, or null
 */
```

`keyedLines` changes in two places:

- **Display mode** (no `route.token`): when `context.briefPath` is set and `context.briefExists` is
  false, emit `BRIEF: <leg> <absolute path>` before the fence. This is the line Phase 2's command
  files key on to offer the prompt. When the brief already exists, emit nothing — the prompt only
  appears when there is no brief yet.
- **Run mode** (`route.token === state.leg`): the `RUN:` line becomes
  `RUN: <command> <suffix>`, one line, fields separated by ` · `:
  - with a brief: `Brief: <path> (read first)`
  - without: `Brief: none written`
  - then `branch <branch>`, `bay <path>`, `ideation <dir>` (omitted when null),
    `skipped <a,b>` (omitted when empty), `next after this session: <leg>` (omitted when null).

**Key decisions**:

- One line, because `commands/next.md` acts on keyed lines individually; a multi-line argument would
  break that contract.
- The `→ runs` prose line keeps showing the booking's bare command, unchanged, so existing goldens for
  legs with no brief stay byte-identical and the display stays readable.
- Legs with no `brief:` key get no suffix at all: `next-run.md` (execute) must not change. Criterion 2
  enforces this with `git diff --quiet`.

**Implementation steps**:

1. Add the three new goldens as failing tests in `tests/waybill.test.js`, built like the existing
   "keyed lines" cases at `tests/waybill.test.js:223` (route `{bay, enter, token}` plus the new
   `context`).
2. Implement `BRIEF` and the suffix in `keyedLines`.
3. Re-record only the display goldens whose next leg is brief-taking; verify `next-run.md` is untouched.

**Feedback loop**:

- **Playground**: `tests/waybill.test.js`, calling `renderWaybillMarkdown` directly.
- **Experiment**: one state rendered three ways — brief present, brief absent, leg with no `brief:` key —
  asserting the suffix appears, degrades to `Brief: none written`, and is absent respectively.
- **Check command**: `node --test tests/waybill.test.js`

### `waybill brief [<branch>]` verb

**Pattern to follow**: `next` in `src/cli.js` (flag parsing, `repoRoot`, `fleet`, `parseTarget`,
`issueWaybill`).

**Overview**: resolves a docket the same way `next` does, then prints where to write the brief and what
it should contain. It writes no HTML itself.

Output on success (exit 0):

```
BRIEF FOR: refine
WRITE TO: /repo/.claude/worktrees/waybill-feat-thing/.waybill/handoff/refine.html
GUIDANCE: What the brainstorm settled — the decision and its concrete problem, …
```

**Key decisions**:

- Optional `<branch>`, resolved through `fleet()`/`parseTarget` like `next`, because the flagship caller
  is the ideate session, which is still standing in the main checkout after `/waybill:bay`. A leg token
  (`branch/leg`) is accepted and ignored for target selection — inference decides the target.
- No docket, or no bay: exit 2 with a one-line message, reusing `noWaybill`'s shape.
- Target leg takes no brief: exit 0 printing `NOTHING TO BRIEF: <leg> takes no brief`, so an automatic
  caller in Phase 2 is not an error path.
- `ensureHandoff` runs only when there is a target, so no stray directory appears in a bay that never
  gets a brief.

**Implementation steps**:

1. `describe('waybill brief')` in `tests/cli.test.js`: from the trunk with a branch argument; assert the
   `WRITE TO` path, `.gitignore` contents `*`, and that the bay's `git status --porcelain` is empty.
2. Add `it('removes a bay holding a brief')`: write a brief, then `git worktree remove` (no `--force`)
   and assert it exits 0 — pinning what `commands/cleanup.md` relies on.
3. Implement the verb; register it in `COMMANDS` and `USAGE`.
4. Update `src/help.js` and re-record `tests/golden/help.txt`; the card says "the four verbs" and now has
   five, so reword within the 45-line budget pinned by `tests/help.test.js`.

**Feedback loop**:

- **Playground**: `tests/cli.test.js` with `createRepo`/`addWorktree` fixtures.
- **Experiment**: run from the trunk and from inside the bay; run twice to confirm idempotence.
- **Check command**: `node --test tests/cli.test.js`

## Testing Requirements

### Unit Tests

| Test File                 | Coverage                                                             |
| ------------------------- | --------------------------------------------------------------------- |
| `tests/brief.test.js`     | target resolution, path building, `ensureHandoff` idempotence, `.gitignore` |
| `tests/waybill.test.js`   | `BRIEF:` line, `RUN:` suffix in all three states, three new goldens    |
| `tests/cli.test.js`       | `waybill brief` from trunk and bay, error paths, worktree removal      |
| `tests/bookings.test.js`  | `brief:` loads and survives overlay replacement                        |

**Key test cases**:

- Brief present → `RUN:` carries `… (read first)`; brief absent → `Brief: none written`.
- Leg with no `brief:` key → no suffix, no `BRIEF:` line (execute; `next-run.md` unchanged).
- Display run with an existing brief → no `BRIEF:` line (nothing to prompt for).
- No docket / no bay → exit 2 with a one-line message.

## Failure Modes

| Component      | Failure                              | Trigger                                  | Impact                                    | Mitigation                                             |
| -------------- | ------------------------------------ | ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `ensureHandoff`| Brief lands in a committed directory | A repo commits `.waybill/` wholesale      | Brief shows up in the PR diff              | The `*` `.gitignore` inside `handoff/`; test asserts clean `git status` |
| `briefTarget`  | Brief written for the wrong leg      | Contract leg unfinished when `brief` runs | A brief for `contract`, which reads nothing| Only legs with a `brief:` key are targets; otherwise `NOTHING TO BRIEF` |
| `RUN:` suffix  | `commands/next.md` mis-parses        | Suffix contains a newline                 | Session runs a truncated command           | Single-line assembly, pinned by goldens                 |
| Help card      | `npm test` fails on line budget      | Fifth verb pushes past 45 lines           | Red suite                                  | Reword in the same change; `tests/help.test.js` catches it |
| New test file  | Never runs                           | Not imported by `tests/index.js`          | False green                                | Step 2 adds the import; criterion 3 greps for the describe |

## Validation Commands

```bash
node --test tests/brief.test.js
node --test tests/waybill.test.js
node --test tests/cli.test.js
npm test
git diff --quiet main -- tests/golden/next-run.md   # execute leg untouched
```
