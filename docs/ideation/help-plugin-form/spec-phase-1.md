# Implementation Spec: Help in plugin form, and a bay you land in - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: S

Phase title: **Archive add-help-card**

## Technical Approach

`openspec/changes/add-help-card/` is a finished change: all 31 tasks in its `tasks.md` are ticked and
the code it describes shipped in 0.9.0. It was never archived, so the `help-card` capability exists
only as `## ADDED Requirements` inside that change (`specs/help-card/spec.md`), and
`openspec/specs/help-card/` does not exist. Phases 2 and 3 both need to write `MODIFIED` deltas, and
a `MODIFIED` delta needs a living spec to modify.

This phase folds the change into the living specs with the repo's own archive carrier
(`/spec:archive`, which invokes the `opsx:archive` skill) and does nothing else. It changes no
behaviour and no test. The change also carries a `command-surface` delta (one `MODIFIED`
requirement, one `ADDED`), which the same archive run merges into
`openspec/specs/command-surface/spec.md`.

Do not hand-move the files. The archive carrier owns the merge rules for `ADDED`/`MODIFIED`
sections; a manual copy would leave the delta headings (`## ADDED Requirements`) in the living spec.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Archive add-help-card first, then write MODIFIED deltas against the living help-card spec** —
  rejected: editing the unarchived add-help-card change in place. In-place editing leaves its ticked
  `tasks.md` and `design.md` demanding `waybill new` and `cd`, and makes this branch own a finished
  change, which feeds change-id discovery for the execute leg.
- **Both changes ship in one branch and PR, as separate commits** — rejected: a separate docket for
  the bay change. The operator asked for it to ride along. For this phase it means the archive is its
  own commit, before any behaviour changes.

## Feedback Strategy

**Inner-loop command**: `node --test tests/`

**Playground**: The test suite. Nothing in `tests/` or `src/` reads `openspec/changes/add-help-card`
(checked: the only `openspec/` references in tests are fixture paths inside temporary repos), so the
suite is a regression guard here, not a driver.

**Why this approach**: The phase moves documentation; the only thing that can go wrong for the code
is an accidental edit, which the full suite catches in a few seconds.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `openspec/specs/help-card/spec.md` | The living help-card spec, produced by the archive from the change's `ADDED` requirements (eight requirements, from "One screen, four sections, in a fixed order" to "The slash command shows the page verbatim and stops"). |
| `openspec/changes/archive/<date>-add-help-card/` | The archived change (`proposal.md`, `design.md`, `tasks.md`, `specs/`), moved by the carrier. `<date>` is whatever the carrier stamps; do not choose it by hand. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `openspec/specs/command-surface/spec.md` | The carrier applies the change's delta: `MODIFIED` "Four verbs, each naming one thing" and `ADDED` "The usage lists every command, and grows by one row". |

### Deleted Files

| File Path | Reason |
| --- | --- |
| `openspec/changes/add-help-card/` | Moved to the archive directory by the carrier. |

## Implementation Details

### Archive the change

**Pattern to follow**: `openspec/changes/archive/2026-09-10-paste-ready-waybills/` and
`openspec/changes/archive/2026-09-10-new-bay-and-fleet/` show the resulting layout.

**Overview**: Run the archive carrier for `add-help-card` and commit the result on its own.

**Key decisions**:

- Use `/spec:archive add-help-card` (`commands/spec/archive.md`), not `git mv`.
- One commit, containing only `openspec/` paths.

**Implementation steps**:

1. Run `node --test tests/` and confirm it passes before touching anything.
2. Run `/spec:archive add-help-card`.
3. Confirm `openspec/specs/help-card/spec.md` exists and contains `### Requirement:` headings with
   no `## ADDED Requirements` heading left in it.
4. Confirm `openspec/specs/command-surface/spec.md` gained "The usage lists every command, and grows
   by one row" and that its line numbers have shifted: phases 2 and 3 cite this file by requirement
   name for that reason, not by line.
5. Run `node --test tests/` again.
6. Commit: `chore: archive the add-help-card change`.

**Feedback loop**: none beyond the suite; this is a file move plus a mechanical merge.

## Testing Requirements

No new tests. The phase is behaviour-neutral.

### Manual Testing

- [ ] `test -f openspec/specs/help-card/spec.md`
- [ ] `test ! -d openspec/changes/add-help-card`
- [ ] `! grep -q '^## ADDED Requirements' openspec/specs/help-card/spec.md`
- [ ] `git diff --stat HEAD~1 -- src tests commands bookings` prints nothing

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| The archive carrier is unavailable in the session (`opsx:archive` not installed) | Stop and say so. Do not move the files by hand. |
| The carrier reports a merge conflict or validation error in the `command-surface` delta | Stop and report the exact message. The delta was written against an older living spec; resolving it is a decision for the operator. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Archive | Delta headings left in the living spec | Files copied by hand instead of through the carrier | Later `MODIFIED` deltas fail to match requirement names | Step 3's grep. |
| Archive | Docket inference changes mid-effort | `src/progress.js` discovers change ids under `openspec/changes/`; removing a fully ticked change changes what this branch "owns" | `waybill next` could report a different leg for this docket before the new change exists | Run `node src/cli.js next` after the commit and read the leg it names; if it is not `specify` or `execute` as expected for where the route stands, report it and do not work around it. |

## Validation Commands

```bash
# There is no lint or typecheck script in this repo; types are JSDoc only.

# Tests
node --test tests/

# The living spec exists and is clean
test -f openspec/specs/help-card/spec.md && ! grep -q '^## ADDED Requirements' openspec/specs/help-card/spec.md
```

## Rollout Considerations

- **Feature flag**: none.
- **Rollback plan**: revert the single commit.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
