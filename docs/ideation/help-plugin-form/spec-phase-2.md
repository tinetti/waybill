# Implementation Spec: Help in plugin form, and a bay you land in - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M

Phase title: **Bay entry**

## Technical Approach

`/waybill:next <branch>/<leg>` already moves a session into a bay: the CLI prints a keyed line,
`ENTER BAY: <path>`, and `commands/next.md` tells the model to call `EnterWorktree` with that path.
`/waybill:bay` does not, so after it cuts a bay the session is still in the main checkout. This phase
gives `bay --markdown` the same keyed line and teaches `commands/bay.md` to act on it.

The mechanism exists in full. `renderWaybillMarkdown(state, inspection, route)` in `src/waybill.js`
prints the line when `route.enter && route.bay`. `bay` in `src/cli.js` already computes
`alreadyThere` and already passes `{ bay: result.path }`. The source change is one extra property on
that object. The line lands after bay's own heading and before the waybill's text fence, because the
heading is written first and the renderer puts keyed lines at the top of what it returns.

Two cases print no line. Inside the bay there is nowhere to move, which `alreadyThere` covers. When
the docket's next leg is `cleanup` the bay is about to be removed; `next` guards this by token
(`src/cli.js:174-176`), but `bay` has no token, so it keys on the resolved leg, `state.leg`.

Nothing else about the waybill changes. It still ends in `/waybill:next <branch>/<leg>`, it carries
no `RUN:` line (no `token` is passed), and `/waybill:bay` still stops after showing it. Work
test-first: every assertion below is written and seen failing before `src/cli.js` is touched.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **bay --markdown prints the keyed `ENTER BAY: <path>` line and bay.md acts on that exact string**
  — rejected: bay.md parsing the path out of the "bay created at <path>" prose heading. Cheaper in
  tests, but it has the model reading prose headings, which the repo avoids everywhere else.
- **The waybill bay prints keeps its `/waybill:next <branch>/<leg>` last line, and no new claim
  about /clear is made** — rejected: correcting the /clear prose across next.md, README, the guide
  and the handover spec, or stating in bay.md that /clear undoes the move. The repo and `/wt`
  disagree and it cannot be tested from inside a session; the unchanged line re-enters when needed
  and is a no-op move when not.
- **Leave the body of bookings/waybill-bay.md untouched** — rejected: rewording it to mention that
  /waybill:bay moves the session in. Its sentence is about the handover after /clear, which this
  change does not alter, and it is embedded in four goldens that the guide must equal byte for byte.
- **bay.md's EnterWorktree failure handling is one line of explanation, then the block verbatim** —
  rejected: mirroring next.md's `cd <path>` fallback. next.md needs it because a `RUN:` line
  follows; bay prints none, and the waybill's `/waybill:next` line already recovers the move.
- **Both changes ship in one branch and PR, as separate commits** — rejected: a separate docket for
  the bay change.

## Feedback Strategy

**Inner-loop command**: `node --test tests/cli.test.js tests/commands.test.js tests/waybill.test.js`

**Playground**: The test suite, plus a scratch repository for seeing real output:

```bash
r=$PWD; d=$(mktemp -d); git init -q -b main "$d" \
  && git -C "$d" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m init \
  && cd "$d" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x
```

**Why this approach**: The change is to CLI output and a command file's text, both of which the
existing tests already pin with goldens and substring assertions.

## File Changes

### New Files

None.

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/cli.js` | In `bay` (the `if (markdown)` block near line 652): pass `enter: !alreadyThere && state.leg !== 'cleanup'` to `renderWaybillMarkdown`. Rewrite the comment above it (lines 650-651), which says markdown carries nothing that moves the session. |
| `src/waybill.js` | Doc comments only: lines 30-37 (keyed lines are what `commands/next.md` acts on), the `Route.enter` description near line 49, and the "No `cd` in any shape" paragraph at 383-384. Each should say `bay` asks for `ENTER BAY:` too. Leave the `/clear` sentence in the `Route.bay` description (lines 46-48) as it is. |
| `commands/bay.md` | Frontmatter `allowed-tools` gains `EnterWorktree`. The comment at 11-14 ("Nothing else was added") is corrected. The Task prose at 46-58 is rewritten for `ENTER BAY:`. Step 3 (104-106) is checked, and touched only if its "same terms" sentence does not already carry the new handling. See Implementation Details. |
| `tests/cli.test.js` | The `startsWith` assertion for the found case (near :930) expects the keyed line between heading and fence. New cases: cut prints the line; found prints the line; inside prints none; a docket whose next leg is cleanup prints none; no `RUN:` in any of them. The exact-golden test at :908-919 picks up the regenerated golden. |
| `tests/golden/bay-cut.md` | Regenerated: `ENTER BAY: /repo/.claude/worktrees/waybill-feat-thing` appears after the heading. Regenerate any other golden that `bay --markdown` output feeds; do not touch `bay.txt`, `bay.md`, `no-docket.txt` or `no-docket.md`, which embed the booking body and are not produced by this path. |
| `tests/commands.test.js` | The exact `deepEqual` of bay's allowed-tools (:471-477) and its title gain `EnterWorktree`. Add: bay.md names the literal `ENTER BAY:`; bay.md's allowed-tools has neither `Skill` nor `SlashCommand`. The `/^bay created at /` assertion at :448-455 stays true and is left alone. |
| `openspec/changes/<this effort's change>/specs/command-surface/spec.md` | `MODIFIED` deltas against the living spec, cited by requirement text because phase 1 shifts line numbers: the requirement that says `bay` with `--markdown` "SHALL print no `cd`: the waybill's handover ends in `/waybill:next <branch>/<leg>`, which moves the next session into the bay"; the session-rules requirement and its scenario "Cutting a bay from a session ... shown verbatim"; and the two "a selection never switches" statements, scoped to `next`'s docket menu so the bay picker's second run may enter. |
| `openspec/changes/<this effort's change>/specs/handover/spec.md` | `MODIFIED` delta for the keyed-lines passage that ties `ENTER BAY:` to `next` alone. |
| `README.md` | Lines 193-196, which describe `ENTER BAY` as a `/waybill:next` behaviour: add that `/waybill:bay` prints and acts on it too. Leave line 31 (the `/clear` claim) and line 127 (the command table row) alone. |
| `CHANGELOG.md` | One entry under `## Unreleased`: `/waybill:bay` now moves the session into the bay. Name no version. |

### Deleted Files

None.

## Implementation Details

### The keyed line from `bay --markdown`

**Pattern to follow**: `issueWaybill` in `src/cli.js:157-179`, which computes `enter` for `next`.

**Overview**: One property on the route object bay already passes.

```js
// src/cli.js, inside bay(), replacing the current markdown block
if (markdown) {
  // Never into a bay the cleanup leg is about to remove, for the reason `issueWaybill` gives.
  const enter = !alreadyThere && state.leg !== 'cleanup';
  io.out(`${heading}\n\n`);
  io.out(renderWaybillMarkdown(state, inspection, { bay: result.path, enter }));
  return 0;
}
```

**Key decisions**:

- Position: after the heading, before the text fence. It falls out of the existing code, keeps
  `bay created at` as the first line (so `commands.test.js:448-455` and `cli.test.js:966` stay
  true), and is the same for all three headings.
- No `token` is passed, so `keyedLines` can never add `RUN:` or `NEXT LEG:`.
- `--list` and the plain (non-markdown) path are untouched.

**Implementation steps**:

1. In `tests/cli.test.js`, add the four cases (cut, found, inside, cleanup-next) and update the
   found-case `startsWith`. Run the inner-loop command; see them fail.
2. Make the change above.
3. Regenerate `tests/golden/bay-cut.md` the way the repo's golden helper does (`assertGolden` in the
   test files; check its update mechanism before editing a golden by hand).
4. Update the three doc comments in `src/waybill.js` and the one in `src/cli.js`.

**Feedback loop**:

- **Playground**: the scratch-repo snippet above.
- **Experiment**: run `bay --markdown feat/x` three ways: first run from the trunk (expect heading,
  blank, `ENTER BAY: …feat-x`, blank, fence); second run from the trunk (same, with `bay already
  exists at`); from inside the bay (expect `already inside`, no keyed line). For cleanup, use the
  fixture the existing cleanup goldens use to reach that leg.
- **Check command**: `node --test tests/cli.test.js`

### `commands/bay.md`

**Pattern to follow**: `commands/next.md:76-85`, the `ENTER BAY:` handling, minus its `cd` fallback.

**Overview**: The command file gains the tool and the instruction to use it, and loses the prose
that said nothing moves the session.

**Key decisions**:

- Keyed on the exact string at the start of a line, in the same words `next.md` uses for its
  exceptions.
- The `ENTER BAY:` line is acted on, and the rest of the block is still shown verbatim. Whether the
  keyed line itself is shown is the implementer's choice; `next.md` does not show the waybill at all
  after a `RUN:`, which does not apply here. Recommended: show the block as printed, including the
  line, then make the move, so what is on screen matches what the CLI said.
- On a failed or denied `EnterWorktree`: say why in one line, show the block verbatim, stop. No `cd`
  block.
- Still stops. The paragraph that says running the waybill's commands is the next session's job
  stays, reworded so it no longer claims `/waybill:next` is the only thing that moves a session.
- `Skill` and `SlashCommand` stay off `allowed-tools`: that is what makes "cannot run a leg" a fact
  and not an instruction.

**Implementation steps**:

1. In `tests/commands.test.js`, change the allowed-tools `deepEqual` and add the two new assertions.
   See them fail.
2. Edit the frontmatter line to
   `allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion, EnterWorktree`.
3. Rewrite the comment at 11-14 to say why `EnterWorktree` is on the line (the same "unavailable,
   not merely unmentioned" reason given for `AskUserQuestion`).
4. Replace the paragraph at 52-54 with the `ENTER BAY:` handling, and adjust 46-47 ("It is already
   the whole answer") and 56-58 so they are consistent with one action being taken.
5. Read step 3 of the picker section (104-106). "On exactly the terms at the top of this Task"
   already carries the handling to the second block; change only its "`/waybill:next` line left for
   me" clause if it now reads as forbidding the move.
6. Keep every substring the tests pin: `bay --markdown '<branch>'`, the bang-line shape,
   `SELECT A BRANCH:`, `no branches besides`, `**verbatim**`.

**Feedback loop**:

- **Playground**: `tests/commands.test.js`.
- **Experiment**: with `EnterWorktree` added and with it removed; with `Skill` added (must fail).
- **Check command**: `node --test tests/commands.test.js tests/bang-lines.test.js`

### Written requirements and prose

**Overview**: OpenSpec deltas, one README passage, the changelog.

**Implementation steps**:

1. Write the `command-surface` and `handover` deltas in this effort's OpenSpec change. Each
   `MODIFIED` requirement must reproduce the whole requirement with its scenarios, edited.
2. Add a scenario for each new case: cut, found, inside, next leg is cleanup, `EnterWorktree` fails.
3. Before finishing, grep for the old behaviour and list every hit in the commit message or fix it:
   `grep -rn "no \`cd\`\|moves the next session\|ENTER BAY" src commands bookings README.md docs openspec/specs`.
   Hits in `bookings/waybill-bay.md` and `docs/guide/01-ride-along.md` about `/clear` are expected
   and stay.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/cli.test.js` | `bay --markdown` output in the cut, found, inside and cleanup-next cases; the golden. |
| `tests/commands.test.js` | bay.md's allowed-tools and keyed literal. |
| `tests/waybill.test.js` | Already covers `keyedLines` with `enter` true and false; no change expected. Run it to confirm. |

**Key test cases**:

- Cut from the trunk: output starts `bay created at <path>\n\nENTER BAY: <path>\n\n` followed by the text fence.
- Found from the trunk: output starts `bay already exists at <path>\n\nENTER BAY: <path>\n\n`.
- Inside the bay: output starts `already inside the <branch> bay at <path> — nothing to do\n\n` followed by the text fence, and no line starts with `ENTER BAY:`.
- Next leg is cleanup: no line starts with `ENTER BAY:`.
- None of the four contains a line starting `RUN:` or `NEXT LEG:`.
- `bay --markdown --list` still equals `bay --list` (existing test at :948-956).
- Plain `bay <branch>` output is byte-identical to before (existing goldens).

### Manual Testing

- [ ] In a Claude Code session on the trunk of a scratch repository, run `/waybill:bay feat/scratch`. Confirm the session's working directory is the new worktree and that no leg ran.
- [ ] Run `/waybill:bay` with no argument, pick a branch, and confirm the session ends in that branch's bay.
- [ ] Run `/waybill:bay feat/scratch` again from inside the bay and confirm nothing moves and the waybill is shown.

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| `EnterWorktree` fails or the operator denies it | bay.md: one line saying why, then the block verbatim, then stop. The waybill's `/waybill:next` line still moves the next session. |
| `bay` exits non-zero (invalid branch name, not a repository) | Unchanged: the bang line folds it into `waybill: exited N`; no `ENTER BAY:` line exists, so nothing is acted on. |
| The session is already in a different worktree | `EnterWorktree` with a `path` under `.claude/worktrees/` of the same repository is allowed from inside a worktree. A bay outside that directory (`WAYBILL_BAY_DIR` set) may be refused; that is the failure case above. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Keyed line | Session moved into a bay being removed | `bay --markdown` on a docket whose next leg is cleanup | Session left in a directory that no longer exists | The `state.leg !== 'cleanup'` guard, with its own test. |
| Keyed line | Line printed but silently ignored | `EnterWorktree` missing from bay.md's allowed-tools | Session stays in the main checkout with no error | `tests/commands.test.js` asserts the tool is on the line and the literal is in the file. |
| Keyed line | `state.leg` is `null` | A docket with nothing left to hand off | `null !== 'cleanup'` is true, so the line prints | Accepted: entering a bay with no next leg is harmless, and `next` does the same. |
| bay.md prose | The model runs the waybill's last line after entering | Prose that reads as "you are in the bay, carry on" | A leg runs in a session that was meant to stop | Keep the explicit "then stop" paragraph; `Skill` and `SlashCommand` stay off allowed-tools, asserted by test. |
| Goldens | Guide samples drift from goldens | Editing `bookings/waybill-bay.md` | `tests/guide.test.js` fails | The booking body is out of scope; do not edit it. |

## Validation Commands

```bash
# There is no lint or typecheck script in this repo; types are JSDoc only.

# Tests
node --test tests/

# Contract checks for this phase (run from the repository root)
r=$PWD; d=$(mktemp -d); git init -q -b main "$d" && git -C "$d" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -q --allow-empty -m init && cd "$d" && WAYBILL_BOOKINGS_DIR= WAYBILL_BAY_DIR= node "$r/src/cli.js" bay --markdown feat/x > out.txt 2>&1; grep -q -E '^ENTER BAY: /.+feat-x$' out.txt && grep -q -E '^/waybill:next feat/x/' out.txt && ! grep -q '^RUN:' out.txt

grep -q -E '^allowed-tools:.*EnterWorktree' commands/bay.md && grep -q 'ENTER BAY:' commands/bay.md && ! grep -q -E '^allowed-tools:.*(Skill|SlashCommand)' commands/bay.md
```

## Rollout Considerations

- **Feature flag**: none.
- **Release**: the next release PR ships it; this change names no version.
- **Rollback plan**: revert the phase's commit. The plugin cache holds a versioned copy, so a
  session keeps the old `bay.md` until the plugin updates.

## Open Items

- [ ] The name of this effort's OpenSpec change directory is chosen by the specify leg; the two
      delta paths above use a placeholder for it.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
