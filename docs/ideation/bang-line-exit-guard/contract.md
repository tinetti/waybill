# Bang-line exit guard Contract

**Created**: 2026-09-10
**Readiness**: 1 gate open: Problem Clarity — interview ended early
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

Every Waybill slash command that shells out to the CLI does so through a `!` line whose `if … fi` compound exits with node's status. When that status is non-zero, Claude Code reports `Shell command failed for pattern …` and never renders the command file — the `## Task` section, and every instruction in it, is lost (observed 2026-09-09, Claude Code 2.1.267, openspec/changes/archive/2026-09-10-new-bay-and-fleet/tasks.md §7.2).

The worst hit is `/waybill:next` on the trunk: both of its trunk outcomes exit 2 by contract — "no dockets open" (src/cli.js:208) and the `SELECT A DOCKET:` menu (src/cli.js:215-216) — so the Task branch written for that menu (commands/next.md:45) can never run in a session. `/waybill:bay` loses its Task on every error (empty argument, invalid ref, bay exists, …), and all four commands lose it outside a git repository or on a malformed booking. The operator gets a harness error instead of the menu or explanation the Task was written to deliver; 0.4.0 shipped with this, recorded as out of scope in openspec/changes/archive/2026-09-10-new-bay-and-fleet/design.md:75-81.

## Goals

1. Each of the four cli.js `!` lines (next, bay, new, status) exits 0 for every CLI outcome, carrying the CLI's stdout and stderr in its output plus a trailing `waybill: exited N` only when the CLI exited non-zero.
2. Each of those four `## Task` sections states what a trailing `waybill: exited N` means — no waybill was issued: show the block verbatim and do not run or improvise a leg — with next's existing `SELECT A DOCKET:` branch taking precedence.
3. The CLI exit contract (`next` exits 0 if and only if it issued exactly one waybill) is unchanged: no code change under src/ (comments only) and no diff to tests/cli.test.js.
4. In a live session, `/waybill:next` on a trunk with two dockets loads its Task and offers the docket choice instead of a shell-failure error.

## Success Criteria

- [ ] `next` on a trunk with no dockets: the real `!` snippet exits 0 and shows the CLI message plus `waybill: exited 2` (today it exits 2) — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$(repo); s=$(snip next); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && echo "$out" | grep -q "no dockets open" && echo "$out" | grep -q "waybill: exited 2"` → exits 0
- [ ] `next` on a trunk with two dockets: the real `!` snippet exits 0 and shows `SELECT A DOCKET:` plus `waybill: exited 2` (today it exits 2) — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$(repo); git -C "$d" worktree add -q -b feat/a "$D/a"; git -C "$d" worktree add -q -b feat/b "$D/b"; s=$(snip next); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && echo "$out" | grep -q "SELECT A DOCKET:" && echo "$out" | grep -q "waybill: exited 2"` → exits 0
- [ ] `bay` with no argument: the real `!` snippet exits 0 and its output carries the CLI's stderr usage text plus `waybill: exited 2` (today it exits 2 with the text on stderr) — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$(repo); s=$(snip bay); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && echo "$out" | grep -qi "usage" && echo "$out" | grep -q "waybill: exited 2"` → exits 0
- [ ] `status` outside a git repository: the real `!` snippet exits 0 and shows the not-a-repository error plus `waybill: exited 2` — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$D; s=$(snip status); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && echo "$out" | grep -q "not inside a git repository" && echo "$out" | grep -q "waybill: exited 2"` → exits 0
- [ ] `new` outside a git repository: the real `!` snippet exits 0 and shows the not-a-repository error plus `waybill: exited 2` — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$D; s=$(snip new); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && echo "$out" | grep -q "not inside a git repository" && echo "$out" | grep -q "waybill: exited 2"` → exits 0
- [ ] Success path: `status` on a trunk with no dockets exits 0, prints the fleet view, and carries NO `waybill: exited` marker (guards against an unconditional `; echo`) — check: `R=$PWD; D=$(mktemp -d); trap 'rm -rf "$D"' EXIT; snip() { grep -m1 "^!\`" "$R/commands/$1.md" | sed -e "s/^!\`//" -e "s/\`\$//" -e "s|\${CLAUDE_PLUGIN_ROOT}|$R|g" -e "s/\$ARGUMENTS//g"; }; repo() { d=$D/r; git init -q -b main "$d"; git -C "$d" -c user.email=a@b -c user.name=a commit -q --allow-empty -m init; echo "$d"; }; d=$(repo); s=$(snip status); out=$(cd "$d" && bash -c "$s"); test $? -eq 0 && test -n "$out" && ! echo "$out" | grep -q "waybill: exited"` → exits 0
- [ ] Each of next, bay, new and status carries the wrapper on its `!` line and a `waybill: exited` rule inside its `## Task` section — check: `( for f in next bay new status; do grep -q '^!`.*waybill: exited' commands/$f.md && awk '/^## Task/{t=1} t&&/waybill: exited/{f=1} END{exit !f}' commands/$f.md || exit 1; done )` → exits 0
- [ ] A new, non-empty suite executes each command's real `!` snippet in fixture repositories, and `npm test` runs it — check: `grep -q "^import './bang-lines.test.js';" tests/index.js && node --test --test-reporter=tap tests/bang-lines.test.js | grep -qE '^# pass [1-9]'` → exits 0
- [ ] README documents that the `!` lines fold stderr in and absorb the exit code — check: `grep -q "waybill: exited" README.md` → exits 0
- [ ] The full suite passes (baseline on this bay: 376 pass, 0 fail) — check: `npm test` → exits 0
- [ ] GUARD — the CLI exit contract is untouched: tests/cli.test.js has no diff and src/ changes only comment lines, measured from the fork point (passes today by design, and must still pass) — check: `b=$(git merge-base main HEAD); git diff --quiet "$b" -- tests/cli.test.js && test -z "$(git diff -U0 "$b" -- src/ | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-][[:space:]]*(\*|//|/\*)')" && test -z "$(git status --porcelain --untracked-files=all -- src/ | grep '^??')"` → exits 0
- [ ] Live session: the Task loads for the two cases that lose it today — judgment call: The operator starts `claude --plugin-dir <this bay>` (with the installed waybill@tinetti disabled so the bay's commands are the ones resolved) on a trunk with two dockets, runs `/waybill:next` (Task loads; the model offers the SELECT A DOCKET choice) and `/waybill:bay` with no argument (Task loads; the model relays the usage error and stops) — neither shows `Shell command failed for pattern`.

## Scope Boundaries

### In Scope

- Append `2>&1 || echo "waybill: exited $?"` to the node call in the `!` line of commands/next.md, bay.md, new.md and status.md — The single edit that stops every non-zero CLI outcome from discarding the command file, and folds stderr in so bay's errors reach the session whatever the unmeasured exit-0 stderr behaviour is.
- One rule in each of those four `## Task` sections for a trailing `waybill: exited N` — Once the Task loads for an error it needs an instruction for it; next's SELECT A DOCKET branch keeps precedence.
- tests/bang-lines.test.js — extracts each real `!` line, substitutes the plugin root, runs it in fixture repos built with tests/helpers/repo-fixture.js, asserts exit 0 and the expected output on failure and success paths; imported from tests/index.js — The failing-first test; nothing today executes a `!` line (closest patterns: tests/commands.test.js:152-181 extraction, :366-375 spawnSync).
- Reword the "captures stdout only" rationale where it appears — README.md:143-144, openspec/specs/command-surface/spec.md:49-50 (the because-clause only; the SHALL stands), and the comments at src/cli.js:115-118 and :283 — After `2>&1` the `!` line carries stderr too, so the stated reason would be false; stdout stays the right stream because terminal and `--json` callers read it. Comment-only in src/, which the guard permits.

### Out of Scope

- Changing CLI exit codes or the exit-contract requirement — Rejected in favour of the wrapper; terminal and script callers keep the contract.
- commands/cleanup.md — Plain git, no cli.js, and already ends in `|| echo` — it cannot exit non-zero.
- Prettifying the malformed-booking stack trace (uncaught throw, exit 1) — The wrapper already surfaces it to the session; a friendlier message is a separate CLI change.
- The 0.4.1 release — Shipped by the repo's separate `chore: release` PR.
- Measuring whether the `!` substitution shows stderr on exit 0 — Made moot by `2>&1`.

### Future Considerations

- None.

## Decisions Considered and Rejected

- **Absorb the exit code in the command-file `!` line** — rejected: Make `next` exit 0 on its trunk cases. Reopens the spec'd contract (openspec/specs/command-surface/spec.md, README.md:132) that callers test against, and leaves bay's errors and not-a-repository still dropping the Task.
- **Absorb the exit code in the command-file `!` line** — rejected: A CLI `--session` flag that clamps exit to 0 and routes stderr to stdout. New CLI surface, parsing and per-subcommand tests for what one shell operator already does.
- **`2>&1 || echo "waybill: exited $?"`** — rejected: `|| true`. `true` is not on the commands' restrictive allowed-tools list while `echo` is, and echo also tells the session which code the CLI exited with.
- **Wrap all four cli.js `!` lines and add a Task rule to each** — rejected: Fix next only. bay loses its Task on every error and all four lose it outside a repository; the same one-line fix covers them.
- **Acceptance needs both the scripted snippet test and a live-session check** — rejected: Scripted test only. The script proves exit 0; only a live session proves Claude Code then renders the Task.
- **Add a success-path check that the marker is absent on exit 0** — rejected: Only failure-path snippet checks. Success-criteria critic: an unconditional `; echo "waybill: exited $?"` passed every failure check while printing `exited 0` after every real waybill, which the new Task rule would read as no waybill.
- **Gate completion on `npm test` plus a non-empty bang-lines suite** — rejected: A TAP ok-line count above the 441 baseline. Success-criteria critic: a dated count passes on any one added ok line and proves nothing the suite run does not.
- **Reword the stdout-only rationale in README, living spec and src comments; guard allows comment-only src diffs** — rejected: Leave the spec and src comments asserting it knowingly. Hidden-dependency critic: new-bay-and-fleet is archived and the rationale now lives in openspec/specs/command-surface/spec.md:49-50; a false stated reason is worse than a comment-only diff.

## Open Questions

- `repro-next-trunk-040` **From a trunk with two or more dockets, does `/waybill:next` under the installed 0.4.0 plugin fail with `Shell command failed for pattern` (Task never loads), or does the stdout-only exit-2 output render with its Task?** — task, blocks Problem Clarity

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Guard the four cli.js bang lines
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/bang-line-exit-guard/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Bang-line exit guard contract (bang-line-exit-guard) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/bang-line-exit-guard/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/bang-line-exit-guard/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Guard the four cli.js bang lines _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/bang-line-exit-guard/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
