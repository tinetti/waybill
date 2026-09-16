# Handover Runs Line Contract

**Created**: 2026-09-15
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: contract-2026-09-15.html

## Problem Statement

A transfer leg on a docket with a bay renders its last handover command as `/waybill:next <branch>/<leg>` instead of the leg's own command. The wrapper is what moves the next session into the bay, so it has to stay — but it also hides what the leg actually is. The operator pastes a command whose effect they cannot read.

Waybill's whole argument is that a leg's booking should be visible: the model, the effort and the instructions are all printed. The command is the one part that is not. Today it surfaces only as the `RUN:` line `/waybill:next` prints once it is already running (commands/next.md:87), which is too late to be a decision.

The terminal rendering does not have this problem — `renderWaybill` calls `handoverCommands` with no bay (src/waybill.js:202) and prints the raw command next to a `cd` line. Only the markdown handover, the one a session reads, drops it.

## Goals

1. Every markdown handover whose last fence is `/waybill:next <branch>/<leg>` prints, directly under that fence, the leg command and argument it will run.
2. No handover without that wrapper gains a line: through legs and dockets with no bay render exactly as they do today, asserted by a grep over their goldens rather than by inspection.
3. The annotation is never mistaken for a step: it is prose rather than a fence, it begins with `→ runs`, and it uses none of the keyed prefixes `RUN:`, `ENTER BAY:` or `NEXT LEG:` that commands/next.md acts on.

## Success Criteria

- [ ] The wrapper goldens carry the annotation as its own unindented line, beginning `→ runs` and naming the leg command. — check: `grep -q '^→ runs `/spec:apply' tests/golden/execute.md` → exits 0
- [ ] Goldens whose handover has no wrapper — a through leg, or a docket with no bay — gain no annotation line. — check: `sh -c '! grep -q "^→ runs" tests/golden/ideate.md tests/golden/cleanup.md tests/golden/contract.md'` → exits 0
- [ ] The annotation never uses a keyed prefix: no line of a non-routed markdown handover begins with `RUN:`, `ENTER BAY:` or `NEXT LEG:`, which stay exclusive to the keyed lines `keyedLines` emits above the position fence. — check: `sh -c '! grep -nE "^(RUN|ENTER BAY|NEXT LEG): " tests/golden/execute.md tests/golden/specs.md tests/golden/refine.md tests/golden/bay-cut.md'` → exits 0
- [ ] The whole suite passes, including byte-exactness on all eight regenerated wrapper goldens and the six that must not change. — check: `node --test tests/` → exits 0
- [ ] The `handover` spec records the annotation, and no longer says the booking body follows the last command fence directly. — check: `sh -c 'grep -q "→ runs" openspec/specs/handover/spec.md && ! grep -q "Booking body\*\*: unindented prose after the last command fence" openspec/specs/handover/spec.md'` → exits 0
- [ ] The `--markdown` paragraph in README.md describes the annotation, so the one prose surface that spells out the markdown shape does not contradict what the tool prints. — judgment call: the reviewer reads the `--markdown` paragraph in README.md against a freshly rendered handover

## Scope Boundaries

### In Scope

- Return a `wrapped` flag from `handoverCommands` (src/waybill.js:155-180) and emit the annotation in `nextMarkdown` when it is set. — The wrapper condition `transfer && bay` lives only at :166/:176; re-deriving it in the renderer gives two predicates that can drift.
- Regenerate the eight markdown goldens carrying a wrapper fence: trunk-one-docket, next-branch-only, next-run, next-stale-leg, specs, refine, execute, bay-cut. — They are byte-exact comparisons; the change fails until they match. Seven are blessed through tests/waybill.test.js, bay-cut through tests/cli.test.js.
- Fold an `includes('→ runs') === false` assertion into the two existing negative tests (tests/waybill.test.js:419-421 and :424-426), and assert the annotation's shape in the wrapper case. — Goldens get blind-regenerated; a semantic assertion resists that. Separate negative test cases would be a fourth copy of a fact already pinned three ways.
- Amend openspec/specs/handover/spec.md directly: the Markdown document shape (:117-134) and the transfer-handover scenario (:140-143). — The delta route needs the opsx:propose skill, which is not installed on this machine. The living spec is edited in place instead, because leaving :128 saying the booking body follows the last command fence would make the repo's own record false.
- Update the `--markdown` paragraph in README.md. — It is the one prose surface that spells out the markdown shape, so it goes stale the moment the annotation ships.

### Out of Scope

- The plain-text rendering (`renderWaybill`) and the `waybill status` and fleet surfaces. — Plain text already prints the raw command next to a `cd` line; there is nothing to reveal.
- Any change to the `/clear`, `/model` or `/effort` fences. — They apply whether or not you are already in the bay; a transfer still needs a fresh session at the booked model.
- Detecting whether the operator is already in the bay, and varying the output on it. — The renderer is pure and the handover is read in a different session from the one that printed it, so the cwd at render time proves nothing.
- Changing which command the wrapper runs, or letting the operator skip it. — The wrapper is what moves a session into the bay; this change makes it legible, not optional.
- The four surfaces saying the handover ends in `/waybill:next <branch>/<leg>`: bookings/waybill-bay.md:11, commands/bay.md:52, docs/guide/01-ride-along.md:88 and :99-100, and the `--markdown` cell at docs/guide/03-reference.md:45. — They describe the last *command*, which is unchanged — prose already followed it. Editing bookings/waybill-bay.md would also drag tests/golden/bay.md and bay.txt in, since its body renders verbatim.
- Updating archived OpenSpec changes under openspec/changes/archive/. — They are the historical record of what shipped; rewriting them would falsify it.

### Future Considerations

- None.

## Decisions Considered and Rejected

- **Annotate the wrapper with what it runs (`→ runs `/spec:apply add-thing``) as prose under the last fence.** — rejected: A fifth fence carrying the raw command.. The block header says `paste each block on its own, in order`. A fence is a block, so the leg would be pasted twice — once through the wrapper and once directly.
- **Word it as what the wrapper runs.** — rejected: Word it as an alternative to paste: `already in the bay? paste X instead`.. The operator chose visibility (seeing what will run) over skipping the wrapper. The `instead` wording carries the same double-run risk as a fence, and the raw command is still copyable from the inline code for anyone who wants it.
- **Put the annotation directly under the last fence, above the booking body.** — rejected: Fold it into the `**NEXT**` header line as a parenthetical.. The header sits four fences above the command it would describe; the annotation belongs next to the thing it annotates.
- **Keep the `RUN:` line as the only keyed way to name a command, and scope the guard to the NEXT section.** — rejected: Reuse the `RUN:` prefix for the annotation; assert globally that no handover line carries a keyed prefix.. commands/next.md:87 tells a session to invoke any line starting `RUN:`, so a pasted handover carrying one would run the leg unasked. The global assertion was also false by construction: `keyedLines` (src/waybill.js:354-359) emits those prefixes above the position fence, pinned in three goldens.
- **Accept that a routed render prints the command twice — once as its `RUN:` keyed line, once as the annotation (tests/golden/next-run.md, next-stale-leg.md).** — rejected: Suppress the annotation when keyed lines are present.. The two lines address different sessions: the keyed line tells this session what to invoke now, the NEXT block hands the next session its paste. Suppression would make the handover's content depend on how it was requested, which is exactly the coupling the pure renderer avoids.
- **Branch on a `wrapped` flag returned by `handoverCommands`.** — rejected: Re-derive `transfer && bay` inside `nextMarkdown`.. One predicate in one place. The wrapper condition already governs the last fence; a second copy in the renderer is what drifts when a future handover mode is added.
- **Execute through /ideation:execute-spec, and amend openspec/specs/handover/spec.md in place.** — rejected: The docket's booked specs and execute legs (/spec:propose, /spec:apply), which would have produced a change delta.. /spec:propose delegates to the opsx:propose skill, which is not installed here, and improvising the OpenSpec artifacts by hand would guess at a shape the skill owns. The trade is that this change lands with no entry under openspec/changes/, so the docket's specs leg never stamps and the living spec is edited without a delta.
- **Leave the terminal rendering untouched.** — rejected: Add the annotation to `renderWaybill` too, for symmetry.. Plain text already shows the raw command; a second copy would be noise, and the two renderers deliberately share no formatting (src/waybill.js:366-369).
- **Anchor the criteria on greps over generated golden text, keeping `node --test tests/` as the byte-exactness check.** — rejected: Point every criterion at `node --test tests/waybill.test.js`.. Critic finding: that suite passes on the untouched checkout, so four of six criteria were green before any work started and none could tell a written assertion from a missing one.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Annotate the wrapper fence
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs/ideation/handover-runs-line/contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Handover Runs Line contract (handover-runs-line) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs/ideation/handover-runs-line/contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs/ideation/handover-runs-line/contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=1/1 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Annotate the wrapper fence _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/handover-runs-line/spec.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
