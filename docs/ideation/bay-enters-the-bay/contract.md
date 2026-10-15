# Bay enters the bay Contract

**Created**: 2026-10-12
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

No Waybill command moves a session into a docket's bay without also running a leg there. `/waybill:bay <branch>` cuts or finds the bay and prints a waybill but never moves the session; the only mover is `/waybill:next <branch>/<leg>`, whose `ENTER BAY:` line is always followed by a `RUN:` that starts the leg.

The operator hits this whenever they want to stand in a bay to look around, finish by hand, or check state mid-session — on 2026-10-07 entering `feat/fleet-dashboard` took `/wt`, a personal skill outside Waybill that knows nothing about dockets. The gap widens once `feat/next-drives-the-route` lands and a named `next` always executes.

## Goals

1. `waybill bay --markdown <branch>` prints `ENTER BAY: <bay path>` whenever the operator is not already inside that bay — newly cut or pre-existing — and never prints `RUN:` or `NEXT LEG:`.
2. When the bay's next leg is `cleanup`, `bay` still enters and its output carries a WARNINGS entry saying cleanup will remove the bay.
3. `/waybill:bay` moves the session into the bay with EnterWorktree, leaving any other worktree first with ExitWorktree (keep), falls back to a `cd <path>` line when the move fails, and then stops.
4. Every prose surface that says `bay` does not move the session is brought in line.

## Success Criteria

- [ ] bay --markdown prints ENTER BAY: for a newly cut and a pre-existing bay, with no RUN: or NEXT LEG: line — check: `out=$(node --test --test-name-pattern 'bay markdown enters the bay' tests/cli.test.js 2>&1) && printf '%s' "$out" | grep -qE '^# pass [1-9]'` → exits 0
- [ ] bay --markdown prints no ENTER BAY: for a bay the operator is already inside (the test asserts its cwd is the bay path) — check: `out=$(node --test --test-name-pattern 'bay markdown does not enter a bay it is already inside' tests/cli.test.js 2>&1) && printf '%s' "$out" | grep -qE '^# pass [1-9]'` → exits 0
- [ ] A bay whose next leg is cleanup is still entered, and both terminal and markdown output carry the cleanup warning — check: `out=$(node --test --test-name-pattern 'bay warns when the next leg is cleanup' tests/cli.test.js 2>&1) && printf '%s' "$out" | grep -qE '^# pass [1-9]'` → exits 0
- [ ] commands/bay.md allows EnterWorktree and ExitWorktree, carries the ENTER BAY: and exit-first rules, and its menu descriptions promise entry — check: `out=$(node --test --test-name-pattern 'bay.md enters the bay' tests/commands.test.js 2>&1) && printf '%s' "$out" | grep -qE '^# pass [1-9]'` → exits 0
- [ ] The guide's waybill samples still match the re-blessed goldens after the booking body changes — check: `out=$(node --test --test-name-pattern 'samples match their goldens' tests/guide.test.js 2>&1) && printf '%s' "$out" | grep -qE '^# pass [1-9]'` → exits 0
- [ ] The stale 'bay does not move you' prose is gone from bay.md, the bay booking and its guide copy, and bay.md names ExitWorktree — check: `! grep -qF 'once I have typed' commands/bay.md && ! grep -qF 'prints its waybill' commands/bay.md && ! grep -qF 'moves the next session into the bay' bookings/waybill-bay.md docs/guide/01-ride-along.md && grep -q 'ExitWorktree' commands/bay.md` → exits 0
- [ ] The full suite passes — judgment call: The PR's CI run of `node --test tests/` is green (the suite runs ~210s, past the verify timeout).
- [ ] A live session lands and stays in the bay — judgment call: Operator runs `/waybill:bay <existing branch>` from the trunk and again from inside another bay, confirms the session is in the target bay each time, then types /clear and confirms it is still there.

## Scope Boundaries

### In Scope

- CLI: `bay --markdown` passes `{ bay, enter: true }` unless already inside, so the renderer prints `ENTER BAY: <path>` with no token (no RUN:/NEXT LEG:). The heading stays first, as the command-surface spec requires, so `ENTER BAY:` follows it — The CLI decides when to move, as it does for next; the renderer line already exists (src/waybill.js:364-369). bay.md's rules for it are new, adapted from next.md:71-90.
- CLI: when `state.leg === 'cleanup'`, push a warning onto `state.warnings` so it renders in WARNINGS in both terminal and markdown output — Operator chose to enter cleanup bays, with a warning; state.warnings is the existing path (onRamp, cli.js:436-457).
- commands/bay.md: on a line beginning `ENTER BAY:` (wherever it appears in the block), always call ExitWorktree (keep) first — treating "no active worktree session" as fine to continue — then EnterWorktree with the path; on an EnterWorktree failure say why in one line, show `cd <path>` and the block, and stop — The move itself. bay.md cannot tell whether it is in another worktree (no git on its allowed-tools), so the exit is unconditional; that is /mar's approach, and ExitWorktree is a no-op outside a worktree session.
- commands/bay.md: allowed-tools gains EnterWorktree, ExitWorktree and ToolSearch — The allowed-tools list is restrictive; an undeclared tool is silently unavailable. Both worktree tools were deferred in this session and needed ToolSearch to load (as /mar's test pins); the live smoke confirms.
- No-arg menu descriptions: `no bay yet — cuts one and enters it`, `new branch — cuts it and its bay, and enters it`, `bay exists — enters it` — The menu promises what the choice does.
- Prose sweep: bookings/waybill-bay.md (with tests/golden/bay.md, bay.txt and the docs/guide/01-ride-along.md sample), README.md bay sections, docs/guide/01-ride-along.md and 03-reference.md, src/help.js walkthrough steps 3 and 5 (with tests/golden/help.txt), the src/cli.js:145 and bay() comments, commands/bay.md comment blocks — Learning from next-from-anywhere: behavior prose outside src/ goes stale unless every hit is listed.
- Tests: re-bless the bay-cut, bay and help goldens, replace the 'bay already exists' starts-with assertion, add the named tests above, update the bay.md allowed-tools assertion (tests/commands.test.js:471) — Every functional change is pinned by a test that fails first.

### Out of Scope

- bay running the next leg — That is next's job; bay enters, shows the waybill, and stops.
- Changing next's own ENTER BAY rules (including its refusal to enter a cleanup bay) — Out of the brainstorm's scope; next's refusal stays as is.
- Terminal (non-markdown) bay moving anything — A terminal has no session to move; it keeps printing its cd line.
- /wt, and any worktree creation path — /wt is a personal skill outside Waybill; bay already cuts worktrees.
- Writing the OpenSpec living-spec delta in this phase — The specify leg owns openspec/specs/command-surface changes.

### Future Considerations

- None.

## Decisions Considered and Rejected

- **Extend /waybill:bay to enter the bay** — rejected: A new /waybill:enter verb. It would be a second command for the same docket and bay; bay already finds existing bays.
- **bay enters every time it is not already inside** — rejected: An opt-in flag. Entering is what the operator wants whenever they name a branch.
- **Enter a bay whose next leg is cleanup, with a warning** — rejected: Refuse, as next does. Naming the branch is a deliberate request to go in; cleanup runs by branch name from anywhere.
- **From inside another bay, ExitWorktree (keep) then EnterWorktree** — rejected: Refuse and print cd. Bay-to-bay is the commonest reason for the feature; /wt already proves exit-first works.
- **Keep Waybill's own mover** — rejected: Keep using /wt. /wt is outside Waybill and knows nothing about dockets or the waybill.
- **Cleanup warning via state.warnings in the WARNINGS block** — rejected: A dedicated line beside ENTER BAY:. Reuses the existing renderer path in both outputs; no new literal for bay.md to key on.
- **Verify with named node tests plus one live smoke judgment** — rejected: Node tests only. EnterWorktree and /clear persistence are session behavior no node test can execute.
- **Independent of feat/next-drives-the-route** — rejected: Block on it, or land first by plan. This change touches bay only; whichever merges second rebases and re-blesses goldens.
- **bay.md always calls ExitWorktree (keep) before EnterWorktree, continuing past "no active worktree session"** — rejected: Exit only when inside another worktree (detected via git rev-parse, as /wt does). Hidden-dependency critic: bay.md has no git on its allowed-tools and the CLI emits no such signal; an unconditional exit needs neither.
- **Keep bay's heading first; bay.md keys on an `ENTER BAY:` line wherever it appears** — rejected: Move ENTER BAY: above the heading, as next prints it. Hidden-dependency critic: the command-surface spec requires the heading first; keying by line start needs no spec change.
- **Each test criterion gates on node --test's own exit code plus a pass-count grep** — rejected: Grep for '# pass' alone, with one criterion re-running its file to check '# fail'. Success-criteria critic: a pattern matching several tests let one pass mask a failure, and the double run doubled time against the verify cap.
- **Add a negated-grep criterion on today's stale bay prose, with an ExitWorktree positive twin** — rejected: Leave the prose sweep unchecked. Success-criteria critic: goal 4 had no criterion, so a sweep that missed a surface would still pass.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
bay enters the bay
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/bay-enters-the-bay/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Bay enters the bay contract (bay-enters-the-bay) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/bay-enters-the-bay/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/bay-enters-the-bay/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — bay enters the bay _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/bay-enters-the-bay/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
