# Implementation Spec: Leg Renames and a Six-Leg Route - Phase 4

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

This is the phase that turns the suite green. Everything before it left `tests/guide.test.js` and the golden comparisons red on purpose.

Waybill's goldens are byte-exact: `assert.equal(result.out, fs.readFileSync(path.join(GOLDEN, '…'), 'utf8'))`, with **no regeneration mechanism** — no `UPDATE_GOLDEN=1`, no `npm run golden`. There are 33 files in `tests/golden/`, and nearly every one embeds the route length. They are updated once, here, after the code has settled: updating them mid-stream means updating them twice, which is also the argument the contract uses for shipping this as a single change rather than two PRs.

The critical structural point, and the reason this phase's title names the ride-along: **`docs/guide/01-ride-along.md` is coupled to the goldens inside a single assertion.** `tests/guide.test.js:134-143` extracts every `## Leg N · <id>` heading and deep-equals the ids against `LEGS`, checking the numbering as it goes. `tests/guide.test.js:145-158` collects every ` ```waybill ` fence, requires each one to match some leg golden **byte for byte**, requires every leg to have a matching sample, and asserts `samples.length >= LEGS.length`. The guide's headings and fences are therefore not prose — they are the other half of the golden assertion, and scheduling them in the prose phase would leave the suite red across a phase boundary and make the whole-suite criterion unsatisfiable until the very end.

Everything in `01-ride-along.md` that is *not* a heading or a ` ```waybill ` fence — the narrative, the tick strips, the paste lines — stays in phase 5.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **The ride-along's leg headings and waybill fences move into this phase** — rejected: keeping all guide edits together in the prose phase. `tests/guide.test.js` couples them to `LEGS` and the goldens in one assertion.
- **Ship rename, removal and `new` rework as one change** — rejected: two PRs. All 33 goldens are byte-exact and nearly every one embeds the route length, so a split rewrites every one of them twice.
- **Name each leg for the work its booking does** — rejected: name each leg for its stamp.
- **Merge `refine` into `contract`, call it `ideate`** — rejected: keep two legs.
- **The merged `ideate` inherits `handover: transfer`** — rejected: inherit `through`. Visible in the goldens as the `/clear` block.
- **Collapse the brainstorm leg into `/waybill:new`** — rejected: keep it as leg 1.
- **`/waybill:new` keeps `src/waybill.js` untouched** — rejected: a pre-route rendering mode.
- **`/waybill:new` proposes a concrete branch name (Full tier)** — rejected: a placeholder.
- **Carry the off-route booking as one exported id constant** — rejected: a second booking category.
- **Accept that three leg ids match their carrier only by namespace** — rejected: renaming the vendored spec commands.
- **Machine-local overlay breakage is a release note, backed by a new doctor test** — rejected: a migration.
- **Keep the brainstorm as a booking, prove rebookability with a test** — rejected: hardcoding the carrier.
- **Every `cmd` check pairs a positive assertion with its negative half** — rejected: bare negated greps.

## Feedback Strategy

**Inner-loop command**: `node --test tests/guide.test.js tests/cli.test.js`

**Playground**: the CLI itself. Regenerate each golden by running the command that produces it and capturing stdout, rather than hand-editing 33 files — hand-editing byte-exact fixtures is how trailing-whitespace and tick-strip-width errors get introduced.

**Why this approach**: `guide.test.js` reports precisely which leg has no matching sample and which sample matches no golden, so it functions as a worklist. Run it, fix the named item, run it again.

## File Changes

### New Files

None — `tests/golden/new.txt` and `new.md` were created in phase 2.

### Modified Files

| File Path | Changes |
| --- | --- |
| `tests/golden/*.txt`, `tests/golden/*.md` | All 33 files. Route length `of 8` → `of 6` wherever a leg line appears; leg names updated; `complete.txt:1` "all 8 legs complete" → 6; `help.txt:18` and the route table above it rebuilt for six rows; `fleet.txt:4-6`, `select.txt:4-6`, `status.txt:1`, `trunk-one-docket.*`, `findings.md:2`, `next-run.md:6`, `next-branch-only.md:4`, `next-stale-leg.md:6`, `bay-cut.md:4`. |
| `tests/golden/ideate.{txt,md}` | **Re-captured, not renamed.** These now hold the renamed `ideate` leg (the merged contract leg), not the brainstorm. Their previous contents belong to `new.{txt,md}` from phase 2. |
| `tests/golden/contract.{txt,md}` → `ideate.{txt,md}` | Superseded by the above; delete the old `contract.*` pair. |
| `tests/golden/specs.{txt,md}` → `specify.{txt,md}` | Renamed; `tests/guide.test.js:147` derives golden filenames from `LEGS`, so the name is forced. |
| `tests/golden/refine.{txt,md}` | Deleted — no such leg. |
| `docs/guide/01-ride-along.md` | **Headings and fences only.** `## Leg N · <id>` headings for six legs, renumbered 1-6; every ` ```waybill ` fence re-captured to match its leg golden byte for byte. Narrative prose, tick strips and paste lines are phase 5. |
| `tests/waybill.test.js` | ~39 leg-name references and 9 length references. |
| `tests/help.test.js` | ~4 leg-name references; the help-card route table. |
| `tests/review.test.js` | 1 leg-name reference. |
| `tests/fleet.test.js` | Leg-name references; see also `src/fleet.js:15,23`. |
| `tests/inspection-gitignore.test.js` | ~6 leg-name references. |
| `src/fleet.js` | Comments at `:15,23` naming "leg 2 … leg 8" and "a branch mid-refine". |
| `src/progress.js` | Comment at `:139`, "a specs-leg problem". |
| `src/waybill.js` | Comments at `:58,298` naming `ideate`; `:159` naming the `specs` leg. Comments only — no behavior change, per phase 2's decision. |

### Deleted Files

| File Path | Reason |
| --- | --- |
| `tests/golden/refine.txt`, `tests/golden/refine.md` | The leg is gone. |
| `tests/golden/contract.txt`, `tests/golden/contract.md` | Superseded by the re-captured `ideate.*`. |
| `tests/golden/specs.txt`, `tests/golden/specs.md` | Renamed to `specify.*`. |

## Implementation Details

### Regenerating the goldens

**Pattern to follow**: `tests/cli.test.js:880-882` — `assertGolden(GOLDEN, 'bay-cut', stable, 'md')`, which already normalises the temp path to a literal before comparing. Any regeneration must apply the same normalisation.

**Overview**: 33 byte-exact snapshots, captured from real output rather than edited by hand.

**Key decisions**:

- Capture from the CLI, do not hand-edit. Tick-strip width, trailing whitespace and the `·` separator are all load-bearing and all invisible in a diff.
- `ideate.{txt,md}` is a **content swap, not a rename**. This is the phase's sharpest trap: the filename survives the rename while its meaning changes completely, so a mechanical `git mv` would silently pin the merged contract leg's assertions against the brainstorm's old output.
- Temp paths differ per run; normalise them as `tests/cli.test.js:880` already does.

**Implementation steps**:

1. Delete `refine.*`; delete `contract.*`; `git mv specs.* specify.*`.
2. Re-capture `ideate.*` from the merged `ideate` leg's real output.
3. Re-capture every remaining golden that carries a leg line or a route length.
4. Rebuild `help.txt`'s route table for six rows.
5. Run `node --test tests/cli.test.js` and work the failures until clean.

**Feedback loop**:

- **Playground**: a scratch repo at each of the six legs.
- **Experiment**: capture at every leg plus the trunk, the no-docket case, the all-complete case, and the fleet/select multi-docket views.
- **Check command**: `node --test tests/cli.test.js tests/waybill.test.js tests/help.test.js`

### The ride-along's headings and fences

**Pattern to follow**: the existing `## Leg N · <id>` headings and ` ```waybill ` fences in `docs/guide/01-ride-along.md`.

**Overview**: Six headings, renumbered 1-6, each with at least one fence matching that leg's golden byte for byte.

**Key decisions**:

- The old "Leg 1 · ideate" section described the brainstorm. The brainstorm is off-route, so that section does not become "Leg 1 · bay" — it is **removed from the numbered sequence**, and whatever narrative it carried about brainstorming moves to unnumbered prose in phase 5.
- `assert.ok(samples.length >= LEGS.length)` is a floor, not an equality — extra `waybill` fences are allowed, but every one of them must still match some leg golden. A leftover fence showing a retired leg fails the first assertion in the loop, not the count.
- The headings assertion checks numbering as well as ids (`` `${match[2]}` is numbered ${match[1]}, not ${i + 1} ``), so renumbering cannot be skipped.

**Implementation steps**:

1. Remove the brainstorm's numbered heading and its fence.
2. Renumber the remaining headings 1-6 with the new ids.
3. Replace each fence's body with the corresponding golden's exact bytes.
4. Run `node --test tests/guide.test.js` and treat its failure messages as the worklist.

**Feedback loop**:

- **Playground**: `tests/guide.test.js`, which names the offending leg or sample in its assertion message.
- **Experiment**: run after each heading fixed, to confirm the failure count falls monotonically.
- **Check command**: `node --test tests/guide.test.js`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/cli.test.js` | Every golden comparison; the `leg N of 6` renderings. |
| `tests/guide.test.js` | Heading ids and numbering against `LEGS`; every fence matching a leg golden; sample-count floor. |
| `tests/waybill.test.js` | Renderer output at each leg. |
| `tests/help.test.js` | The help card's six-row route table. |
| `tests/fleet.test.js`, `tests/review.test.js`, `tests/inspection-gitignore.test.js` | Remaining leg-name references. |

**Key test cases**:

- Every golden carrying a leg line reads `leg N of 6`.
- No golden reads `of 7` or `of 8`.
- `complete.txt` reads "all 6 legs complete".
- Each of the six legs has a ride-along fence matching its golden byte for byte.
- Edge case: goldens with no leg line at all — `help.txt`, `no-docket.*`, and the fleet-empty view — are not expected to match the `leg [1-6] of 6` pattern; the success criterion is written as "at least one matches, none contradicts" for exactly this reason.
- Edge case: `ideate.{txt,md}` holds the merged contract leg's output, not the brainstorm's.

### Manual Testing

- [ ] Read `docs/guide/01-ride-along.md` top to bottom and confirm the walkthrough still narrates a coherent journey after the brainstorm section was unnumbered.
- [ ] Diff a re-captured golden against its predecessor and confirm only the intended bytes moved.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `ideate.*` goldens | Silent content swap | `git mv` used instead of re-capture | The merged `ideate` leg's assertions are pinned against the brainstorm's old output, and both files still exist so nothing errors | Named explicitly as a content swap, not a rename; step 2 |
| Goldens | Invisible whitespace drift | Hand-editing rather than capturing | Byte-exact comparison fails with a diff that looks identical on screen | Capture from the CLI; never hand-edit |
| Goldens | Temp path leaks into a fixture | Capturing `bay-cut.md` without normalising | The golden passes on the capturing machine and fails everywhere else | Reuse `tests/cli.test.js:880`'s normalisation |
| Ride-along | Orphan fence | A retired leg's fence left in place | `guide.test.js:152` fails with "a waybill sample matches no leg golden" | The assertion is the worklist; work it to zero |
| Ride-along | Heading numbering skipped | Ids updated but numbers left at 1-8 | `guide.test.js:140` fails naming the leg and both numbers | Step 2 renumbers explicitly |
| Help card | Route table row count | `help.txt:18` updated but the table above it left at eight rows | The help card claims a route the tool does not have | Step 4 |

## Validation Commands

```bash
# Inner loop
node --test tests/guide.test.js tests/cli.test.js

# Phase gate — this is the phase where it must finally pass
node --test tests/
```

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
