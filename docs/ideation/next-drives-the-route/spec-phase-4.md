# Implementation Spec: next drives the route — Phase 4

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Autopilot is a session loop driven by CLI literals, not a loop inside the CLI. The CLI cannot run legs — it renders and exits — so the shape is: the CLI emits one leg's literal, the session acts on it, the session re-invokes the CLI, and the CLI re-derives position from the repo and emits the next. The loop terminates because every iteration either advances the route or halts.

That works only because waybill is stateless. Position is re-derived from repo reality on every call (`src/inference.js`), so a crossed leg is simply a repo that now stamps differently. Nothing is tracked, nothing is resumed, and an autopilot run killed halfway is indistinguishable from one that never started — run it again and it picks up from the stamps. This is the property that makes the whole feature cheap.

The one thing the CLI cannot re-derive is _which leg the session just ran_. It gets told: the session re-invokes with `--after <leg>`. If the current leg is still `<leg>`, the stamp did not flip, and the CLI emits the halt-and-ask rather than the same `RUN:` line again. One attempt per leg, always — this is the entire runaway guard, and it needs no leg budget because it cannot emit the same instruction twice.

`cleanup` is crossable, which lets one autopilot run finish an effort — but only from a clean bay. Its destructive git steps are pre-approved in `commands/cleanup.md` on the condition that the CLI has first checked the bay for uncommitted tracked changes, unpushed commits, and an unmerged branch. Any of those halts with the ask. Gitignored papers do not halt: they are deleted with the bay and named in the run log, because most of the time that is what the operator wants and silence is the only unacceptable part.

Autopilot assumes the session is clean enough to cross two legs. That assumption is safe here mainly because the legs worth crossing are `transfer` legs, and phase 3 sends those to subagents — so the crossing session accumulates a report per leg, not a leg's worth of working context.

## Feedback Strategy

**Inner-loop command**: `node --test tests/autopilot.test.js`

**Playground**: A new `tests/autopilot.test.js` built on `tests/helpers/repo-fixture.js`, with a driver helper that simulates the session loop — run the CLI, read the literal, apply a scripted effect to the fixture (flip a stamp or refuse to), re-invoke with `--after`. This makes a full-route walk a unit test.

**Why this approach**: The loop's correctness is entirely about which literal follows which repo state. A scripted driver over fixtures tests exactly that, in milliseconds, without invoking a real carrier.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `tests/autopilot.test.js` | The walk driver and every named case the contract's criteria grep for |
| `tests/fixtures/autopilot.js` | Scenario builders: a docket parked at each leg, a bay with a dirty worktree, a bay with unpushed commits, a bay with gitignored papers |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/cli.js` | `next` accepts `--autopilot` and `--after <leg>`. Route the halt cases. |
| `src/waybill.js` | Emit `HALT:`, `CROSSED:` and `STAMP NOT FLIPPED:`. Export them alongside the phase-3 literals. |
| `src/inspection.js` | Add the cleanup pre-flight: dirty tracked files, untracked files, unpushed commits, unmerged branch. Reuse `checkIgnored` for the papers list. |
| `src/legs.js` | `cleanupIsDone` is unchanged; the pre-flight is a separate read, since "is it safe to run" and "has it run" are different questions. |
| `commands/next.md` | Add the autopilot loop and the halt literals to the Task section. The bang line learns to split `--autopilot` from a named target. |
| `commands/cleanup.md` | Pre-approve the destructive git steps in `allowed-tools`, conditioned in prose on the pre-flight having passed. |
| `docs/guide/03-reference.md` | Document `--autopilot`. `tests/guide.test.js:202-204` asserts every USAGE flag appears here. |
| `tests/commands.test.js` | Update the pinned bang lines and `allowed-tools` for `next` and `cleanup`. |
| `tests/index.js` | Re-import the new suite, so Node 22 and Node 26 both see it. |

## Implementation Details

### The autopilot loop

**Overview**: Four literals close the loop.

| Literal | Meaning |
| --- | --- |
| `CROSSED: <leg>` | This leg advanced; log it and continue |
| `HALT: gate <leg>` | A gate was reached; conduct it (via the accompanying `RUN:`) and stop |
| `HALT: route complete` | No legs remain |
| `STAMP NOT FLIPPED: <leg>` | The leg ran and did not advance; ask, do not retry |

```js
// src/cli.js — next(), under --autopilot
const state = resolveLeg(cwd, bookings);

if (after && state.leg.id === after) {
  // Ran, did not advance. One attempt per leg: never re-emit the same RUN:.
  return io.out(renderStampNotFlipped(state, after)), 0;
}
if (after) lines.push(`${CROSSED} ${after}`);

if (!state.leg)            return io.out(`${HALT} route complete\n`), 0;
if (state.leg.gate)        return io.out(renderGate(state)), 0;   // GATE: + RUN:, then stop
if (state.leg.id === 'cleanup') {
  const unclean = cleanupPreflight(root, state);
  if (unclean) return io.out(renderHalt(`cleanup — ${unclean}`)), 0;
}
io.out(renderCross(state));   // RUN: or DISPATCH:, plus CONTINUE
```

**Key decisions**:

- `--after` is the only state the session carries between iterations, and it is a leg id the CLI itself printed. The session never invents it.
- No leg budget. The `--after` comparison makes a second identical instruction impossible, so a budget would only cap a loop that cannot form.
- `HALT: gate <leg>` accompanies `GATE:` and `RUN:` from phase 3 rather than replacing them. Bare `next` and `next --autopilot` render the same thing at a gate; only the crossing behaviour differs.
- The halt reason is part of the literal, so the session reports why it stopped without interpreting anything.

**Implementation steps**:

1. Write the walk driver in `tests/autopilot.test.js` and the failing `halts once per reachable gate` case.
2. Add `--autopilot` and `--after` parsing.
3. Emit `CROSSED:` and the three halt shapes.
4. Add the remaining named cases.

**Feedback loop**:

- **Playground**: The scripted driver over `tests/fixtures/autopilot.js`.
- **Experiment**: Walk a fixture from `bay` to `cleanup`, flipping each stamp as its literal is consumed, and record the halt sequence. Assert it is exactly `refine`, `contract`, `review`, then `route complete` — three gate halts. Then re-run the walk with `execute`'s stamp scripted to refuse and assert the sequence ends at `STAMP NOT FLIPPED: execute` with exactly one `RUN:`/`DISPATCH:` for that leg in the whole transcript.
- **Check command**: `node --test tests/autopilot.test.js`

### The failed-stamp ask

**Overview**: One prompt, three answers, no automatic retry.

**Key decisions**:

- The CLI renders the question's substance — which leg, what its stamp wanted, how far it got (for `execute`, the ticked-task count from `src/progress.js`). The session renders it as an `AskUserQuestion` with the three fixed answers: run it again, show me what is open, stop.
- "Run it again" re-invokes without `--after`, so the next iteration treats it as a first attempt. The operator supplies the retry decision; waybill never does.
- A carrier that cannot be resolved at all — the bare `/spec:*` commands exist only through the user-level links the README describes, and `openspec` must be on PATH — surfaces here rather than stalling. The session says which command failed to resolve, and that becomes the ask's context.
- An unattended run does block on this prompt. That is the accepted trade: a halt that waits is better than a halt that guesses.

**Feedback loop**:

- **Playground**: The driver, with a fixture whose stamp never flips.
- **Experiment**: Script `execute` to tick 11 of 14 tasks. Assert the rendered ask names the leg, the stamp's target file, and `11 of 14`; assert exactly one carrier instruction was emitted for `execute` across the whole walk.
- **Check command**: `node --test --test-name-pattern 'failed stamp asks once' tests/autopilot.test.js`

### The cleanup pre-flight

**Pattern to follow**: `src/inspection.js`'s `checkIgnored` — a read-only repo inspection returning findings.

**Overview**: Four checks, any of which halts.

```js
// src/inspection.js
export function cleanupPreflight(root, state) {
  if (hasUncommittedTracked(state.bayPath)) return 'the bay has uncommitted changes';
  if (hasUnpushedCommits(state.bayPath))    return 'the branch has commits that are not pushed';
  if (!isMerged(root, state.branch))        return 'the branch is not merged';
  return null;   // gitignored papers do not halt — they are named and removed
}
```

**Key decisions**:

- Gitignored papers are deliberately not a halt. The operator's instruction was that deleting them is nearly always fine; the requirement is that they are named, not that they are spared.
- Untracked-but-not-ignored files count as uncommitted. A file the operator created and never added is work, and losing it unattended is the failure this pre-flight exists to prevent.
- The pre-flight is separate from `cleanupIsDone` (`src/legs.js:91`). "Has cleanup run" and "is it safe to run cleanup" are different questions and conflating them would make a dirty bay look like a finished leg.
- The pre-flight runs only under autopilot. A `next` the operator typed at `cleanup` conducts it with them present, and `commands/cleanup.md`'s own approval prompts are the guard there.

**Implementation steps**:

1. Add the failing fixtures: dirty bay, unpushed bay, unmerged branch, clean bay with ignored papers.
2. Implement the four checks.
3. Wire the halt into the autopilot branch.
4. Add the ignored-papers line to the crossing render.
5. Widen `commands/cleanup.md`'s `allowed-tools` and state the pre-flight condition in its prose.

**Feedback loop**:

- **Playground**: `tests/fixtures/autopilot.js` bay builders.
- **Experiment**: Run the pre-flight against all four fixtures and assert the exact halt reason for each, and `null` for the clean one. Then assert the clean-bay crossing render names each gitignored paper by path.
- **Check command**: `node --test --test-name-pattern 'cleanup' tests/autopilot.test.js`

### Argument splitting

**Overview**: `--autopilot` must combine with a named target.

**Key decisions**:

- `commands/next.md:47` passes `"$ARGUMENTS"` as one quoted token on purpose (the comment at lines 43-44 records why: an empty unquoted argument would reach the CLI as a branch named nothing). `src/cli.js:225-231` reads any non-dash positional as a branch, so `/waybill:next feat/x/execute --autopilot` currently resolves to a branch literally named `feat/x/execute --autopilot`.
- Fix in the bang line, not the CLI: detect the flag in `$ARGUMENTS`, pass it as its own argument, and pass the remainder quoted exactly as today. The CLI's positional rule stays untouched, and `tests/bang-lines.test.js` executes the result.

**Feedback loop**:

- **Playground**: `tests/bang-lines.test.js`, which runs the bang line through bash in a temp repo.
- **Experiment**: Drive the line with four argument strings — empty, `--autopilot`, `feat/x/execute`, and `feat/x/execute --autopilot` — and assert the CLI receives the right positional and flag in each.
- **Check command**: `node --test tests/bang-lines.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/autopilot.test.js` | The walk, the halts, the ask, the pre-flight |
| `tests/bang-lines.test.js` | Argument splitting |
| `tests/commands.test.js` | Pinned bang lines and `allowed-tools` for `next` and `cleanup` |
| `tests/inspection-gitignore.test.js` | The papers list feeding the cleanup log |

**Key test cases**:

- `halts once per reachable gate` — a full walk halts exactly three times before `route complete`.
- `walks the route in six invocations` — the driver counts CLI invocations across a full walk and asserts ≤ 6.
- `crosses specs and execute` — one invocation from a contract-stamped fixture reaches `review`.
- `failed stamp asks once and retries never` — exactly one carrier instruction per leg in the transcript.
- `cleanup halts on an unclean bay` — each of the three unclean fixtures gives its own halt reason.
- `cleanup names the ignored papers it removes` — every ignored path appears in the render.
- `run log names the model per leg` — dispatched legs show their model; in-session legs say so.
- `transfer dispatches and gates never do` — carried from phase 3, re-asserted across a full walk.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| The loop | Infinite re-run of one leg | `--after` dropped or mismatched | Autopilot burns tokens forever on a leg that cannot stamp | The `--after` comparison is the first branch in the autopilot path and has its own test |
| The loop | A leg is skipped | `resolveLeg` reports the wrong current leg after a partial stamp | Work is left undone and `cleanup` runs early | The walk asserts the full crossed sequence, not only the halt count |
| Cleanup pre-flight | Passes on a dirty bay | `hasUncommittedTracked` misses untracked files | Uncommitted work deleted unattended with the worktree | Untracked counts as uncommitted; a dedicated fixture per condition |
| Cleanup pre-flight | Unmerged branch deleted | `isMerged` consulted against the wrong base | A branch's only copy is destroyed | Reuse the base resolution `src/inference.js:80-123` already performs; do not re-derive it here |
| `--after` | Session supplies a leg the CLI never printed | Prose invites the session to infer it | The CLI's guard is bypassed and a leg re-runs | The literal is copied from `CROSSED:`; the prose says copy, never infer |
| Dispatch | Carrier unresolvable on this machine | The user-level `/spec:*` links are missing, or `openspec` is off PATH | A crossed leg silently does nothing; the stamp never flips | Surfaces as `STAMP NOT FLIPPED:` with the unresolved command named in the ask |
| Argument splitting | `--autopilot` swallowed into the branch name | The bang line quotes the whole of `$ARGUMENTS` | `no bay for "feat/x/execute --autopilot"` | Four-case bang-line test |
| Session context | A long walk exhausts the session | Several `through` legs crossed in one run | The loop degrades mid-route | `transfer` legs go to subagents, so the crossing session accumulates reports, not working context |

## Validation Commands

```bash
# Inner loop
node --test tests/autopilot.test.js

# Contract criteria 6, 7, 8, 9
node --test --test-name-pattern 'halts once per reachable gate' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'
node --test --test-name-pattern 'walks the route in six invocations' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'
node --test --test-name-pattern 'crosses specs and execute' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'
node --test --test-name-pattern 'failed stamp asks once and retries never' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'

# Command-file surfaces
node --test tests/commands.test.js tests/bang-lines.test.js

# Full suite
node --test tests/
```

## Open Items

- [ ] Decide whether `HALT: route complete` fires on the trunk after `cleanup` removes the bay. Once the bay is gone the docket is gone, so the next invocation has no docket to report on and falls through to `no dockets open`. That may be the right answer — say so explicitly rather than letting it be an accident.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
