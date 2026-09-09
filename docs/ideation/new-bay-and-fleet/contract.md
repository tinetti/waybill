# new, bay, and the fleet view Contract

**Created**: 2026-09-09
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

`waybill next` answers two unrelated questions with one command and picks between them by reading the checked-out branch. On a docket it issues the next leg's waybill — the thing the command is named for. On the trunk it issues leg 1's, which is not 'what comes next on this docket' but 'how do I begin an effort at all'. The seam is visible at src/waybill.js:50-56, where the header branches on docketOpen before it looks at leg, and renderWaybill suppresses the leg strip entirely because there is no position to report.

The second problem is that the trunk cannot see anything. A docket is defined as the checked-out branch (src/inference.js:84), so resolveLeg can only ever answer for the tree the operator is standing in. Reproduced during this interview in a scratch repository with two bays open: `waybill next` from the main checkout printed `main · no docket open` and exited 0, and `waybill status` named neither branch — a statement true of the current directory and false of the repository, and an exit code claiming success for a run that issued no waybill.

The third problem is a name. The leg has always been called `bay`: src/bay.js, tests/bay.test.js, tests/fixtures/bay.js and tests/golden/bay.txt all say so, and only the command disagrees. Left alone, introducing `new` beside `start` would replace the overload on `next` with a synonym collision on the trunk, where 'new' and 'start' both read as 'begin'. This is the smallest of the three problems and carries the largest blast radius, which is why it is named here rather than left implicit in the goal.

This contract is deliberately thin. The behaviour contract is openspec/changes/new-bay-and-fleet/specs/, and the full technical design with its six decisions is docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md. Both were written and approved before this contract existed. Restating them here would create the second copy that openspec/changes/new-bay-and-fleet/design.md explicitly warns would drift. What this contract adds is the execution plan and acceptance checks that actually fail when the work is not done, which neither of those documents carries.

## Goals

1. `waybill next` exits 0 if and only if it issued exactly one waybill — today the trunk exits 0 having issued none, and both the zero-docket and many-docket cases must exit 2.
2. Every docket in flight is enumerable from anywhere in the repository — today `waybill status` on a trunk with two bays open names neither of them.
3. Four verbs, each naming exactly one thing: `new`, `bay`, `next`, `status` — today there are three, one of which answers two unrelated questions and one of which disagrees with the leg it cuts.
4. The change is contained to the fleet boundary: src/inference.js and the six other modules proposal.md marks deliberately untouched have no diff at all.

## Success Criteria

- [ ] The full suite passes, with no net loss of tests (372 TAP ok lines today) — check: `npm test && test "$(node --test --test-reporter=tap tests/ 2>/dev/null | grep -cE '^ *ok ')" -ge 372` → exits 0; 0 failures and at least as many passing assertions as today
- [ ] EXIT CONTRACT, zero dockets: `next` on a bare trunk issues no waybill and exits 2 (today it exits 0) — check: `R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; (cd "$d" && node "$R/bin/waybill" next >/dev/null 2>&1); test $? -eq 2` → exits 0 (waybill exited 2)
- [ ] EXIT CONTRACT, many dockets: `next` on a trunk with two bays issues no waybill and exits 2 (today it exits 0) — check: `R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; git -C "$d" worktree add -q -b feat/two "$d/../two"; (cd "$d" && node "$R/bin/waybill" next >/dev/null 2>&1); test $? -eq 2` → exits 0 (waybill exited 2)
- [ ] EXIT CONTRACT, exactly one docket: `next` on the trunk issues that docket's waybill, naming its branch (today it prints `no docket open`) — check: `R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; (cd "$d" && node "$R/bin/waybill" next 2>&1) | grep -q 'feat/one'` → exits 0 (the branch is named in the issued waybill)
- [ ] FLEET VIEW: `status` on a trunk with two bays names both branches (today it names neither) — check: `R=$PWD; d=$(mktemp -d)/r; git init -q "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; git -C "$d" worktree add -q -b feat/one "$d/../one"; git -C "$d" worktree add -q -b feat/two "$d/../two"; test "$( (cd "$d" && node "$R/bin/waybill" status 2>&1) | grep -cE 'feat/(one|two)' )" -eq 2` → exits 0 (both branches listed)
- [ ] The usage block lists exactly the four verbs and no longer lists `start` — check: `test "$(node bin/waybill nosuchverb 2>&1 | grep -cE '^  (new|bay|next|status) ')" = 4 && ! node bin/waybill nosuchverb 2>&1 | grep -qE '^  start '` → exits 0
- [ ] The CLI dispatch table registers `bay` and `new` and no longer registers `start` — check: `grep -q "\['bay'" src/cli.js && grep -q "\['new'" src/cli.js && ! grep -q "\['start'" src/cli.js` → exits 0; the positive halves prove the checked line shape still exists
- [ ] The command files match the new surface: start.md gone, bay.md and new.md present — check: `test ! -e commands/start.md && test -e commands/bay.md && test -e commands/new.md` → exits 0
- [ ] BOUNDARY: src/inference.js has no diff at all — the check on the whole approach, per design §3 — check: `git diff --quiet $(git merge-base main HEAD) -- src/inference.js` → exits 0; --quiet (not --name-only) is what makes this fail on a difference, and merge-base survives main advancing
- [ ] BOUNDARY: the six other deliberately-untouched modules have no diff — check: `git diff --quiet $(git merge-base main HEAD) -- src/legs.js src/bookings.js src/frontmatter.js src/inspection.js src/progress.js src/openspec.js` → exits 0
- [ ] Every pre-existing golden covering the in-a-bay path is byte-unchanged — the cheapest proof the trunk/bay dispatch did not disturb the path that already worked — check: `git diff --quiet $(git merge-base main HEAD) -- tests/golden/ideate.txt tests/golden/contract.txt tests/golden/specs.txt tests/golden/execute.txt tests/golden/cleanup.txt tests/golden/complete.txt tests/golden/refine.txt tests/golden/status.txt` → exits 0
- [ ] tests/golden/no-docket.txt is byte-unchanged after being re-pointed at `new` — a diff there means the leg-1 waybill was altered by accident — check: `git diff --quiet $(git merge-base main HEAD) -- tests/golden/no-docket.txt` → exits 0
- [ ] The four new goldens are non-empty AND wired into the waybill suite — an orphan golden is invisible to tests/waybill.test.js, which resolves them by name — check: `for g in fleet select trunk-one-docket fleet-empty; do test -s "tests/golden/$g.txt" || exit 1; grep -q "$g" tests/waybill.test.js || exit 1; done` → exits 0
- [ ] commands/next.md declares AskUserQuestion on the allowed-tools line itself, not merely somewhere in the file — check: `grep -qE '^allowed-tools:.*AskUserQuestion' commands/next.md` → exits 0; an explanatory comment naming the tool must not be able to satisfy this
- [ ] The selection branch is keyed on the exact SELECT A DOCKET literal, present in both the renderer and the command file — check: `grep -q 'SELECT A DOCKET' commands/next.md && grep -rq 'SELECT A DOCKET' src/ && node --test tests/commands.test.js` → exits 0; the literal appears nowhere in src/ or commands/ today, so the positive greps fail until the work is done
- [ ] CONTAINMENT: the pre-existing repoRoot invisible-error fix did not ride along in this change — check: `! git diff $(git merge-base main HEAD) -- src/cli.js | grep -q 'is not inside a git repository'` → exits 0; src/cli.js is edited by five of six phases, so this is not vacuous
- [ ] The stderr-capture question is answered and the finding recorded in the change — judgment call: reviewer confirms the change records whether stderr from the `!` invocation reaches a session transcript, established by running the command from a non-git directory in a live session — no command in this repo can observe it

## Scope Boundaries

### In Scope

- Rename `start` to `bay`, no alias — The leg has always been called bay; only the command disagreed. Moved to the front of the sequence so every later phase is written against final verb names.
- Fleet and selection renderers, sharing the existing findings helper and a `cd`-block helper extracted from the bay path — Two surfaces that build their own blocks will eventually disagree about the same repository. The cd extraction is named here because it changes the existing, working bay success path.
- The exit contract: `next` exits 0 iff exactly one waybill was issued — Gives scripts one condition to test instead of three, and is the behaviour reproduced as broken today.
- Trunk dispatch for `next`, plus the optional positional `<branch>` — The trunk currently cannot answer for the repository at all. The positional is load-bearing for the selection loop, which re-runs the command against the chosen branch.
- `status` on the trunk as a fleet view, option-free — The docket list belongs on the read-only surface, keeping `next` to exactly one waybill.
- The `new` verb and commands/new.md — The trunk-side entry point, separating 'how do I begin' from 'what comes next'.
- The session-facing selection branch in commands/next.md with AskUserQuestion declared — The allowed-tools list is restrictive, so an undeclared prompt fails silently rather than loudly.
- Investigate the stderr-capture question and record the finding; the fix itself is deferred — Inherited from the approved design §2. Tiered explicitly here because it gates acceptance and writes to the change, so leaving it untiered would hide a deliberate choice.

### Out of Scope

- Cross-docket reasoning — The fleet view is a list. Nothing compares dockets, orders them by staleness, or warns that two touch the same files.
- A machine-readable `status` — `next --json` already carries the fleet shape in its ambiguous case, and the rule at src/cli.js:97 and README:124-125 against a second machine-readable surface stands.
- Interactive selection in the CLI — Decision 5: the CLI prints and exits, the session prompts. Keeps every output coverable by a golden file and adds no TTY-detection branch.
- Fixing the pre-existing invisible-error bug in repoRoot — Investigated and recorded by this change, fixed separately. A criterion checks the fix did not ride along.
- Correcting the stale `/waybill:start` comment at src/inference.js:113 — It sits inside the module the boundary criterion forbids touching. The boundary is worth more than one stale comment; the next change that legitimately opens that module fixes it.
- An alias for the old `start` verb — At this version with a plugin marketplace as the only distribution, an alias is a second name to document and keep in step forever.
- Re-deriving the already-committed enumeration work in 24d7ed0 — 161 reviewed and tested lines whose behaviour tests/fleet.test.js already pins.
- Changing waybill's own leg order so refine/contract precede specs — This docket ran openspec specs before the ideation contract and it worked, which is evidence about the route itself — but it is a change to the product, not to this change.

### Future Considerations

- Fix the pre-existing repoRoot invisible-error bug, once the stderr-capture question this change answers says whether it is real.
- Correct the stale /waybill:start comment at src/inference.js:113, in the next change that legitimately opens that module.
- Revisit waybill own leg order: this docket ran the openspec specs leg before the ideation refine and contract legs, and the result was sound, which is evidence the fixed order may be wrong.
- Cross-docket reasoning over the fleet — staleness ordering, or warning that two dockets touch the same files.

## Decisions Considered and Rejected

- **This contract cites the openspec specs and the approved design rather than restating them** — rejected: A self-contained contract repeating the problem, the six decisions, and the scope. openspec design.md explicitly warns that a second copy would drift. The contract adds the execution plan and runnable checks, which neither existing document carries.
- **The rename moves to the front of the sequence, ahead of rendering and dispatch** — rejected: Leaving the rename last, where tasks.md originally had it at §4. tests/golden/bay.txt:7 contains the literal /waybill:start, so the rendering section verified against a golden the rename section then rewrote. Renaming first makes it one mechanical diff against a green suite and lets every later phase be written against final verb names.
- **The inference-layer boundary is a hard mechanical criterion using `git diff --quiet`** — rejected: First `git diff --name-only ... expect: empty output`, then a judgment call. The success-criteria critic proved --name-only exits 0 whether or not it prints filenames, and verify.mjs scores on exit code alone (verify.mjs:407) — so the first form passed unconditionally, with src/inference.js rewritten, the exact failure the judgment form was rejected for. --quiet exits 1 on any difference.
- **Acceptance checks are behavioural probes against scratch repositories, not `node --test <file>` alone** — rejected: Naming the relevant suite file and trusting its cases to be written. Every suite file is green today, so `node --test tests/cli.test.js` cannot distinguish 'the sweep was written and passes' from 'the sweep was never written'. Each probe was executed during the interview and confirmed to fail against today's tree.
- **The empty-fleet golden is named fleet-empty.txt** — rejected: no-dockets.txt, as tasks.md originally named it. One character from the existing tests/golden/no-docket.txt, which is the leg-1 waybill and means something entirely different. Two goldens a plural apart is a trap for every future reader.
- **src/inference.js:113's stale `/waybill:start` comment is left uncorrected, by design** — rejected: Fixing the comment as part of the rename. The zero-diff criterion on that file is the check on the whole approach. A comment fix would fail acceptance, and an implementer who 'fixes' it has done exactly what the boundary exists to catch. Recorded so the red check reads as intended, not as a defect.
- **Phase 1 updates tests/inference.test.js, and this does not violate the boundary** — rejected: Leaving the rename to break that suite and letting the phase stop on it. bookings/waybill-bay.md:3 is `command: /waybill:start`, pinned by tests/inference.test.js:146. The criterion guards src/inference.js, not its suite — stated explicitly so a blocking phase does not halt on a one-line fixture edit.
- **Phases run sequentially rather than parallelising `new` against the fleet work** — rejected: A parallel wave, since the `new` section does not depend on the rendering section's renderers. Every phase edits src/cli.js. Parallelism buys nothing in a repo this size and only risks conflicts on the one file they all share.
- **`next --json` keeps its per-docket `dockets` array in the non-zero cases** — rejected: Emitting `{ error }` only, as the over-engineering critic proposed, since no consumer exists today. The array is load-bearing for a stated scope decision: src/cli.js:97 and README:124-125 keep `status` option-free precisely because `next --json` already carries the fleet shape. Strip it and a script has no machine-readable way to enumerate the fleet, which forces the out-of-scope `status --json` back in.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
The rename: start becomes bay
  └── Rendering: fleet, selection, and the shared cd block  (blocked by The rename: start becomes bay)
        └── The exit contract and trunk dispatch  (blocked by Rendering: fleet, selection, and the shared cd block)
              └── new: the trunk-side entry point  (blocked by The exit contract and trunk dispatch)
                    └── The session-facing branch  (blocked by new: the trunk-side entry point)
                          └── Verification and the stderr finding  (blocked by The session-facing branch)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/new-bay-and-fleet/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the new, bay, and the fleet view contract (new-bay-and-fleet) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/new-bay-and-fleet/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/new-bay-and-fleet/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=6/6 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — The rename: start becomes bay _(blocking)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

2. **Phase 2** — Rendering: fleet, selection, and the shared cd block _(blocked by The rename: start becomes bay)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

3. **Phase 3** — The exit contract and trunk dispatch _(blocked by Rendering: fleet, selection, and the shared cd block)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

4. **Phase 4** — new: the trunk-side entry point _(blocked by The exit contract and trunk dispatch)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

5. **Phase 5** — The session-facing branch _(blocked by new: the trunk-side entry point)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

6. **Phase 6** — Verification and the stderr finding _(blocked by The session-facing branch)_

   ```bash
   /ideation:execute-spec openspec/changes/new-bay-and-fleet/tasks.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
