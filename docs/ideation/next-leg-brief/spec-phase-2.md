# Implementation Spec: Next-Leg Brief - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M
**Prereq**: Phase 1 (the `brief` verb and the `BRIEF:` keyed line must exist before any command file
can act on them)

## Technical Approach

Phase 2 is prose and its tests: a new `/waybill:brief` command, two command files taught to trigger it,
and the user-facing documentation. No `src/` behaviour changes here.

Every trigger keys on a literal the CLI prints, never on a model's reading of the situation — the rule
`commands/next.md` already states about `ENTER BAY:`, `RUN:` and `NEXT LEG:`. Phase 1 gives the display
run a `BRIEF: <leg> <path>` line, emitted only when the leg takes a brief, the bay exists and no brief
file is there yet. So the command files never decide *whether* to offer the prompt; they only act when
the line is present.

`commands/next.md` already declares `AskUserQuestion`, `Skill` and `SlashCommand` on its
`allowed-tools` line, so it needs no tool change. `commands/bay.md` declares only
`Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion`, and a test pins that exact list with
`deepEqual` — without `Skill` and `SlashCommand` a "yes" on bay's prompt would silently do nothing, on
the very path that carries the brainstorm. Both the file and the pinned list change together.

The one honest limitation to record: the automatic trigger after a run-mode leg is an instruction to a
model at the end of a long interactive skill, so it can be missed. The end-of-leg prompt is the backstop,
and the `BRIEF:` line reappears on every later display run until a brief exists.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **A separate `/waybill:brief`, run automatically after a run-mode leg and offered at end-of-leg display** — rejected: the display run authoring the brief implicitly; each booking body asking for it. The owner wants an explicit, nameable step that `next` orchestrates.
- **End-of-leg prompt is an `AskUserQuestion`** — rejected: a printed line (skimmable); a paste block (runs even when there is nothing to brief).
- **Display runs emit a `BRIEF:` keyed line the command files key on** — rejected: command files deciding from prose conditions. Command files key only on exported literals.
- **`bay.md` allowed-tools gains `Skill` and `SlashCommand`** — rejected: keeping bay's minimal pinned list. Without them a "yes" on bay's prompt silently does nothing.
- **HTML only, passed by path** — rejected: Markdown, a format setting, inline conversion.
- **Only refine and specs take a brief** — rejected: refine only; every transfer leg.

## Feedback Strategy

**Inner-loop command**: `node --test tests/commands.test.js`

**Playground**: the command-file suite, which reads `commands/*.md` as text and asserts on frontmatter
and on the literals each file branches on.

**Why this approach**: every change here is a file whose contract is "contains these literals and
declares these tools", which is exactly what that suite checks.

## File Changes

### New Files

| File Path            | Purpose                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `commands/brief.md`  | `/waybill:brief` — runs `waybill brief`, writes the HTML brief with `Write` |

### Modified Files

| File Path                            | Changes                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `commands/next.md`                   | Act on `BRIEF:` with an `AskUserQuestion`; run `/waybill:brief` after a run-mode wrapped command   |
| `commands/bay.md`                    | The same `BRIEF:` prompt; add `Skill` and `SlashCommand` to `allowed-tools`                       |
| `commands/help.md`                   | Mention `/waybill:brief`                                                                          |
| `tests/commands.test.js`             | Add `brief.md` to `DECLARED`; update bay's pinned tool list; assert the new literals              |
| `README.md`                          | Document the brief: what it is, where it lives, when it is asked for                              |
| `docs/guide/01-ride-along.md`        | Show the prompt in the walkthrough                                                                |
| `docs/guide/02-glossary.md`          | Define "brief"                                                                                    |
| `docs/guide/03-reference.md`         | `/waybill:brief`, the `brief:` booking key, the handoff path                                      |
| `openspec/specs/handover/spec.md`    | Requirement for the `BRIEF:` line and the `RUN:` context suffix                                   |
| `openspec/specs/command-surface/spec.md` | Requirement for the `brief` verb and `/waybill:brief`                                         |

## Implementation Details

### `commands/brief.md`

**Pattern to follow**: `commands/next.md` (bang line, verbatim rule, keyed-line handling) and
`commands/bay.md` (restrictive `allowed-tools` with a comment explaining every entry).

**Overview**: runs the CLI, then writes the HTML file the CLI names.

```
---
description: "Waybill — write the brief the next leg's session will read"
argument-hint: "[branch — the docket to brief; omit it when standing in its bay]"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), Write
---

! node ${CLAUDE_PLUGIN_ROOT}/src/cli.js brief "$ARGUMENTS" 2>&1 || echo "waybill: exited $?"
```

**Key decisions**:

- `Write` is on the line because the model authors the HTML; without it the command would print a path
  and do nothing. It is the only tool added beyond the `bay.md` set.
- `2>&1 || echo "waybill: exited $?"` for the reason `next.md` and `bay.md` give: Claude Code discards a
  command file whose `!` line exits non-zero, so the error would never reach the session.
- The Task section keys on the CLI's literals: `BRIEF FOR:`, `WRITE TO:`, `GUIDANCE:`, and
  `NOTHING TO BRIEF:` (say so in one line and stop — not an error).

**Task section, in short**:

1. On `NOTHING TO BRIEF:` — say which leg and stop.
2. On `WRITE TO: <path>` — write a self-contained HTML page there with `Write`, following `GUIDANCE:`,
   drawing **only** on this conversation. Never invent content to fill a heading: a heading with nothing
   behind it is worse than an absent one, because the next session cannot tell the difference.
3. Confirm in one line: what was written, for which leg, at which path.

### `commands/next.md`

**Overview**: two additions, both keyed on literals.

**`BRIEF: <leg> <path>` (display runs)** — before showing the waybill, ask with `AskUserQuestion`:

```
Question: "Write the brief for <leg> before you /clear?"
Options:
- "Yes — write it now" (Recommended) — invoke /waybill:brief and follow it
- "Skip" — hand over without a brief; the next session starts from the waybill alone
```

Then show the waybill block verbatim, as today. The line appears only when there is something to brief
and nothing written yet, so the question never fires on a fresh session with no work behind it.

**After a run-mode `RUN:`** — once the leg's command has finished, invoke `/waybill:brief` and follow it.
State plainly in the file that this is the automatic trigger and that it happens *after* the leg's own
work, never before.

**Key decisions**:

- The prompt comes before the waybill block, not after: once the block is shown, the session's parting
  instruction is "stop", and anything after it reads as ignoring the verbatim rule.
- No `allowed-tools` change — `AskUserQuestion`, `Skill` and `SlashCommand` are already declared.

### `commands/bay.md`

**Overview**: the same `BRIEF:` prompt, plus the tools to act on a "yes".

**Key decisions**:

- `allowed-tools` becomes `Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion, Skill, SlashCommand`.
  The `deepEqual` assertion in `tests/commands.test.js` is updated in the same change, and the comment
  block at the top of `bay.md` gains a sentence naming why each new tool is there — the file's existing
  convention.
- This is the path that carries the brainstorm: ideate finishes, `/waybill:bay` prints refine's waybill,
  and this prompt is the last chance before `/clear`.

## Testing Requirements

### Unit Tests

| Test File                  | Coverage                                                                     |
| -------------------------- | ----------------------------------------------------------------------------- |
| `tests/commands.test.js`   | `brief.md` declared and present; `Write` on its allowed-tools; bay's new pinned list; both files branch on `BRIEF:`; next.md names `/waybill:brief` |
| `tests/guide.test.js`      | Whatever the guide suite asserts about chapter content, kept green             |

**Key test cases**:

- `commands/brief.md` exists and is in `DECLARED` (the suite fails until it is listed).
- `brief.md`'s `allowed-tools` contains `Write`.
- `bay.md`'s `allowed-tools` equals the new six-entry list exactly.
- `next.md` and `bay.md` both contain the literal `BRIEF:`.
- `next.md` contains `/waybill:brief` for the automatic trigger.

## Failure Modes

| Component      | Failure                                   | Trigger                                   | Impact                                        | Mitigation                                    |
| -------------- | ----------------------------------------- | ----------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `bay.md`       | "Yes" does nothing, silently              | `Skill`/`SlashCommand` left off the line   | Brainstorm lost on the flagship path           | Tools added; `deepEqual` test pins the list     |
| Auto trigger   | Forgotten after a long skill              | Model ends the leg without running brief   | No brief for the next leg                      | The end-of-leg prompt reappears on every display run until one exists |
| `brief.md`     | Model invents content to fill headings     | Thin conversation                          | The next session trusts a fabricated brief     | Task section forbids it explicitly              |
| `DECLARED`     | Suite red                                  | `brief.md` added but not listed            | `npm test` fails                               | Listed in the same change                       |
| Ideation intake| Brief never read                           | Receiving session ignores the path          | No `Carrying brainstorm conclusion` line       | `(read first)` in the `RUN:` suffix; judged by J1 |

**External dependency**: ideation 0.26.1 carries a brainstorm conclusion only from its own conversation
(`references/interview-engine.md`). The payoff therefore depends on the receiving session reading the
brief path before its intake runs, and `(read first)` is the only thing prompting it. This is what the
J1 judgment check exists to confirm.

## Validation Commands

```bash
node --test tests/commands.test.js
node --test tests/guide.test.js
npm test
for f in README.md docs/guide/02-glossary.md docs/guide/03-reference.md \
         openspec/specs/handover/spec.md openspec/specs/command-surface/spec.md; do
  grep -q 'waybill:brief' "$f" || echo "missing: $f"
done
```
