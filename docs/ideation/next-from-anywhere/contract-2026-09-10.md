# Next From Anywhere Contract

**Created**: 2026-09-10
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

Waybill's transfer handover (the refine, specs, and execute legs) starts with `/clear`. In practice `/clear` drops the Claude Code session back to the main checkout, so the leg command pasted after it — `/spec:apply add-thing` — runs against the trunk, not the bay whose docket it belongs to. The user has to notice this, cd or restart in the bay, and re-orient before every leg.

The CLI can already resolve a docket from anywhere (`waybill next <branch>` looks the bay up in the fleet), but the `/waybill:next` slash command ignores its arguments, and nothing in the plugin can move a session into a bay. The trunk and `/waybill:bay` handovers still end in a `cd` fence that a Claude Code session can't act on.

## Goals

1. A transfer handover rendered for a session (markdown) for a docket with a bay ends in `/waybill:next <branch>/<leg>`, preceded by `/clear`, `/model <m>`, `/effort <e>`, whether it was printed inside the bay, from the trunk, or by `/waybill:bay` after cutting — and the session markdown shows no `cd` fence.
2. `/waybill:next <branch>/<leg>`, run from any checkout of the repo, enters that branch's bay with EnterWorktree and invokes the booking's command (with its argument) there, in one command.
3. `/waybill:next <branch>` (no leg) enters the bay and shows its waybill, running nothing.
4. A stale leg token (the named leg is not the docket's next leg) runs nothing: it shows the current waybill with a one-line note naming the actual next leg.
5. If the bay can't be entered (the EnterWorktree tool is denied, or the bay sits outside `.claude/worktrees` while the session is already in another worktree), the command runs nothing and falls back to today's waybill with its `cd` line.

## Success Criteria

- [ ] The whole suite passes, including the new and re-minted goldens and parse, stale-leg, and bang-line tests — check: `npm test` → exits 0
- [ ] The in-bay specs handover ends in the portable line — check: `grep -Fxq "/waybill:next feat/thing/specs" tests/golden/specs.md && ! grep -q "^ENTER BAY: " tests/golden/specs.md` → exits 0 (fails on today's tree, which shows /spec:propose); an in-bay render carries no ENTER BAY
- [ ] The trunk-resolved session handover drops the `cd` fence and names the portable line — check: `grep -Fx -e "/clear" -e "/model placeholder-model" -e "/effort high" -e "/waybill:next feat/session-handover/specs" tests/golden/trunk-one-docket.md | paste -sd"|" - | grep -Fxq "/clear|/model placeholder-model|/effort high|/waybill:next feat/session-handover/specs" && ! grep -Fxq "/spec:propose add-session-handover" tests/golden/trunk-one-docket.md && ! grep -q "^cd " tests/golden/trunk-one-docket.md` → exits 0: /clear, /model, /effort, then the portable line, in that order, with no raw leg command and no cd fence
- [ ] Plain CLI output for shell users keeps the `cd` line and the raw leg command — check: `grep -Fxq '  cd /repo/.claude/worktrees/waybill-feat-session-handover' tests/golden/trunk-one-docket.txt && grep -Fxq '/spec:propose add-session-handover' tests/golden/trunk-one-docket.txt` → exits 0 (a regression guard: it passes today and must keep passing)
- [ ] /waybill:bay's markdown handoff after cutting a bay names the portable line for the refine leg — check: `grep -Fxq "/waybill:next feat/thing/refine" tests/golden/bay-cut.md && ! grep -q "^cd " tests/golden/bay-cut.md` → exits 0 (the golden does not exist today)
- [ ] A matching leg token renders the keyed headings the Task acts on — check: `grep -Eq "^ENTER BAY: /" tests/golden/next-run.md && grep -Fq "RUN: /spec:apply add-thing" tests/golden/next-run.md` → exits 0: ENTER BAY carries an absolute path the cd fallback can reuse
- [ ] `<branch>` with no leg renders ENTER BAY and no RUN — check: `grep -q "^ENTER BAY: " tests/golden/next-branch-only.md && ! grep -q "RUN:" tests/golden/next-branch-only.md` → exits 0
- [ ] A no-argument trunk render stays show-only (it never moves the session) — check: `! grep -q "ENTER BAY" tests/golden/trunk-one-docket.md && ! grep -q "RUN:" tests/golden/trunk-one-docket.md` → exits 0 (a regression guard)
- [ ] A stale leg token names the actual next leg under a keyed marker and renders no RUN heading — check: `grep -Fxq "NEXT LEG: specs" tests/golden/next-stale-leg.md && ! grep -q "RUN:" tests/golden/next-stale-leg.md` → exits 0
- [ ] /waybill:next is allowed to switch worktrees and invoke the leg's command, and passes its argument through — check: `grep -Eq '^allowed-tools:.*EnterWorktree' commands/next.md && grep -Eq '^allowed-tools:.*Skill' commands/next.md && grep -Eq '^!.*cli[.]js" next --markdown.*[$]ARGUMENTS' commands/next.md` → exits 0: the argument reaches the CLI on the bang line itself, not only in prose
- [ ] The living command-surface spec records the second keyed exception — check: `grep -q 'ENTER BAY' openspec/specs/command-surface/spec.md && grep -q 'RUN:' openspec/specs/command-surface/spec.md` → exits 0
- [ ] Every new golden is read by a test, and the command file argument routing is tested — check: `for g in bay-cut next-run next-branch-only next-stale-leg; do grep -qF "$g" tests/*.test.js || exit 1; done; grep -q "runBang(.next.md., .feat/" tests/commands.test.js` → exits 0
- [ ] End to end in a live session (precondition: the /spec:* symlinks from the README are installed): from a bay at the execute leg, run /waybill:next, then /clear and the printed lines; the session lands in the bay and /spec:apply does its work there — judgment call: The operator runs it once interactively and confirms that EnterWorktree reports the bay path, and that spec:apply completes at least one Edit/Write and one non-openspec Bash call inside the bay (the nested command keeps its tools under next.md allowed-tools)
- [ ] Fallback in a live session: with EnterWorktree denied, `/waybill:next <branch>/execute` from the trunk runs no leg and shows the cd fallback — judgment call: The operator denies the EnterWorktree permission prompt once and confirms that no Skill call follows and that `cd <bay path>` is shown
- [ ] The frontmatter spike result is recorded — judgment call: The operator runs the probe once interactively (the /model indicator or status line shows the model during the probe) and writes the observed yes/no into spec.md Open Items; a yes opens a follow-up for the 2-line handover, and a no closes it

## Scope Boundaries

### In Scope

- Parse `<branch>[/<leg>]` in `waybill next`: try the whole string as a bay branch first, else split off a trailing known leg id — The handover line is useless unless the CLI can resolve it, and git makes the split unambiguous
- Session (markdown) transfer handovers for a docket with a bay end in `/waybill:next <branch>/<leg>`, keep /clear, /model, /effort, and drop the `cd` fence — in-bay, trunk-resolved, and /waybill:bay's post-cut handoff; commands/bay.md Task prose that describes the removed cd (the do-not-run-it rule, the cd-left-for-me line) is rewritten to match — The user picked every surface; all three strand the user in the same way
- When `/waybill:next` was given a `<branch>[/<leg>]` argument and the caller is not in that bay, the CLI emits `ENTER BAY: <path>`; it emits `RUN: <command> <arg>` only when the leg token matches the docket next leg; a stale token prints a note naming the actual next leg. No-argument renders (a plain trunk `/waybill:next`, the SELECT A DOCKET re-run) stay show-only — The CLI keeps deciding staleness, and the Task keys on renderer headings the way it already does for `SELECT A DOCKET:`
- commands/next.md (pattern to follow: commands/new.md, which already runs a booking command): argument-hint, pass `$ARGUMENTS` through the bang line, add EnterWorktree, Skill, and SlashCommand to allowed-tools, and Task rules. ENTER BAY: switch only when I passed an argument; on failure show `cd <that path>` and the leg command, then stop. RUN: invoke the command via Skill/SlashCommand; if it cannot be resolved (e.g. the bare /spec:* symlinks are missing), say so in one line and do not substitute. A SELECT A DOCKET re-run never switches — The slash command is the only place a session can be moved and a leg run
- Update openspec/specs/command-surface/spec.md: the `next` leg-token argument, the second keyed exception (ENTER BAY / RUN, with the exact cd fallback text), and the SELECT A DOCKET re-run staying show-only — The living spec currently forbids next from doing anything but show-and-stop
- Tests: re-mint specs.md and trunk-one-docket.md; add bay-cut.md (minted from a pure render with a fixed bay path, like the BAY constant in tests/waybill.test.js), next-run.md, next-branch-only.md, and next-stale-leg.md; parse cases; a runBang argument test; and rewrite the tests asserting the markdown cd fence (cdFence in tests/cli.test.js, the bay-before-NEXT cases in tests/waybill.test.js) — Each goal needs a check that fails before the change
- Interactive frontmatter spike: in a live session, invoke a probe command with `model: haiku` / `effort: low` frontmatter through the Skill tool from a command that has none, and record in the spec whether the model/effort switch took effect — The user chose it; headless `claude -p` ignored frontmatter even on a direct call, so only an interactive run can say whether the 2-line handover in Future is viable. It changes no shipped output

### Out of Scope

- Automating /clear — It's a built-in that no command or skill can invoke; the user types it
- Relying on a leg command's `model:`/`effort:` frontmatter instead of printing /model and /effort — commands/spec/apply.md is `model: inherit`, so after the bay leg the execute leg would run on haiku, and a headless spike couldn't observe frontmatter routing at all
- Through legs (contract, bay, cleanup) — They never /clear, so the session never leaves the checkout it's in
- The ideate leg — It runs before any bay exists
- Plain CLI (non-markdown) output — Shell users can cd, so plain output keeps today's `cd` + raw command
- /waybill:status fleet view — It lists dockets and doesn't issue a handover
- The /waybill:help walkthrough on the unmerged ideation/waybill-help branch — That branch owns its content; it should adopt the new syntax when it lands

### Future Considerations

- A 2-line handover (/clear + /waybill:next) if command frontmatter model routing is ever verified to survive a Skill invocation in interactive sessions — The headless spike could not observe it, and spec:apply is model: inherit

## Decisions Considered and Rejected

- **The token after the branch is the leg id (`feat/foo/execute`)** — rejected: A command-derived slug (`feat/foo/spec-apply`), or no token (always run the next leg). Leg ids are a closed set (so the split is reliable) and stay stable when a bay overrides the booking's command; no token would lose the show-vs-run split
- **Keep /model and /effort lines in the handover before `/waybill:next <branch>/<leg>`** — rejected: A 2-line handover relying on the leg command's frontmatter to set the model. A spike showed `claude -p` ignores `model:` frontmatter even on a direct call, so nothing was verifiable; and spec:apply is `model: inherit`, so frontmatter can't carry the execute booking's opus
- **A stale leg token refuses: switch in, show the current waybill with a note, run nothing** — rejected: Run the named leg anyway, or ask. A stale paste must never re-run finished work, and the fresh handover is right there
- **Use the new line on every transfer handover with a bay (in-bay, trunk, /waybill:bay) in session output; plain output keeps `cd`** — rejected: Only /waybill:next inside a bay. All three strand the session the same way, and one handover style is simpler
- **`/waybill:next <branch>` with no leg switches into the bay and shows the waybill** — rejected: Show only, with a cd. Gives a clean show-vs-run split at almost no cost, because the CLI already resolves the branch
- **If the bay can't be entered, show the waybill with its `cd` and stop** — rejected: Run the leg in the current checkout. Running spec:apply in the wrong tree is the one outcome that must not happen
- **Record this as an ideation contract plus spec, editing the living command-surface spec directly** — rejected: An additional OpenSpec change folder. It would duplicate the spec, and learnings.md records that phases sharing one tasks.md break autopilot's skip pre-pass
- **Build after ideation/bang-line-exit-guard lands** — rejected: Build now and rebase bang-line. Both rewrite next.md's `!` line, and bang-line's non-zero-exit guard is what keeps the new error paths' Task visible
- **The session switch uses EnterWorktree({path}); the CLI only emits the path** — rejected: Printing a `cd` for the user. Headless spikes confirmed that EnterWorktree({path}) moves the session from the main checkout and from one .claude/worktrees bay to another, and that a command invoked through Skill afterwards runs there and can Write, even with neither allowed-tools list naming Write
- **ENTER BAY is keyed on an explicit argument, not only on the caller's location** — rejected: Emitting ENTER BAY whenever the caller is outside the resolved bay. The scope-creep critic showed the pre-fix trigger would move the session on a plain trunk /waybill:next and on the SELECT A DOCKET re-run, which no goal asked for
- **The bang-line gate is a wait on another docket's merge** — rejected: This contract merging bang-line and resolving its conflict. Scope-creep critic: that merge belongs to the bang-line-exit-guard docket's acceptance
- **The stale-leg note is a keyed renderer marker `NEXT LEG: <leg>`** — rejected: A free-prose note (`... is not the next leg`). Success-criteria critic: a prose needle breaks on rewording and did not prove the note names the actual next leg
- **The cd fallback reuses the ENTER BAY path already printed, with its exact text fixed by the living spec; no second waybill variant is rendered** — rejected: Rendering a cd-bearing copy of the waybill in every ENTER BAY response. Over-engineering critic: goal 5 needs only the path, which the Task already has

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Wait for bang-line-exit-guard on main
  └── Portable handover and switch-and-run  (blocked by Wait for bang-line-exit-guard on main)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/next-from-anywhere/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Next From Anywhere contract (next-from-anywhere) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/next-from-anywhere/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/next-from-anywhere/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Wait for bang-line-exit-guard on main _(blocking)_

   ```bash
   # Review: Wait for bang-line-exit-guard on main
   ```

2. **Phase 2** — Portable handover and switch-and-run _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-from-anywhere/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
