# next drives the route Contract

**Created**: 2026-09-29
**Readiness**: All 5 gates ready
**Status**: Approved
**Supersedes**: None

## Problem Statement

Waybill's `next` reports; it does not drive. `commands/next.md:51-61` instructs the session to show the CLI's waybill block verbatim and stop — "It is already the whole answer" — and running the commands it lists is explicitly the next session's job. The only override is a `RUN:` line, which the CLI prints only when the operator has already pasted `/waybill:next <branch>/<leg>` after clearing. Every leg boundary on the eight-leg route is therefore a manual relay.

That relay costs roughly 28 paste blocks per effort: each `handover: transfer` leg renders `/clear`, `/model`, `/effort` and the command; each `through` leg renders three. Eight legs, eight stops. Four of those stops — `bay`, `specs`, `execute`, `cleanup` — ask nothing of the operator's judgment; they are pure transport, and the operator is the conveyor belt.

The sharpest cost is not keystrokes but presence. Because nothing advances without a paste, an effort cannot progress while the operator is away, even across `specs` and `execute` — the two longest legs on the route, and the two that most obviously want to run unattended. A route designed to be walked in sessions currently requires a human at every session boundary, including the boundaries that exist only for context hygiene.

## Goals

1. Under `--autopilot`, halt exactly once per gate the command can reach — three halts (`refine`, `contract`, `review`) rather than today's eight — and never halt for transport.
2. Walk a complete eight-leg route in at most 6 `/waybill:next` invocations, down from ~28 paste blocks; the fourth operator stop belongs to `/waybill:new` conducting `ideate` and is unchanged by this work.
3. Raise the longest unattended run from 0 legs to 2, so `specs` and `execute` cross without the operator present.
4. Make gate membership explicit data — a `gate` field on the route — rather than prose scattered across `commands/*.md`.
5. Preserve the context hygiene that `handover: transfer` buys: a leg whose booking names a more capable model than the running session must never run degraded in silence.

## Success Criteria

- [ ] The route declares `gate` on `ideate`, `refine`, `contract` and `review`, and on no other leg — check: `node --test --test-name-pattern 'route declares its gates' tests/legs.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] `/waybill:status`'s in-bay answer renders the paste blocks `/waybill:next` renders today, with no existing golden's content modified — check: `node --test tests/cli.test.js tests/waybill.test.js && git diff --exit-code --diff-filter=M -- tests/golden/`
- [ ] `/waybill:status` on the trunk still renders the fleet listing with no waybill attached — check: `node --test --test-name-pattern 'fleet listing carries no waybill' tests/fleet.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] On a non-gate leg the CLI emits the run literal and no paste blocks — check: `node --test --test-name-pattern 'non-gate leg emits the run literal' tests/cli.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] On a gate leg the CLI emits the gate literal and stops — check: `node --test --test-name-pattern 'gate leg halts the walk' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] A full-route fixture walk under `--autopilot` halts exactly three times, once per reachable gate — check: `node --test --test-name-pattern 'halts once per reachable gate' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] A full-route fixture walk completes in at most six invocations — check: `node --test --test-name-pattern 'walks the route in six invocations' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] From a contract-stamped fixture, one `--autopilot` invocation crosses `specs` and `execute` and halts at `review` — check: `node --test --test-name-pattern 'crosses specs and execute' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] A leg that runs without flipping its stamp yields exactly one ask and one carrier invocation — check: `node --test --test-name-pattern 'failed stamp asks once and retries never' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] A non-gate `transfer` leg is dispatched to a subagent at its booked model; a `through` leg runs in-session; a gate leg is never dispatched — check: `node --test --test-name-pattern 'transfer dispatches and gates never do' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] Each crossed leg reports the model it actually ran at — check: `node --test --test-name-pattern 'run log names the model per leg' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] `cleanup` is crossed only when its bay is clean; dirty worktree, unpushed commits or an unmerged branch halts with the ask — check: `node --test --test-name-pattern 'cleanup halts on an unclean bay' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] Gitignored papers in a clean bay are deleted but named in the run log — check: `node --test --test-name-pattern 'cleanup names the ignored papers it removes' tests/autopilot.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] The repo-root README, docs/guide, commands/*.md and the help card carry the new verb, asserted positively — check: `node --test --test-name-pattern 'root README carries the new verb' tests/guide.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] The zero-dependency, no-build, node --test-only toolchain invariant holds — check: `node --test --test-name-pattern 'zero dependencies and no build step' tests/commands.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] Every command that shells out wraps its bang line — check: `node --test --test-name-pattern 'every shelling command wraps its bang line' tests/bang-lines.test.js 2>&1 | grep -qE '^# pass [1-9]'`
- [ ] The whole suite is green — check: `node --test tests/`
- [ ] The operator walks one real docket end-to-end under `--autopilot` and confirms it stops only at the gates, conducts each one, and never runs a leg at the wrong model in silence — judgment call: an end-to-end run on a live effort

## Scope Boundaries

### In Scope

- A `gate` field on the route in `src/legs.js`, true for `ideate`, `refine`, `contract` and `review` (`ideate`'s is documentation-only — `next` never reaches that leg)
- `/waybill:next` executes the next leg, invoking its carrier rather than printing paste blocks
- `/waybill:next` conducts a gate leg and then stops, crossing nothing after it
- `/waybill:status`'s in-bay answer gains the waybill paste blocks; the trunk fleet listing keeps none
- `/waybill:next --autopilot` crosses non-gate legs until a gate, conducts it, and stops
- A non-gate leg booked `handover: transfer` is dispatched to a subagent at its booked model; `through` legs run in-session; gate legs are never dispatched
- Stop-and-ask when a crossed leg runs but its stamp does not flip: one prompt offering retry, inspect, or stop
- A run log naming, per crossed leg, the model it actually ran at
- `cleanup` pre-flight: crossable when the bay is clean, halting on a dirty worktree, unpushed commits or an unmerged branch; gitignored papers deleted but named
- A `gate:` key in booking frontmatter overriding the route default in either direction *(Full tier)*
- Sweep every prose surface describing `next` as show-and-stop, and add the missing root-README assertion
- Update `docs/guide/03-reference.md` in the same phase as each new booking key and CLI flag

### Out of Scope

- Effort fidelity on dispatched subagents — a subagent takes `model` but not `effort`; a dispatched `execute` runs opus-at-default rather than opus/high
- Splicing non-stock legs into the route via `after:` — already deferred to Future in commit 0c5c5fc
- Fleet-wide autopilot across several open dockets — one docket per invocation
- Any retry beyond the single ask — no backoff, no automatic second attempt, no repair logic
- Changing `ideate`'s stamp or giving it a paper — `next` never reaches it, and a paper written before `bay` exists would land in the main checkout
- Gate awareness in `/waybill:new` — it already conducts `ideate` and stops
- Discovering the running session's model, and any model-capability ranking table — nothing in `src/` can learn it, and a ranking would go stale each model generation

### Future Considerations

- Detecting session cleanliness rather than assuming it, if assuming-clean proves wrong in practice
- Making `effort` settable on a dispatched subagent, should the harness ever expose it
- A gate that is situational rather than static — a leg becoming a gate because a stamp returned `STAMP_UNKNOWN` or a diff crossed a size threshold
- `--autopilot --dry-run`: print the run autopilot would make, and where it would stop, without running anything *(Stretch)*

## Execution Plan

### Dependency Graph

```
Phase 1: The gate field
  └── Phase 2: status carries the waybill  (blocked by Phase 1)
        └── Phase 3: next executes the leg  (blocked by Phase 2)
              └── Phase 4: autopilot, the failed-stamp ask, and cleanup pre-flight  (blocked by Phase 3)
                    ├── Phase 5: The booking-level gate override  (blocked by Phase 4, non-blocking)
                    └── Phase 6: The prose sweep  (blocked by Phase 4)
```

Phases 5 and 6 share a single blocker and would otherwise parallelize, but both modify `docs/guide/03-reference.md` and `tests/guide.test.js`. The overlap is not worth coordinating for an S and an M, so the run stays sequential.

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, and gates on failure:

```bash
/ideation:autopilot docs/ideation/next-drives-the-route/contract.md
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — The gate field _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-1.md
   ```

2. **Phase 2** — status carries the waybill _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-2.md
   ```

3. **Phase 3** — next executes the leg _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-3.md
   ```

4. **Phase 4** — autopilot, the failed-stamp ask, and cleanup pre-flight _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-4.md
   ```

5. **Phase 5** — The booking-level gate override _(non-blocking, Full tier)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-5.md
   ```

6. **Phase 6** — The prose sweep _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-drives-the-route/spec-phase-6.md
   ```

### Ordering Note

Phase 2 must land before Phase 3. Phase 3 removes `next`'s ability to print the paste-relay; Phase 2 gives that ability to `status`. Reversing them produces a commit in which the manual relay is unreachable and a model mismatch has no escape hatch.

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
