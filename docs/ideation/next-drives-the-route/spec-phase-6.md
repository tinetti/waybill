# Implementation Spec: next drives the route — Phase 6

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Every earlier phase changed what waybill does. This one changes what waybill says about itself, and closes the hole that let the two drift apart.

`docs/ideation/learnings.md` records the pattern from the `next-from-anywhere` project: waybill describes its behaviour in prose across `bookings/*.md` bodies, `commands/*.md`, the README and the help card, and specs' File Changes tables miss them. That project shipped with four stale `cd` descriptions still in the tree. This phase exists as its own phase, rather than as a footnote on phase 3, precisely because the last time it was a footnote it was missed.

The hole is concrete: **no test in this repo reads the repo-root `README.md`.** `tests/guide.test.js:19` defines its `read()` helper against `docs/guide`, so the `README.md` it loads at line 243 is the guide's index, not the root one, and that assertion only checks chapter links. A grep of `tests/` finds no assertion on root-README content at all. The root README is 23KB describing waybill's behaviour in detail, and nothing has ever checked a word of it.

So the sweep is paired with a guard. The guard asserts both directions: the old phrasing is gone _and_ the new verb is present. A negation alone passes for free the moment a phrase is deleted, which would let a README that says nothing about `next` pass a test named "the README is not stale".

## Feedback Strategy

**Inner-loop command**: `node --test tests/guide.test.js`

**Playground**: `tests/guide.test.js`, extended with a root-README reader alongside its existing `docs/guide` one.

**Why this approach**: The sweep's correctness is "does this file say the right thing", which is a string assertion; the risk is missing a file, which a grep pass over the working tree answers faster than any test.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `README.md` | The `next` description, the route table (lines ~43-64), the command list, and any passage describing the paste-relay. `next` acts; `status` carries the waybill; gates and `--autopilot` are introduced. |
| `docs/guide/01-ride-along.md` | The walkthrough drives the route by `next` rather than by pasting. Line 265's "reviewing is a human's or a reviewer's job" stays — it is still true and is now also structural. |
| `docs/guide/02-glossary.md` | `gate` added in phase 1; confirm `waybill`, `handover` and `leg` entries still read true now that `next` acts. |
| `docs/guide/03-reference.md` | Confirm the accumulated edits from phases 1, 2, 4 and 5 read as one document rather than four patches. |
| `docs/guide/README.md` | Chapter summaries, if the chapters' subjects moved. |
| `commands/help.md`, `src/help.js` | The route strip, the verb list, and the one-line description of `next` and `status`. |
| `bookings/waybill-cleanup.md` | Body text describing when cleanup stops for approval, changed by phase 4's pre-flight. |
| `bookings/waybill-review.md` | Body text at line ~37; `review` is now a declared gate, not only a de-facto one. |
| `.claude-plugin/plugin.json`, `commands/*.md` frontmatter | `description:` lines for `next` and `status`, which currently say "where this docket stands, and the waybill for the next leg" and "where this docket stands, or the whole fleet". |
| `tests/guide.test.js` | Add the root-README reader and the two-directional assertion. |

## Implementation Details

### The sweep

**Overview**: Find every surface, then change it.

**Implementation steps**:

1. Grep the working tree for the behaviour that changed, and treat the hit list as the authoritative File Changes table for this phase:

   ```bash
   grep -rniE 'verbatim|hands? off|paste|next session|show.{0,10}stop' \
     README.md docs/ commands/ bookings/ src/help.js .claude-plugin/
   ```

2. Grep for the old division of labour specifically — the phrase pair that phase 2 inverted:

   ```bash
   grep -rn 'status reports' README.md docs/ commands/
   ```

3. Work the hit list file by file. Re-read each passage in full before editing; several of these files argue at length for behaviour that no longer exists, and a one-line patch inside a three-paragraph argument leaves the argument standing.
4. Re-run the grep. A clean second pass is the phase's completion signal.

**Key decisions**:

- Change the prose, not only the examples. `docs/guide/01-ride-along.md` walks an effort end to end; if the narration is updated but the pasted blocks are not, the chapter contradicts itself — and `tests/guide.test.js:145` asserts every waybill sample in the guide byte-matches a leg golden, so stale samples fail loudly. That assertion is an asset here: it means the guide's samples cannot silently rot.
- Keep `commands/next.md:68-69`'s principle sentence. The rule that decisions are keyed on exact strings rather than the model's reading is more important now that `next` acts, not less.
- Do not soften `commands/cleanup.md`'s warnings about destructive steps. Phase 4 pre-approved them under a pre-flight; the prose should say that, not imply cleanup became safe.

**Feedback loop**:

- **Playground**: The grep itself, plus `tests/guide.test.js` and `tests/help.test.js`.
- **Experiment**: Run the two greps before and after. Before, record the hit count per file; after, assert zero hits describing the old behaviour, and spot-check three files by reading them end to end rather than by grepping — the point of this phase is that grep alone missed things last time.
- **Check command**: `node --test tests/guide.test.js tests/help.test.js tests/commands.test.js`

### The root-README guard

**Pattern to follow**: `tests/guide.test.js:19` — the existing `read()` helper, which this extends rather than replaces.

**Overview**: A reader for the repo-root README, and an assertion in both directions.

```js
// tests/guide.test.js
const readRoot = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

it('root README carries the new verb', () => {
  const readme = readRoot('README.md');
  // Positive: the new behaviour is described.
  assert.match(readme, /`\/waybill:next`[^.]*runs|executes|drives/);
  assert.match(readme, /--autopilot/);
  assert.match(readme, /\bgate\b/);
  // Negative: the old behaviour is not.
  assert.doesNotMatch(readme, /next[^.]*hands? (it )?off/i);
});
```

**Key decisions**:

- Both directions, always. A negation-only test is satisfied by deleting the paragraph, which is how a README ends up saying nothing.
- Assert on concepts the README must cover — the new verb, the flag, the word "gate" — rather than on exact sentences. Pinning sentences makes every future wording change a test failure, and this repo edits its prose often.
- One test, not a suite. The guard's job is to make the root README impossible to forget, not to review its writing.

**Implementation steps**:

1. Add the failing test against the current, stale README.
2. Do the sweep.
3. Confirm the test passes for the right reason — temporarily revert one README paragraph and watch it fail.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/guide.test.js` | The root README, plus the existing guide-sample byte-matching |
| `tests/help.test.js` | The help card's route strip and verb list |
| `tests/commands.test.js` | Every command's `description:` frontmatter |

**Key test cases**:

- `root README carries the new verb` — positive and negative assertions both.
- The guide's waybill samples still byte-match their leg goldens (`tests/guide.test.js:145`), now against phase 3's renders.
- Every file in `commands/` is declared and carries a `description` (the existing both-directions walk at `tests/commands.test.js:114`).
- `src/help.js`'s glossary lists `gate`.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| The sweep | A surface is missed | It uses wording the grep did not anticipate | Waybill documents behaviour it no longer has — the exact `learnings.md` pattern | Two greps with different phrasings, plus reading three files end to end |
| The guard | Passes on an empty README | Only the negative assertion is written | The hole stays open under a green test | Positive assertions are required, and the test is verified by reverting a paragraph |
| Guide samples | Byte-match fails after phase 3 | The render changed and the samples did not | `tests/guide.test.js:145` fails the build | Expected; re-bless the samples from the new leg goldens and read each diff |
| Prose edits | An argument survives its premise | A one-line patch inside a longer passage | The file contradicts itself and misleads the next reader | Re-read each passage in full before editing |

## Validation Commands

```bash
# Inner loop
node --test tests/guide.test.js

# Contract criterion 13
node --test --test-name-pattern 'root README carries the new verb' tests/guide.test.js 2>&1 | grep -qE '^# pass [1-9]'

# The sweep's own completion signal
grep -rniE 'verbatim|hands? off|paste|next session|show.{0,10}stop' README.md docs/ commands/ bookings/ src/help.js .claude-plugin/

# Contract criteria 14 and 15
node --test --test-name-pattern 'zero dependencies and no build step' tests/commands.test.js 2>&1 | grep -qE '^# pass [1-9]'
node --test --test-name-pattern 'every shelling command wraps its bang line' tests/bang-lines.test.js 2>&1 | grep -qE '^# pass [1-9]'

# Full suite
node --test tests/
```

## Open Items

- [ ] Rename the two `describe` blocks the contract's criteria grep for — `zero dependencies and no build step` (`tests/commands.test.js:542`) and `every shelling command wraps its bang line` (`tests/bang-lines.test.js:168`) — if their current names differ. The criteria cite names rather than line numbers deliberately, so the names must be stable and must match.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
