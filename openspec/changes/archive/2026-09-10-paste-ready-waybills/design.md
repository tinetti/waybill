## Context

See proposal.md — Why. The detailed implementation spec is `docs/ideation/paste-ready-waybills/spec.md`,
and the acceptance checks are in `contract-data.json` next to it. This document records the design
decisions and the state of the tree they were checked against.

Current state (checked against `edec6c8`, after rebasing this branch onto `main`):

- `src/waybill.js` `nextBlock(state)` builds the NEXT block from the booking. It looks up
  `HANDOVER_LINES` (`transfer` → `/clear, then run:`, `through` → `run:`, anything else printed
  verbatim), builds the command through `ARGUMENT_SOURCES` (a null argument is dropped), and appends
  the `└ model · effort` caption and the indented body from `waybillText`.
- `renderWaybill(state, inspection, cd)` is pure: no fs, no clock. It joins position, the optional
  `IN BAY:` block, NEXT, and `withFindings`. `withFindings` is shared with `renderPosition` and the
  fleet surfaces, so `status.txt`, `fleet.txt` and `select.txt` all flow through it.
- `cdLines(target, alreadyThere)` returns the one indented `cd` line. `src/cli.js` calls it from
  `issueWaybill` (trunk-resolved `next`) and from `bay()`.
- `bay()` prints its own heading (`bay created at …` / `bay already exists at …` / `already inside …`)
  plus the `cd` line, then calls `renderWaybill` with **no** `cd` argument. The renderer's IN BAY
  section never reaches `bay`.
- `next()` has three waybill-issuing paths: `named` → `issueWaybill`, trunk with one docket →
  `issueWaybill`, and in-bay → `renderWaybill` directly (line ~224). `NEXT_FLAGS` is `Set(['--json'])`.
  `bay()` rejects every dashed argument except `--bay-dir`.
- The session commands shell out through
  `` !`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node … ; else echo …; fi` ``.
  `tests/commands.test.js` pins that spelling.
- Golden files in `tests/golden/*.txt` pin every byte. `UPDATE_GOLDEN=1` rewrites them.

## Goals / Non-Goals

**Goals:**
- One function decides which commands a handover needs. Both renderers consume its output and never
  re-derive it.
- `renderWaybillMarkdown` is as pure as `renderWaybill`, so markdown output is golden-testable the
  same way.
- Every contract check in `contract-data.json` goes from failing to passing without changing the
  checks.

**Non-Goals:**
- No change to `Inference`, bookings parsing, `--json` or the fleet.
- No attempt to stop Claude Code saving `/model` or `/effort` as the default for new sessions; that
  is the host's behaviour.
- No edit to the living `command-surface` requirement "`bay` replaces `start`". Its claim that `bay`
  prints the block `start` did is a statement about the rename. The NEXT block's new shape is owned
  by the `handover` capability.

## Decisions

**1. Extract `handoverCommands(booking, state) → { prose, commands }` in `src/waybill.js`.**
Both `nextBlock` and the markdown renderer call it. It absorbs the current `HANDOVER_LINES`,
`DEFAULT_HANDOVER`, `ARGUMENT_SOURCES` lookup and the null-argument rule; `HANDOVER_LINES` and
`DEFAULT_HANDOVER` are deleted.
*Alternative:* have each renderer build its own list. Rejected: two copies of the order and inclusion
rules are exactly how a plain waybill and a markdown waybill would come to disagree about whether
`/effort` is due.

**2. A separate `renderWaybillMarkdown(state, inspection, cd)` rather than a `markdown` option on
`renderWaybill`.**
The two outputs share almost no formatting: fences, bold headings, unindented body, bullets.
*Alternative:* thread a `format` flag through `renderWaybill`, `nextBlock` and `withFindings`.
Rejected: it puts a branch on every line of the functions that feed the goldens that must stay
byte-identical, and a slip in the plain branch would show up in `status.txt` or `fleet.txt`.

**3. Leave `withFindings` alone and give markdown its own findings formatter.**
The markdown version is two short loops over the same `inspection.ignored` and warnings lists in
the same order. *Alternative:* pass `withFindings` a formatter. Rejected for the same reason as
decision 2: it is shared by every non-handover surface, and the requirement is that those stay
untouched.

**4. `cdCommand(target)` returns the bare `cd <target>`, and `cdLines` is rewritten on top of it.**
Markdown needs the command without the two-space indent, and plain output must keep the indent.
One builder keeps the two shapes identical apart from the indent.

**5. `--markdown` is a CLI flag, and the slash commands echo its output verbatim.**
*Alternative:* have the model wrap each unindented `/` line in a fence, following instructions in
`commands/next.md`. Rejected: a model-side transformation cannot be pinned by a golden and drifts
between runs. This keeps the existing verbatim rule intact.

**6. The `--json` + `--markdown` conflict is checked right after the flag loop in `next()`, before
`repoRoot`.**
Otherwise, outside a repository, the caller would get "not a git repository" instead of the error
about their actual mistake. The contract check runs from the repo root either way, but the ordering
is what makes the error the same everywhere. The message must contain `cannot be combined`, because
the contract greps for that text.

**7. `bay --markdown` renders its own heading and cd fence in `src/cli.js`.**
`bay` never hands `cd` to the renderer (see Context), so the renderer's IN BAY section cannot
supply it. This mirrors today's split: `bay` owns the report of what it just created, and the
renderer owns the waybill.

**8. The position block goes in a ` ```text ` fence.**
Markdown collapses the leg strip's single newlines into one paragraph, and the strip's two-space
indent would be lost as well.

**9. `commands/new.md` runs only the last command line.**
Its "ignore the `/clear, then run:` line" paragraph targets a line this change deletes. Read
literally against the new block, the session could run `/clear` (erasing its own instruction) or
`/model` (changing the operator's default model). The rule "run only the last line" holds for any
booking, including one that adds `/effort` later.

**10. Goldens are regenerated, and the contract's greps check them independently.**
`UPDATE_GOLDEN=1` records whatever the code prints, so a golden alone cannot catch a merged
`/model` + `/effort` fence. The contract's fence-shape, caption and unindented-line checks do.
The regenerated diff is still reviewed by eye.

## Risks / Trade-offs

- [A booking body containing a ``` fence breaks fence pairing in markdown] → The body is emitted
  after every command fence, so command fences stay intact. The rest is accepted; no current
  booking body contains a fence.
- [`--markdown` forgotten on one `next` path, e.g. the in-bay path that bypasses `issueWaybill`] →
  CLI tests cover all three paths: in-bay, `next <branch>` from the trunk, and the trunk with one
  docket.
- [Plain-output consumers break on the new shape] → The plain block was never a stable interface;
  `--json` is, and it is unchanged. The change is marked BREAKING in the proposal so the release
  notes say so.
- [Merge conflict with `ideation/waybill-help`] → That branch edits USAGE, `tests/commands.test.js`
  and `README.md`. Add only one Options row to USAGE and do not touch its Commands block.
- [The contract's COMMITS check wants a commit that names the spec path] → The implementation
  commit message must reference `docs/ideation/paste-ready-waybills/spec.md`. Verify reports
  `commits=0/1` until one does.
- [The paste behaviour is only observable in a real client] → A judgment check has the operator run
  `/waybill:next` in the desktop app. It is a human step, and tasks.md lists it last.

## Migration Plan

No data or state is involved. The change ships in a normal PR, and the version bump comes in the
repo's own `chore: release` PR. Rollback is reverting the PR.
