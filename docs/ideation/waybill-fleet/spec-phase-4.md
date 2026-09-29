# Implementation Spec: Waybill Fleet — Phase 4

**Contract**: ./contract.md
**Estimated Effort**: L
**Hard prerequisite**: Phase 2 (age and stacking)
**Soft prerequisite**: Phase 3 — if it has not landed, the pane and activity columns render blank, which the contract already requires as their degraded behavior

## Technical Approach

Phase 4 turns the model into text and makes `waybill fleet` a real verb. It is the phase with the
most *small mandatory edits*, because this repo enforces its own prose consistency mechanically —
adding a command without updating four other files fails the suite.

The renderer is **a pure function of (model, now)**, mirroring `src/waybill.js:286`'s existing
contract: no filesystem, no subprocess, no clock. `now` arrives as a parameter so age strings are
deterministic and the golden files stay byte-stable. This is the single most important structural
decision in the phase, because it is what lets Phase 5 add a live repaint loop without any of the
data or layout logic moving.

**The new renderer deliberately does not share layout with `renderFleet` (`src/waybill.js:496`).**
That function belongs to `waybill status`, which the contract puts explicitly out of scope, and its
one-line-per-docket format is a different altitude from this view. The duplication is a chosen
consequence of that boundary, not an oversight — this spec says so out loud so a future reader does
not "fix" it by merging them and silently changing `status`.

This phase also defines the **Io seam** Phase 5 consumes. Today `run()` takes
`{cwd, out, err, signals}` where `out` is a bare function (`src/cli.js:24-29, 610-614`) — there is no
TTY flag, no clock, no stdin. Phase 4 widens that typedef even though it only uses the TTY flag and
the clock, so that Phase 5 does not have to rewrite this phase's entrypoint.

Finally, the living spec currently says the command surface "SHALL consist of exactly four verbs"
(`openspec/specs/command-surface/spec.md:10-19`), with a pending unarchived delta at
`openspec/changes/add-help-card/specs/command-surface/spec.md:5` rewording it to "exactly four verbs
plus one reference command". Shipping a fifth verb makes both false unless a stacked delta lands with
it.

## Feedback Strategy

**Inner-loop command**: `node --test tests/fleet-dash-render.test.js`

**Playground**: The test suite for layout, plus the CLI itself for wiring —
`node src/cli.js fleet` from a fixture tree is the fastest way to see a real frame.

**Why this approach**: Layout is iterated on dozens of times, and a pure string function under a
scoped test file gives sub-second turnaround; the golden-file workflow (`UPDATE_GOLDEN=1`) already
exists for blessing the final shape.

## File Changes

### New Files

| File Path                            | Purpose                                                     |
| ------------------------------------ | ------------------------------------------------------------- |
| `src/fleet-dash.js`                  | `renderFleetDashboard(model, now)` — the pure renderer       |
| `commands/fleet.md`                  | The `/waybill:fleet` slash command with its bang line        |
| `tests/fleet-dash-render.test.js`    | Bars, grouping, sort, nesting, purity, degraded columns      |
| `tests/fleet-dash-cmd.test.js`       | Verb wiring, arg handling, non-TTY single frame, goldens     |
| `tests/golden/fleet-dash-*.txt`      | Rendered frames — namespaced away from status's `fleet.txt`  |
| `openspec/changes/add-fleet-verb/**` | MODIFIED command-surface requirement admitting the fifth verb |

### Modified Files

| File Path                      | Changes                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.js`                   | Add `fleet` to `COMMANDS` (`:588`) and `USAGE` (`:31-52`) incl. `--depth`; add the `fleet()` handler; widen the `Io` typedef (`:24-29`) |
| `src/help.js`                  | Add the verb to the help card — must stay within `MAX_LINES = 45` (`:10`)                                                  |
| `docs/guide/03-reference.md`   | Add the `/waybill:fleet` section and the `--depth` flag — **mechanically required** by `tests/guide.test.js:197, :200-202`  |
| `tests/commands.test.js`       | Add `'fleet.md'` to the hardcoded `DECLARED` list (`:32-43`), asserted against `COMMANDS` at `:113`                        |
| `README.md`                    | Add the verb wherever the command set is enumerated                                                                        |
| `tests/index.js`               | Register `./fleet-dash-render.test.js` and `./fleet-dash-cmd.test.js`                                                      |

**Before starting, grep the prose surfaces** — `docs/ideation/learnings.md:21-30` records that this
repo describes its behavior in many places outside `src/`, and that specs' file tables miss them:

```bash
grep -rn 'new\|bay\|next\|status\|help' README.md docs/guide/ commands/ bookings/ src/help.js | grep -i 'verb\|command'
```

### Deleted Files

None.

## Implementation Details

### The pure renderer

**Pattern to follow**: `src/waybill.js:82` (`fleetPosition`) and `:104` (`strip`) for phrasing and the
manual space-padding column style. Follow the *idiom*, not the layout.

**Overview**: One pure function from model + clock to a printable frame.

```js
/** @param {FleetModel} model @param {number} now unix seconds @returns {string} */
export function renderFleetDashboard(model, now) {}

/** @returns {string} e.g. '███████░░░' */
export function bar(legIndex, legTotal, taskProgress, width) {}

/** @returns {string} e.g. '4d', '6h', '12m' */
export function humanAge(then, now) {}
```

**Target frame shape — Layout A, chosen from five mockups.** This is the canonical layout; treat it
as the spec, not as an illustration.

```
FLEET  6 dockets · 3 repos · 34 scanned                            ⟳ 2s

  DOCKET                  PROGRESS      LEG          OPEN  IDLE  PANE        ACTIVITY
  tinetti/waybill
    fix/stamp-scope       ██████████░  7/7 cleanup    12d    9d  –           –
    feat/fleet-dashboard  ███████░░░░  5/7 specs       4d    6h  @1:waybill  claude
     └ feat/nested-bays   ██░░░░░░░░░  2/7 bay         3h    3h  –           –
  emre/emre-team
    fix/mr-template       ████░░░░░░░  3/7 refine     21d   21d  –           –
    feat/batch-resolve    ████████░░░  6/7 execute     8d    2h  @3:emre     npm test
  tinetti/devops-tools
    feat/tls-renewal      █████████░░  6/7 execute     2d   40m  @2:devops   claude

  q quit   r refresh
```

Layout rules this frame encodes:

- **A column header row**, printed once, above the first repo group.
- **Repo group headings** at one indent, dockets at two, stacked children at three with `└`.
- **Fixed column starts** so every value left-aligns down the frame; ages right-align in their
  columns because they are numeric.
- **`–` for a known-empty cell** (no pane, no activity) versus **the whole column omitted** when tmux
  or `ps` was unavailable. These are different states and must look different.
- **The `⟳ 2s` indicator and the `q quit  r refresh` footer are live-mode only.** The one-shot
  non-TTY frame omits both — a refresh hint in piped output is noise, and a live ticker in a golden
  file makes it time-dependent. Phase 4 therefore renders neither; Phase 5 adds them above the pure
  renderer.
- **Rejected alternatives, recorded so they are not relitigated:** a card-per-docket layout (4 lines
  each, cannot fit 5–10 dockets on a screen), a leg-state matrix (new visual language, permanent
  legend line), a flat staleness gutter and a moving/stalled split (both abandon the repo grouping
  chosen for the sort order, and the split maximises frame churn for Phase 5's diffing repaint).

**Key decisions**:

- **`now` is a parameter.** No `Date.now()` inside this module, ever. This is the purity contract.
- **The bar interpolates the execute leg.** Base fill is `legIndex / 7`. When the docket is on
  `execute` and a task count is present, that leg's own slice is filled by `done / total`, so
  4-of-9 tasks reads as roughly 5.4/7 rather than a bar frozen at 5/7 for days. When the count has
  not arrived (deferred, or openspec absent), fall back to the whole-leg fill — never render a
  half-filled bar from missing data.
- **Group by repo, sort by idle descending within each.** Most-neglected first, because the primary
  problem is stalled dockets going unnoticed. Repos themselves sort by their most-stale docket.
- **Stacked children render nested under their parent**, indented with `└`, and are exempt from the
  staleness sort within their parent's subtree so the chain reads in dependency order.
- **Degraded columns disappear, they do not print blanks.** If `tmuxAvailable` is false, the pane
  column is omitted from every row rather than printed empty — an empty column implies "we checked
  and there is nothing", which would be a false claim.
- **No ANSI, no color.** The repo has zero escape bytes today and this phase keeps it that way; all
  terminal control belongs to Phase 5.
- **Width is fixed, not terminal-derived.** A `process.stdout.columns`-dependent renderer cannot have
  stable goldens. Phase 5 may pass a width in; Phase 4 takes a constant default.

**Implementation steps**:

1. Write `tests/fleet-dash-render.test.js` with a failing purity test: two calls with the same model
   and `now` return identical strings.
2. Implement `humanAge` with the unit ladder (m/h/d/w) and its boundary cases.
3. Implement `bar` including execute interpolation and the missing-count fallback.
4. Implement grouping, sorting, and stacked nesting.
5. Implement column omission driven by `tmuxAvailable` / `psAvailable`.
6. Bless goldens with `UPDATE_GOLDEN=1` and **read the diff before committing** (README:361).

**Feedback loop**:

- **Playground**: `tests/fleet-dash-render.test.js` plus `node src/cli.js fleet` against a fixture tree.
- **Experiment**: Render six models — (a) empty fleet; (b) one repo one docket; (c) three repos, seven
  dockets, mixed legs; (d) a three-deep stack; (e) `tmuxAvailable: false`; (f) a docket on execute with
  and without a task count. Assert the bar differs between the last two, and that (e) omits the column
  entirely rather than padding it.
- **Check command**: `node --test tests/fleet-dash-render.test.js`

### Verb wiring and the Io seam

**Pattern to follow**: `src/cli.js:314-338` (`status`) for the handler shape — arg rejection, `repoRoot`,
render, return 0.

**Overview**: Add the verb, and widen `Io` so Phase 5 has somewhere to inject.

```js
/** @typedef {{
 *   out:(text:string)=>void,
 *   err:(text:string)=>void,
 *   signals:()=>Signals,
 *   isTTY?: boolean,          // NEW — Phase 4 reads it, Phase 5 forks on it
 *   now?: () => number,       // NEW — injected clock, defaults to Date.now()/1000
 *   stdin?: NodeJS.ReadStream // NEW — Phase 5 only; unused here
 * }} Io */

function fleet(cwd, args, io) {}
```

**Key decisions**:

- **`fleet` does not call `repoRoot` as a gate.** It is the first verb that works outside a
  repository; `help` is the only existing precedent (`src/cli.js:343-345`). Inside a repo it still
  resolves the root and renders that repo only.
- **`--depth N` is the one accepted flag.** Reject anything else with exit 2 and `USAGE`, matching
  every other verb's arg handling. Reject non-integer and depth < 1 explicitly.
- **One-shot waits for complete data.** On the non-TTY path the command resolves the whole deferred
  progress lane (concurrently) before printing, then prints exactly one frame. Completeness beats
  speed here, per the contract's accuracy-over-speed decision, and it is what keeps goldens
  deterministic. The 500ms first-paint target belongs to Phase 5's live mode, where progressive fill
  actually has meaning.
- **`isTTY` is read here but only acted on in Phase 5.** Phase 4 always takes the one-shot path; it
  just makes the flag available so Phase 5 adds a branch rather than a rewrite.

**Implementation steps**:

1. Add `'fleet.md'` to `DECLARED` in `tests/commands.test.js:32-43` and watch `:113` fail — that is
   the RED step for the wiring.
2. Create `commands/fleet.md` with the guarded bang line, copying the shape from `commands/next.md:47`.
3. Add the handler, `COMMANDS` entry, and `USAGE` lines.
4. Widen the `Io` typedef and thread `now` through to the renderer.
5. Add the help-card line and re-run the `fits one screen` test against `MAX_LINES = 45`.
6. Add the `docs/guide/03-reference.md` section and re-run `tests/guide.test.js`.

**Feedback loop**:

- **Playground**: `node src/cli.js fleet` and `node src/cli.js fleet --depth 1` from a fixture tree.
- **Experiment**: Run from inside a repo, from a scan root, with `--depth 1`, with `--depth abc`, with
  an unknown flag, and piped to `cat`. Assert exit 0 for the first three, exit 2 with `USAGE` for the
  next two, and a single unchanged frame for the last.
- **Check command**: `node --test tests/fleet-dash-cmd.test.js`

### OpenSpec delta

**Overview**: A change directory whose `specs/command-surface/spec.md` carries a MODIFIED requirement
admitting the fifth verb, stacked on `add-help-card`'s wording rather than on the archived original.

**Key decisions**:

- Stack on the pending delta. `add-help-card` already rewords the requirement to "exactly four verbs
  plus one reference command"; this change must build on that text, not on
  `openspec/specs/command-surface/spec.md:10-19` directly, or the two will conflict at archive time.
- Update the requirement's verb table with the `fleet` row.

**Feedback loop**: Not needed — this is spec prose, validated by `openspec` tooling and review.

## Testing Requirements

### Unit Tests

| Test File                         | Coverage                                                           |
| --------------------------------- | -------------------------------------------------------------------- |
| `tests/fleet-dash-render.test.js` | Purity, bar math, age formatting, grouping, sort, nesting, omission |
| `tests/fleet-dash-cmd.test.js`    | Verb dispatch, `--depth`, arg rejection, non-TTY single frame, goldens |

**Key test cases**:

- Two renders with identical model and `now` are byte-identical.
- The bar for execute 4-of-9 differs from execute with no task count.
- A docket idle 90 seconds, 90 minutes, 90 hours, and 90 days formats correctly at each boundary.
- Within a repo, the most-idle docket renders first.
- A three-deep stack renders nested in dependency order, not staleness order.
- `tmuxAvailable: false` omits the pane column from every row rather than padding it.
- A docket with no pane while tmux IS available renders `–`, which is visibly different from the
  column being absent — "we looked and found nothing" versus "we could not look".
- The column header row prints exactly once, above the first repo group, not per group.
- A branch name longer than the DOCKET column is truncated rather than wrapping or pushing every
  other column out of alignment.
- Neither the `⟳` indicator nor the `q quit / r refresh` footer appears in Phase 4's output.
- An empty fleet renders a sensible frame, not an empty string.
- `fleet --depth 1` and `fleet --depth 4` produce different frames against a nested fixture.
- `fleet --depth abc`, `fleet --depth 0`, and `fleet --bogus` each exit 2 and print `USAGE`.
- Piped output contains no ANSI escape bytes and appears exactly once.

### Manual Testing

- [ ] `node src/cli.js fleet` from the repo root.
- [ ] `node src/cli.js fleet` from `~/Projects`.
- [ ] `node src/cli.js fleet | cat` — one frame, no escapes.
- [ ] `node src/cli.js help` — card still fits one screen.

## Error Handling

| Error Scenario                 | Handling Strategy                                            |
| ------------------------------ | -------------------------------------------------------------- |
| Unknown flag or positional arg | Exit 2 with `USAGE`, matching every other verb                |
| `--depth` non-integer or < 1   | Exit 2 with a specific message naming the flag                |
| No repositories found at all   | Render the header plus `scanned 0 repos`; exit 0, not an error |
| Repos found, none with dockets | Render the header plus the scanned count; exit 0              |
| A docket with `null` age       | Render a dash in that column; never `NaN` or `Invalid Date`   |
| `stackedOn` names a missing branch | Render the docket flat; do not crash on a dangling parent  |

## Failure Modes

| Component | Failure Mode                          | Trigger                                      | Impact                                            | Mitigation                                                    |
| --------- | ------------------------------------- | -------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Renderer  | Goldens fail overnight                | `Date.now()` called inside the renderer      | Time-dependent tests; the whole suite goes flaky   | `now` is a parameter; purity test asserts it                    |
| Renderer  | Half-filled bar from absent data      | Missing task count treated as 0-of-N         | Docket looks barely started when it is nearly done | Explicit fallback to whole-leg fill; dedicated test              |
| Renderer  | Blank column read as "nothing running" | tmux unavailable rendered as empty cells     | Operator trusts an absence that was never checked  | Omit the column entirely, driven by `tmuxAvailable`             |
| Renderer  | Infinite recursion on nesting         | A `stackedOn` cycle survives Phase 2's guard | Renderer hangs                                     | Visited set while walking the tree; render flat on detection    |
| Wiring    | Suite fails on the DECLARED list      | `commands/fleet.md` added without `DECLARED` | `tests/commands.test.js:113` fails                 | Add `DECLARED` first as the RED step                             |
| Wiring    | Guide cross-reference missed          | `docs/guide/03-reference.md` not updated     | `tests/guide.test.js:197` fails — the recorded repeat mistake | Named in File Changes; validated in the command block |
| Wiring    | Help card overflows                   | A verb line pushes past `MAX_LINES = 45`     | `tests/help.test.js` "fits one screen" fails       | Re-run that test immediately after the card edit                 |
| Wiring    | Living spec left stale                | Fifth verb ships without the OpenSpec delta  | `command-surface` spec states something false      | The delta is an MVP deliverable, not a follow-up                 |

## Validation Commands

```bash
# Scoped inner loop
node --test tests/fleet-dash-render.test.js
node --test tests/fleet-dash-cmd.test.js

# Bless goldens — then READ the diff before committing (README:361)
UPDATE_GOLDEN=1 node --test tests/fleet-dash-cmd.test.js
git diff tests/golden/

# The mechanically-enforced prose surfaces
node --test tests/guide.test.js tests/commands.test.js tests/help.test.js

# status must be untouched
node --test tests/cli.test.js tests/waybill.test.js tests/fleet.test.js
git diff --exit-code main -- tests/cli.test.js tests/waybill.test.js tests/fleet.test.js \
  tests/golden/status.txt tests/golden/fleet.txt tests/golden/fleet-empty.txt

# Barrel registration
for f in tests/fleet-dash-*.test.js; do grep -q "'./$(basename "$f")'" tests/index.js || { echo "unregistered: $f"; exit 1; }; done

# Whole suite
node --test tests/
```

## Open Items

- [ ] Confirm the fixed render width. Layout A's header row is ~86 columns, so 88 is the working
      proposal; confirm the frame reads well in the operator's actual terminal before blessing
      goldens. Branch names longer than the DOCKET column need a truncation rule — middle-ellipsis
      is the proposal, since the distinguishing part of a branch name is usually its tail.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
