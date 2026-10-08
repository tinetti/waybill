# Next-Leg Brief Contract

**Created**: 2026-09-21
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Express — single consolidated confirmation, no per-artifact review
**Supersedes**: None

## Problem Statement

`/waybill:next` hands each leg's session a bare command. For refine, the paste list is `/clear`, `/model opus`, `/effort high`, `/waybill:next <branch>/refine`, and the resulting `RUN:` line is `/ideation:ideation` with no argument — the refine booking has no `argument` key, and the only arguments Waybill can ever pass are one closed-enum fact (`change-id`, `branch`, or none).

The ideate leg deliberately writes nothing to disk, and ideate → bay runs in one session, so the brainstorm conclusion (decision, assumptions, rejected alternatives, exclusions) exists only in that conversation. The `/clear` before refine discards it, and ideation's intake — which is built to carry a brainstorm conclusion as starting evidence — starts from zero. `/spec:propose` in the specs leg has the same shape: free-text input, nothing passed.

Waybill itself is deterministic Node with no model, so it can assemble facts it infers (branch, bay, slug dir, skipped legs, next leg) but cannot summarise a conversation. The summary has to be written by the session finishing the previous leg, before its `/clear`.

## Goals

1. G1: A pasted `/waybill:next <branch>/refine` emits `RUN: /ideation:ideation` whose argument carries `Brief: <bay>/.waybill/handoff/refine.html (read first)` plus a Waybill context block (branch, bay, ideation slug dir if any, skipped legs, the next leg after this session); with no brief present it carries the context block only and the output prints a no-brief warning line.
2. G2: The same holds for the specs leg and `/spec:propose`.
3. G3: `/waybill:brief` writes `<bay>/.waybill/handoff/<leg>.html` for the next leg that starts after a `/clear`, resolved at run time; the directory self-ignores via its own `.gitignore` (`*`), `git status` in the bay stays clean, and cleanup still removes the bay.
4. G4: The brief is triggered automatically after a run-mode `/waybill:next <branch>/<leg>` finishes its wrapped command, and offered via AskUserQuestion on an end-of-leg display (`/waybill:next` and `/waybill:bay` handovers) only when the next leg takes a brief, the bay exists, and no brief exists for it yet.

## Success Criteria

- [ ] G1/G2 goldens exist with the brief path in the RUN argument (and absent from the no-brief golden), and the whole suite passes — check: `test -f tests/golden/refine-brief.md && test -f tests/golden/refine-no-brief.md && test -f tests/golden/specs-brief.md && grep -q '.waybill/handoff/refine.html (read first)' tests/golden/refine-brief.md && grep -q '.waybill/handoff/specs.html (read first)' tests/golden/specs-brief.md && ! grep -q 'handoff/refine.html' tests/golden/refine-no-brief.md && npm test` → exits 0
- [ ] The execute leg's handover is unchanged: the existing next-run.md golden test still passes byte-for-byte — check: `git diff --quiet main -- tests/golden/next-run.md && node --test --test-name-pattern='keyed lines' tests/waybill.test.js` → exits 0
- [ ] `waybill brief <branch>` run from the trunk against a fixture bay creates .waybill/handoff/.gitignore containing `*`, prints BRIEF FOR / WRITE TO, and leaves the bay's `git status --porcelain` empty — check: `grep -q "describe('waybill brief'" tests/cli.test.js && node --test --test-name-pattern='waybill brief' tests/cli.test.js` → exits 0
- [ ] A bay holding a brief written by `waybill brief` is removed by a plain `git worktree remove` (no --force), as commands/cleanup.md runs it — check: `grep -q "it('removes a bay holding a brief'" tests/cli.test.js && node --test --test-name-pattern='removes a bay holding a brief' tests/cli.test.js` → exits 0
- [ ] commands/brief.md exists with Write in allowed-tools; next.md runs /waybill:brief after a wrapped command and keys the prompt on BRIEF:; bay.md keys the prompt on BRIEF: and can invoke the command — check: `test -f commands/brief.md && grep -qE '^allowed-tools:.*\bWrite\b' commands/brief.md && grep -q 'waybill:brief' commands/next.md && grep -q 'BRIEF:' commands/next.md && grep -q 'BRIEF:' commands/bay.md && grep -qE '^allowed-tools:.*\bSkill\b' commands/bay.md && node --test tests/commands.test.js` → exits 0
- [ ] User-facing docs and living specs describe /waybill:brief — check: `for f in README.md docs/guide/02-glossary.md docs/guide/03-reference.md openspec/specs/handover/spec.md openspec/specs/command-surface/spec.md; do grep -q 'waybill:brief' "$f" || exit 1; done` → exits 0
- [ ] In a real ideate → bay → /clear → refine run, ideation's intake reads the brief and carries the brainstorm conclusion forward — judgment call: The repo owner runs one real effort through ideate, bay and refine and confirms ideation prints `Carrying brainstorm conclusion…` from the brief

## Scope Boundaries

### In Scope

- `waybill brief [<branch>]` CLI subcommand: resolves the docket like `next` (fleet()/parseTarget, so it works from the trunk right after /waybill:bay), finds the next post-/clear leg, ensures `<bay>/.waybill/handoff/` with a `*` .gitignore, prints BRIEF FOR / WRITE TO and the booking's brief guidance; listed in USAGE, the COMMANDS map, and the help card within its 45-line budget — Keeps path, targeting and ignore logic in tested code; the model only authors content
- Booking `brief:` key: a one-line guidance string (the frontmatter parser accepts flat single-line scalars only), added to OPTIONAL and the Booking typedef, set on ideation-refine and openspec-specs, honoured in overlays — Tells the brief author what the receiving command needs; marks which legs take a brief
- RUN argument assembly for brief-taking legs: brief path line plus Waybill context block; no-brief warning line — The deterministic half of the layered design; G1/G2
- Display-mode keyed line: `next --markdown` and `bay --markdown` emit an exported `BRIEF:` keyed line when the next post-/clear leg has a `brief:` key, the bay exists, and no brief file exists yet — Command files key only on literals the renderer exports (ENTER_BAY/RUN/NEXT_LEG); only the CLI can resolve overlays to know whether a leg takes a brief
- New commands/brief.md (`/waybill:brief`) that runs `waybill brief` and writes the HTML with Write — The explicit command the user asked for
- commands/next.md: run `/waybill:brief` after a run-mode wrapped command; on the `BRIEF:` keyed line, AskUserQuestion before showing the waybill — G4 triggers
- commands/bay.md: the same `BRIEF:`-keyed AskUserQuestion; allowed-tools gains Skill and SlashCommand so a Yes can actually run /waybill:brief, with the pinned tool list in tests/commands.test.js updated — The ideate session reaches refine's waybill through bay, so this is where the brainstorm brief gets written
- Goldens and tests for all of the above; README, docs/guide reference/glossary/ride-along, and openspec living specs (handover, command-surface) updated — Learning (next-from-anywhere): behaviour prose outside src/ goes stale unless listed

### Out of Scope

- Storing briefs in the git common dir — Rejected: the owner wants the brief visible in the bay
- Committing briefs on the branch — Would land in every PR diff and in Waybill's diff-based inference
- Markdown briefs or a format setting — HTML only; add a setting when someone asks
- Briefs for execute, ideate, bay, cleanup — execute's tasks.md is already its brief and /spec:apply's argument is a change-id; ideate is first; bay and cleanup are through legs
- Generating a brief from disk at the start of a leg — Cannot recover an unwritten brainstorm; start-of-leg only assembles and passes
- HTML-to-text conversion for inline passing — Path passing makes it unnecessary
- Changes to the ideation plugin — Ideation already reads a brain dump argument and carries a conclusion from conversation
- Stale-brief detection — An explicit /waybill:brief overwrites; the prompt only appears when no brief exists
- Auto-opening the brief in a browser — The WRITE TO path is printed; opening is the user's choice

### Future Considerations

- None.

## Decisions Considered and Rejected

- **Layered context: Waybill-inferred facts always, plus a model-written brief when one exists** — rejected: Brief only, or facts only. Facts alone lose the brainstorm at /clear; a brief alone lets a model misstate facts Waybill already knows
- **Store the brief as an untracked file in the bay, self-ignored via .waybill/handoff/.gitignore** — rejected: Git common dir; committed on the branch. Owner wants it visible in the worktree; committing pollutes the PR diff and diff-based inference
- **Key the file by the reading leg (handoff/refine.html)** — rejected: Key by the writing leg. Exact lookup; no need to resolve the latest done leg across skips
- **A separate /waybill:brief command, run automatically after a run-mode leg and offered at end-of-leg display** — rejected: Display run authors the brief implicitly; each booking body asks for it. Owner wants an explicit, nameable step that next orchestrates
- **Start-of-leg run assembles and passes; it never generates a brief** — rejected: Generate a brief from disk when none exists. Disk cannot recover an unwritten brainstorm; more model work per leg for little gain
- **End-of-leg prompt is an AskUserQuestion** — rejected: A printed line; a /waybill:brief paste block. A printed line is skimmable; a paste block runs even when there is nothing to brief
- **Only refine and specs take a brief in this change** — rejected: refine only; every transfer leg. specs has the same gap; execute's /spec:apply argument handling is unverified for extra text
- **HTML only, passed by path with facts inline** — rejected: Inline stripped HTML; HTML plus Markdown twin; a format setting. Path passing needs no converter and keeps one source file; no demand for Markdown yet
- **The brief targets the next leg that starts after a /clear, resolved when /waybill:brief runs** — refine continues into contract in the same session, so the brief written afterwards must be for specs
- **Display runs emit a `BRIEF:` keyed line the command files key on** — rejected: Command files decide from prose conditions on their own. Critic (hidden-dependency): only the CLI can resolve overlays to know a leg takes a brief, and command files key only on exported literals
- **bay.md allowed-tools gains Skill and SlashCommand** — rejected: Keep bay.md's pinned minimal tool list. Critic (hidden-dependency): without them a Yes on bay's prompt silently does nothing, and bay is where the ideate brief is written
- **`waybill brief` takes an optional <branch> and resolves like `next`** — Critic (hidden-dependency): the ideate session is still on the trunk after /waybill:bay
- **`brief:` is a one-line guidance string** — rejected: Multi-line block scalar. Critic (hidden-dependency): src/frontmatter.js rejects block scalars
- **Success checks guard on test/golden existence before running** — rejected: Bare `node --test --test-name-pattern` and `npm test` checks. Critic (success-criteria): a name filter matching nothing exits 0, so the originals passed before any work

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
CLI: brief subcommand, booking key, RUN assembly
  └── Commands and docs: /waybill:brief, next/bay triggers, prose surfaces  (blocked by CLI: brief subcommand, booking key, RUN assembly)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/next-leg-brief/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Next-Leg Brief contract (next-leg-brief) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/next-leg-brief/contract.md`. All commits belong on branch feat/next-leg-brief — switch to it before any run.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/next-leg-brief/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=2/2 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — CLI: brief subcommand, booking key, RUN assembly _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/next-leg-brief/spec-phase-1.md
   ```

2. **Phase 2** — Commands and docs: /waybill:brief, next/bay triggers, prose surfaces _(blocked by CLI: brief subcommand, booking key, RUN assembly)_

   ```bash
   /ideation:execute-spec docs/ideation/next-leg-brief/spec-phase-2.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
