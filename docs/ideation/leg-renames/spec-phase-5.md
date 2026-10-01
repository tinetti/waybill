# Implementation Spec: Leg Renames and a Six-Leg Route - Phase 5

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Everything `tests/guide.test.js` does not mechanically couple. That is why this phase lands last, and also why it carries the highest risk of being quietly skipped — which is exactly what the success-criteria critic flagged as a blocker, and why a dedicated grep criterion now guards it.

Waybill describes its own behaviour in prose far outside `src/`. The `next-from-anywhere` learning (2026-09-10) records this pattern directly: a scout on that project found four stale `cd` descriptions in `bookings/*.md` bodies, `commands/*.md`, the README and a test, none of which the spec's File Changes had listed. The rule that learning produced — grep every prose surface for the old behaviour and list every hit — is applied here.

The sweep covers four kinds of surface: the root README, the four files under `docs/guide/`, three sites carrying the deliberately-colliding `fix/specs` branch name, and a live unarchived OpenSpec change that the hidden-dependency critic found still describing the eight-leg route.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **The ride-along's headings and fences moved to phase 4** — rejected: keeping all guide edits together here. Only the narrative, tick strips and paste lines remain in this phase.
- **Name each leg for the work its booking does** — rejected: name each leg for its stamp. The glossary and reference docs must describe the scheme the contract chose, not the rejected one.
- **Accept that three leg ids match their carrier only by namespace** — rejected: renaming the vendored spec commands, which pulls in `src/doctor.js:215-258` and every machine's symlinks. `docs/guide/03-reference.md` should not imply a literal match.
- **Merge `refine` into `contract`, call it `ideate`** — rejected: keep two legs.
- **Collapse the brainstorm leg into `/waybill:new`** — rejected: keep it as leg 1 with `stampCmd: false`. The guide must now explain the brainstorm as an off-route on-ramp, not as leg 1.
- **`/waybill:new` proposes a concrete branch name (Full tier)** — rejected: a placeholder. The inverted `commands/bay.md:91` rule is recorded in `commands/new.md` (phase 2); the guide should not contradict it.
- **The merged `ideate` inherits `handover: transfer`** — rejected: inherit `through`.
- **Ship rename, removal and `new` rework as one change** — rejected: two PRs.
- **Machine-local overlay breakage is a release note, backed by a new doctor test** — rejected: a migration. The release note is written here.
- **Keep the brainstorm as a booking, prove rebookability with a test** — rejected: hardcoding the carrier.
- **Carry the off-route booking as one exported id constant** — rejected: a second booking category.
- **`/waybill:new` keeps `src/waybill.js` untouched** — rejected: a pre-route rendering mode.
- **Every `cmd` check pairs a positive assertion with its negative half** — rejected: bare negated greps.
- **No version number appears in any spec** — per the `bang-line-exit-guard` learning (2026-09-10): main releases independently and release PRs own versioning, so a spec naming a version goes stale. The release note says "the next release PR ships it".

## Feedback Strategy

**Inner-loop command**:

```bash
! grep -rnE '(seven|eight) legs|leg [0-9]+ of [78]|`(refine|specs)`' README.md docs/guide/ openspec/specs/command-surface/spec.md openspec/changes/add-help-card/
```

**Playground**: the grep itself. There is no runtime to exercise — the deliverable is prose, and the check is whether any stale string survives.

**Why this approach**: `guide.test.js` covers the mechanically-coupled half and is already green from phase 4; the grep is the only thing that can see the rest. Bare `contract` is deliberately excluded from the pattern, because it is a legitimate artifact word in this repo (`contract.md`, `contract-data.json`, "exit contract"), and `openspec/changes/archive/` is excluded as a historical record.

## File Changes

### New Files

None.

### Modified Files

| File Path | Changes |
| --- | --- |
| `README.md` | `:3` "eight legs" → six; `:12-14` the sample render; `:47-56` the route table — six rows, stamp column, booking paths — and `:56`'s "Legs 2 and 8" → the new wrapper-owned pair; `:101`; `:156-157`'s `leg 6 of 8 (execute, 4 of 9 tasks)` sample; `:284-296` and `:328-358` reviewed for overlay prose. |
| `docs/guide/01-ride-along.md` | Narrative, tick strips (`:78,91,100,109,117-119,144-145,173-174,204,230,297`) and `/waybill:next feat/thing/refine` paste lines. Headings and fences were done in phase 4. The removed brainstorm section becomes unnumbered prose explaining the off-route on-ramp. |
| `docs/guide/02-glossary.md` | `:32-33` the "Leg" entry, which lists all eight by name; `:39` the "Route" entry, "all eight legs"; `:72`'s `handover` entry reviewed — it describes session boundaries, not human approval, and that distinction still holds. |
| `docs/guide/03-reference.md` | `:62` the `leg:` field's allowed-value list; `:72-81` the worked example, which uses `ideation-refine.md`; `:128-137` the overlay-source section; `:146-147` the prerequisites table mapping leg numbers to plugins. |
| `docs/guide/README.md` | `:13`. |
| `src/cli.js` | `:93`'s doc comment, which uses `fix/specs` to explain that a branch may legitimately carry a leg-shaped suffix. |
| `tests/cli.test.js` | `:448-450`, the `fix/specs` scenario. |
| `openspec/specs/command-surface/spec.md` | `:96` names the refine leg outside the `fix/specs` scenario; `:104-105` the `fix/specs` scenario itself; and the remaining retired-id occurrences. |
| `openspec/changes/add-help-card/design.md` | `:25-27` names retired legs; `:195-198` is a full eight-leg route table. |
| `openspec/changes/add-help-card/specs/help-card/spec.md` | `:82-83`, a requirement scenario pinning `refine`/`contract`/`specs` stamps. |
| `CHANGELOG.md` or the release notes surface this repo uses | The overlay release note (see below). No version number. |

### Deleted Files

None.

## Implementation Details

### The `fix/specs` collision sites

**Pattern to follow**: the existing scenario at `openspec/specs/command-surface/spec.md:104-105`.

**Overview**: `fix/specs` is a branch name chosen precisely because it collides with a leg id, proving `parseTarget` tries the whole string as a branch before splitting off a leg suffix. Once `specs` stops being a leg id, the case tests nothing.

**Key decisions**:

- Re-point at a **surviving** leg id — `fix/specify`, `fix/execute` or `fix/review` — rather than deleting the case. The behaviour it guards is real and still worth a test; only the chosen literal went stale.
- All three sites must move together, or the doc comment at `src/cli.js:93` explains a scenario the test no longer runs.

**Implementation steps**:

1. Pick one surviving id and use it at all three sites.
2. Update `src/cli.js:93`'s comment to name the new literal.
3. Update `tests/cli.test.js:448-450`.
4. Update `openspec/specs/command-surface/spec.md:104-105`.

**Feedback loop**:

- **Playground**: `tests/cli.test.js`.
- **Experiment**: a bay on the re-pointed branch; confirm the argument still resolves as a branch and prints no `RUN:` or `NEXT LEG:`.
- **Check command**: `node --test tests/cli.test.js`

### The live `add-help-card` change

**Overview**: `openspec/changes/add-help-card/` is unarchived and therefore live. It describes the eight-leg route in a design document and pins retired stamps in a requirement scenario.

**Key decisions**:

- Update it rather than archiving it. Archiving is a separate act with its own meaning, and `openspec/changes/archive/**` is explicitly treated as a historical record this change does not touch.
- The requirement scenario at `specs/help-card/spec.md:82-83` pins stamps by leg name; re-point it at the new ids rather than deleting the requirement.

**Implementation steps**:

1. `design.md:25-27` — retired leg names.
2. `design.md:195-198` — rebuild the route table for six rows.
3. `specs/help-card/spec.md:82-83` — re-point the pinned stamps.

**Feedback loop**: none — this is documentation with no runtime. The grep is the check.

### The overlay release note

**Overview**: A machine-local `~/.waybill/bookings` overlay binding `leg: specs` becomes an unknown leg the moment this ships, and `resolveBookings` throws — so every `/waybill:*` command on that machine fails identically until the file is fixed.

**Key decisions**:

- A note, not a migration. The contract rejects building anything: `src/doctor.js:405-429` already catches the throw, degrades it to `warn` so doctor stays runnable, and names the offending file and leg. Phase 3 added the test proving it.
- The note's job is discovery — telling the user that `waybill doctor` is the command that still works and will name the file. It must say so explicitly, because nothing in the failing commands' own error output points there (that gap is recorded as out of scope).
- No version number. Per the `bang-line-exit-guard` learning, say "the next release PR ships it".

**Implementation steps**:

1. Write the note: what breaks, on whose machine, why the repo's own tests cannot catch it, and that `waybill doctor` names the file to fix.
2. Name the two overlay locations: the configured directory (`waybill.bookingsdir` / `WAYBILL_BOOKINGS_DIR`) and a per-bay `.waybill/bookings/`.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/cli.test.js` | The re-pointed `fix/specs` scenario. |
| `tests/guide.test.js` | Already green from phase 4; re-run to confirm the narrative edits did not disturb a heading or fence. |

**Key test cases**:

- The re-pointed branch-shaped-like-a-leg case still resolves as a branch.
- Edge case: editing `01-ride-along.md`'s narrative must not perturb a ` ```waybill ` fence — `guide.test.js` fails byte-exactly if it does.

### Manual Testing

- [ ] Read the README route table against `src/legs.js` and confirm they agree row for row.
- [ ] Read `docs/guide/02-glossary.md`'s "Leg" entry and confirm it lists six.
- [ ] Confirm the release note names `waybill doctor` as the recovery path.
- [ ] Run the phase's grep and confirm it exits 0.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Prose sweep | Phase skipped entirely | No mechanical check covers these surfaces | Every criterion passes while the README still claims eight legs | The dedicated grep criterion, added after the success-criteria critic found this as a blocker |
| Narrative edits | Fence perturbed | Rewriting prose adjacent to a ` ```waybill ` fence and touching its bytes | `guide.test.js` goes red after being green in phase 4 | Re-run `guide.test.js` after the narrative pass |
| `fix/specs` | Partial re-point | Two of three sites updated | The doc comment explains a scenario the test no longer runs; no check catches the mismatch | Steps 1-4 move all three together |
| `add-help-card` | Missed because unarchived | Assuming everything under `openspec/changes/` is historical | A live change document describes a route that no longer exists | Named explicitly; included in the grep's path list |
| Release note | Version number included | Naming a release the change might not land in | The note goes stale, per the `bang-line-exit-guard` learning | Say "the next release PR ships it" |
| Grep pattern | False positive on `contract` | Adding bare `contract` to the pattern | The criterion can never pass — `contract.md`, `contract-data.json` and "exit contract" are all legitimate | Pattern excludes bare `contract` by design |

## Validation Commands

```bash
# Inner loop — the prose sweep
! grep -rnE '(seven|eight) legs|leg [0-9]+ of [78]|`(refine|specs)`' README.md docs/guide/ openspec/specs/command-surface/spec.md openspec/changes/add-help-card/

# Phase gate
node --test tests/
```

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
