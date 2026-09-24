# Implementation Spec: Waybill on the Work Laptop - Phase 5

**Contract**: ./contract.md
**Contract data**: ./contract-data.json
**Estimated Effort**: L

**Phase**: 5 of 7 — "Stock review leg and `/waybill:review`". risk = **high**, blocking = **true**.
**Prereq**: Phase 4 ("De-hardcode the leg count") — every total is already derived from `LEGS`, and
`legIsDone` already has a generic `stampPath`/`stampCmd` fallthrough for legs with no bespoke rule.

---

## Technical Approach

The route gains a stock `review` leg between `execute` and `cleanup`. `bay` stays the anchor and
`cleanup` stays the terminus (last), which is the invariant `tests/legs.test.js` asserts from phase
4 — as `LEGS[1].id === 'bay'`, **array index 1**, 0-based, which is **leg 2** in the 1-based
numbering of `leg N of M` and the guide's `## Leg N` headings. Inserting `review` before `cleanup`
moves neither. The new leg is **booking-owned**: it takes its stamp from a booking, not from
`src/legs.js`, so a machine can rebook it whole (the work overlay in phase 7 replaces it with
`glab` + `/mr-review`) without touching the wrapper.

The hard part is the stamp. A booking's `stampCmd` is judged by exit code alone, and today the code
space has two meanings: `0` is done, anything else is not-done, with the single exception of `127`,
which phase 2 turned into a named warning. That is not enough for a forge probe. On this machine
`glab auth status` returns **401** and an unauthenticated `glab` exits **non-zero, not 127** — so
under the phase-2 rule alone the review leg would read as honestly-not-done forever, with nothing on
screen to say the CLI was answering "I can't" rather than "no MR yet". Waybill's own repository is
on **GitHub** and work GitLab is **self-hosted**, so a `glab`-pinned stamp stalls waybill on itself
and a wrong-host `glab` is a live failure mode, not a hypothetical one.

So phase 5 widens the stamp contract by exactly one reserved exit code. `125` means **"the stamp
could not answer"**; `runStamp` captures the stamp's first line of stdout as the reason and
`evaluateBooking` surfaces it as a warning. 125 is chosen because 1 is what every ordinary failing
command returns, 126 and 127 belong to the shell, and 128+n belongs to signals — while GNU `timeout`
and `env` already use 125 for precisely this meaning: *the harness failed, not the thing it was
asked about*. That gives the three states the contract requires, all through the existing
`{done, warnings}` return shape, with no new plumbing:

| Repository reality | Exit | `done` | Warning |
| --- | --- | --- | --- |
| A forge CLI answered; an open PR/MR exists for this branch | `0` | `true` | — |
| A forge CLI answered; there is no open PR/MR | `1` | `false` | — |
| `gh`/`glab` present but cannot answer (401, wrong host, network) | `125` | `false` | **named** |
| Neither `gh` nor `glab` on `PATH` | `125` | `false` | **named**, different text |

The stamp itself is a single-line POSIX `sh` script in the booking's frontmatter — `src/frontmatter.js`
accepts only flat `key: value` scalars and throws on block scalars, so a single line is the only
option, and it is also the right one: keeping the probe in the booking is what makes the leg
swappable. It tries `gh` then `glab`, uses whichever is **present and usable for this repository**,
and requires neither. Detection order is "first one that answers", not "first one installed": a
machine with both `gh` and a 401 `glab` still stamps correctly on a GitHub repo, which is the bug
this whole design exists to avoid.

`/waybill:review` is the carrier, and it depends on nothing Waybill does not ship. It follows
`commands/cleanup.md` exactly: an exit-guarded `` ! `` line that runs read-only `git` and read-only
forge probes, then a Task section that walks the operator through push → open the request → hand off
for review. Its `allowed-tools` pre-approves the questions and none of the answers — `git push`,
`gh pr create` and `glab mr create` are deliberately absent so each stops for approval. It does
**not** shell out to `src/cli.js`, which keeps `tests/bang-lines.test.js:165`'s pinned list of
CLI-invoking commands unchanged.

---

## Feedback Strategy

**Inner-loop command**: `node --test tests/review.test.js`

**Playground**: the node:test suite, driven through the existing `tests/helpers/repo-fixture.js`
sandbox — `createRepo` for a throwaway repository, `stubBin` for fake `gh`/`glab` binaries,
`withPath` to install them, and `pathWithout` for the neither-installed case.

**Why this approach**: every state this phase adds is a `(PATH, exit code) → (done, warning)` mapping,
which is exactly what a stubbed binary plus a scoped test file measures in under two seconds. The
full suite is ~173s, so it is a gate, not a loop.

**Never** use `--test-name-pattern` in an acceptance check.
`node --test --test-name-pattern 'zzz_no_such_test_zzz' tests/help.test.js` exits **0** — a filter
that matches nothing is vacuously green, so a filtered run proves nothing.

---

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `bookings/waybill-review.md` | The stock `review` booking: `/waybill:review`, and the three-state forge-detecting `stampCmd` |
| `commands/review.md` | `/waybill:review` — detect the forge, push, open the PR/MR, hand off for review |
| `tests/fixtures/review.js` | The `review` scenario fixture: every task ticked, bay on disk, no open request. Required by the `readdirSync(FIXTURES).length === LEGS.length + 1` invariant at `tests/inference.test.js:74` |
| `tests/review.test.js` | The four stamp states, the booking's shape, and the command file's contract |
| `tests/golden/review.txt` | Generated. `renderWaybill` for the review leg — `tests/guide.test.js:147` reads it by leg id |
| `tests/golden/review.md` | Generated. `renderWaybillMarkdown` for the review leg |

### Modified Files

Grouped so the prose sweep is impossible to skim past. Every word-form and digit-form hit below was
measured with the acceptance grep, not assumed.

**Source**

| File Path | Changes |
| --- | --- |
| `src/legs.js` | Append `{ id: 'review', owner: 'booking' }` **between** `execute` and `cleanup`. Rewrite the doc comment at `src/legs.js:17` — it says `"7/7 legs" is a standing invariant`, which is both a stale count and, after phase 4, a stale claim |
| `src/bookings.js` | Export `STAMP_UNKNOWN = 125`. `runStamp` captures stdout (`stdio: ['ignore','pipe','ignore']`, `encoding: 'utf8'`) and returns `{ran, notFound, unknown, status, reason}`. `evaluateBooking` turns `unknown` into a named warning carrying the stamp's own first stdout line |
| `src/cli.js` | `src/cli.js:375` — a doc comment reading `` `feat/x · leg 1 of 7 (ideate)` `` |
| `src/help.js` | **No change.** The `ROUTE` block is generated from `LEGS`, so the row appears for free; the rendered page grows by one row against `MAX_LINES = 45`. See *Key decisions* under the help card and *Shared files with phase 3* |

**Prose — word form ("seven"). These are the `next-from-anywhere` hits: behaviour described outside `src/` that no File Changes table catches. Each is a line item on purpose.**

| File Path | Changes |
| --- | --- |
| `README.md:3` | "A single change moves through **seven legs**, three tool ecosystems…" → eight |
| `docs/guide/01-ride-along.md:6` | "crossed **seven legs**, a handful of sessions…" → eight |
| `docs/guide/01-ride-along.md:271` | "That's the route, rookie. **Seven legs**, every one stamped…" → Eight |
| `docs/guide/README.md:13` | "…from the trunk through **all seven legs** to cleanup" → all eight legs |
| `docs/guide/02-glossary.md:32` | "There are **seven**: `ideate`, `bay`, `refine`, `contract`, `specs`, `execute`, `cleanup`." → eight, with `review` inserted before `cleanup`. **Not in the five known hits — found by re-grepping.** |
| `docs/guide/02-glossary.md:39` | "**all seven legs**, in their fixed order, from `ideate` to `cleanup`." → all eight legs |

**Prose — digit form (`of 7`, `7/7`, leg numbering)**

| File Path | Changes |
| --- | --- |
| `README.md:12`, `README.md:148-149` | Sample output blocks: `leg 5 of 7 (specs)`, `leg 6 of 7 (execute, 4 of 9 tasks)`. Copy the re-blessed goldens rather than hand-editing |
| `README.md:43-53` | *The route* table: new row 7 for `review` (stamped by "an open pull or merge request for this branch, read through `gh` or `glab`", booked to `bookings/waybill-review.md`); `cleanup` becomes row 8. The sentence below it reads "Legs 2 and 7 are wrapper-owned" → **2 and 8**. "Every path glob above — rows 3 to 6" is still correct; `review` has no `stampPath`. Add a sentence: `review` is the one stock leg whose stamp asks something outside the repository |
| `README.md:85` | The list of slash commands an install gives you — add `/waybill:review` |
| `README.md:112-120` | *Commands* table — add a `/waybill:review` row. It is a slash command only: there is no `waybill review` CLI verb, and the table's left column must say so |
| `README.md:240-253` | *Prerequisites* table — `7` becomes `8` in the cleanup row; add a `7` row for `review`: needs `gh` **or** `glab`, neither mandatory, and names what happens with neither. "Leg 7 is the one most likely to be wrong for you anyway" → **Leg 8** |
| `docs/guide/01-ride-along.md` | **New `## Leg 7 · review` section**, and `## Leg 7 · cleanup` renumbered to `## Leg 8 · cleanup`. `tests/guide.test.js:134-143` parses `^## Leg (\d) · ([a-z]+)` and asserts the ids and the numbering match `LEGS` exactly, so this is mechanically enforced. The new section needs a ```` ```waybill ```` fence holding `tests/golden/review.txt` **byte for byte** (`tests/guide.test.js:145-156`). The existing fences at :77, :117, :143, :172, :203, :229 are re-blessed golden copies |
| `docs/guide/03-reference.md:16` | Slash-command table — add `/waybill:review` |
| `docs/guide/03-reference.md:59` | "The leg this booking is for: `ideate`, `bay`, `refine`, `contract`, `specs`, `execute` or `cleanup`" → insert `review` before `cleanup` |
| `docs/guide/03-reference.md:119-120` | Prerequisite rows keyed by leg number: `5 specs, 6 execute` is unchanged; `2 bay, 7 cleanup` → `2 bay, 8 cleanup`; add a `7 review` row naming `gh`/`glab` as optional |

**Tests**

| File Path | Changes |
| --- | --- |
| `tests/commands.test.js` | Add `'review.md'` to `DECLARED` (`tests/commands.test.js:32-43`). `:112` asserts `deepEqual(shipped(COMMANDS), DECLARED)` in both directions, so shipping the file without declaring it fails, and declaring it without shipping it fails |
| `tests/index.js` | `import './review.test.js';` — the entry point that makes `node --test tests/` work on Node 22 and 26 alike |
| `tests/helpers/repo-fixture.js` | `pathWithout(name)` → `pathWithout(...names)` (rest params; every existing single-name call site keeps working). Add `forgePath(answer)` — see *Deterministic goldens* |
| `tests/inference.test.js` | `:59` "is the fixed **seven-leg** model" and its `deepEqual` list; `:84` "binds a waybill to **all seven legs**"; import and exercise `reviewFixture`; resolve every fixture under `forgePath(...)` |
| `tests/waybill.test.js` | Add `['review', reviewFixture]` to the golden `cases` list (`:115-123`) between `execute` and `cleanup`; add `review` to `HAS_BAY` (`:112`); route `resolve` through `forgePath`; `:146` "renders a repository whose **seven legs** are all complete" — wording **and** the fixture, which now needs an open request to reach `complete` |
| `tests/guide.test.js` | `:156` `assert.ok(samples.length >= 7, …)` → `>= LEGS.length`. A literal 7 here silently stops enforcing coverage the moment the route grows |
| `tests/fixtures/cleanup.js` | Delegate to `reviewFixture`. The two fixtures are identical **on disk** — `review` and `cleanup` differ only in forge state, which is off-disk. Say that in the doc comment rather than leaving a reader to wonder why one file re-exports another |
| `tests/golden/*` | All 31 existing files re-blessed, plus the 2 new ones = 33. 22 currently contain `of 7`; `help.txt` gains its `7  review  /waybill:review  …` row. **The regenerated diff must be read line by line — see *Re-blessing the goldens*** |

**Not modified**

| File Path | Why |
| --- | --- |
| `.claude-plugin/plugin.json` | It declares **no** `commands` key by design, and `tests/commands.test.js:476-478` asserts `plugin.commands === undefined`. The manifest-parity check at `:112` reads the `DECLARED` array in `tests/commands.test.js`, not the plugin manifest. Adding a `commands` key here would fail that test **and** silently unregister all four `commands/spec/*.md`, which is measured and recorded in the comment at `tests/commands.test.js:20-31`. The parity deliverable is satisfied by the `DECLARED` edit above |

### Deleted Files

None.

### Shared files with phase 3

Phase 3 (`waybill doctor`, `blocking: false`) touches four of the files above, and each spec was
written as though it were the only one:

- **`src/help.js`** — phase 3 adds a `waybill doctor` row to `OUTRO`'s COMMANDS block; this phase
  edits nothing here but adds a generated `ROUTE` row, so the rendered page grows for both.
- **`tests/golden/help.txt`** — both re-bless it.
- **`docs/guide/03-reference.md`** — phase 3 adds the `/waybill:doctor` rows, this phase the
  `/waybill:review` rows.
- **`tests/commands.test.js`** — phase 3 adds `'doctor.md'` to `DECLARED`, this phase `'review.md'`.

**Land order: phase 3, then phase 5.** Phase 3 is non-blocking and earlier in the sequence, and this
phase carries the larger prose sweep; going the other way means redoing that sweep around doctor's
rows.

This phase therefore normally lands **second**, and re-blesses `tests/golden/help.txt` against the
file as phase 3 left it — not against a pre-doctor baseline. Both rows fit (`MAX_LINES = 45` has room
for two), but the golden diff will show doctor's COMMANDS row already present. That is expected.
Read *Re-blessing the goldens* with that in mind: "gained exactly one line" means one line relative
to whatever the page renders when this phase starts, not an absolute count.

---

## Implementation Details

### 1. The three-state stamp contract

**Pattern to follow**: `src/bookings.js:246-270` (`runStamp`, `stampedByCmd`) and `:299-329`
(`evaluateBooking`).

**Overview**: one reserved exit code turns the stamp's boolean into a tri-state, without adding a
field to `Booking`, a combinator to the stamp language, or a second warning channel.

```js
/**
 * The exit code a `stampCmd` uses to say it could not answer, as distinct from answering "no".
 *
 * 125 rather than 1, because 1 is what every ordinary failing command returns and a stamp that
 * cannot reach its forge is not the same fact as a branch with no request open. Rather than 126 or
 * 127, which the shell owns, and rather than 128+n, which signals own. GNU `timeout` and `env`
 * already use 125 for exactly this meaning: the harness failed, not the thing it was asked about.
 *
 * A stamp exiting 125 may print one line of reason on stdout; it is quoted back in the warning.
 */
export const STAMP_UNKNOWN = 125;

/** @returns {{ran:boolean, notFound:boolean, unknown:boolean, status:number|null, reason:string|null}} */
function runStamp(command, cwd) { /* … */ }
```

**Key decisions**:

- **stdout is captured, where today it is discarded.** `stdio: ['ignore', 'pipe', 'ignore']` with
  `encoding: 'utf8'`. This is what makes the warning *named* instead of generic: the operator reads
  "a forge CLI is installed but could not answer for this repository — check auth and host", not
  "stampCmd exited 125". The cost is real and is recorded under *Failure Modes*: a stamp that floods
  stdout past `maxBuffer` now trips `result.error`, which reads as "could not be executed" where it
  previously read as a plain verdict. No shipped booking does this, and a stamp printing a megabyte
  is a bug worth a warning — but overlay authors who wrote `grep -r …` without `-q` will see it.
- **Only the first line of stdout is quoted**, trimmed, and only when the status is exactly 125.
  Anything else is ignored, so an ordinary chatty stamp cannot inject text into a warning.
- **A stamp's stdout becomes user-visible output, and the spec must say so.** Until this phase a
  `stampCmd`'s streams were discarded, so nothing it printed could surface anywhere. That is no
  longer true: its **first stdout line** is captured and used **verbatim** in a warning printed to
  the operator's terminal — and from there into transcripts, screenshots and pasted issue reports.
  Document it as part of the stamp contract, in `bookings/`'s reference prose and in the
  `STAMP_UNKNOWN` doc comment: **stamp authors must treat stdout as user-visible** and print nothing
  they would not show a bystander — never a token, never a URL carrying one, never the raw output of
  an auth-status command. This applies to overlay authors too; phase 7's overlay is written against
  this rule. Waybill does not redact, and cannot: it cannot tell a reason from a credential.
- **`unknown` sets `ran: false`**, so `stampedByCmd` — the public, warning-less entry point — keeps
  returning `false` with no code change. A stamp that cannot answer is not done. The *distinction*
  lives entirely in the warning, which is where the contract asked for it.
- **The 127 branch keeps whatever wording phase 2 gave it.** Phase 2 made a missing binary name the
  binary; do not re-word it here, and do not let the 125 branch shadow it — an absent binary in an
  overlay's stamp is still a 127, and the two warnings say different things on purpose.

**Implementation steps**:

1. **RED** — in `tests/review.test.js`, assert `evaluateBooking({stampCmd: 'echo nope; exit 125'}, …)`
   returns `{done: false}` with a warning containing `nope`. Run
   `node --test tests/review.test.js` and watch it fail.
2. Add `STAMP_UNKNOWN` and widen `runStamp`'s return shape. **GREEN.**
3. **RED** — assert exit `0` → `{done: true, warnings: []}`, exit `1` → `{done: false, warnings: []}`
   (no warning: "no request open" is honest work remaining, not a fault), and exit `127` → the
   phase-2 not-found warning, unchanged.
4. Wire the `unknown` branch into `evaluateBooking`. **GREEN.**
5. **RED** — assert a 125 that prints nothing still warns, falling back to quoting the command.
   **GREEN.**

**Feedback loop**:

- **Playground**: `tests/review.test.js` with a `describe('the stampCmd exit-code contract')` block
  and one smoke case, written before touching `src/bookings.js`.
- **Experiment**: drive `evaluateBooking` with `exit 0`, `exit 1`, `exit 125`, `echo why; exit 125`,
  `exit 127`, and a command that does not exist — six inputs, six named outputs.
- **Check command**: `node --test tests/review.test.js`

### 2. The stock review booking

**Pattern to follow**: `bookings/waybill-cleanup.md` — a wrapper-shipped carrier, a body that
explains why the stamp behaves as it does, and a closing paragraph pointing at the overlay as the
supported way to replace it.

**Overview**: `bookings/waybill-review.md` binds `review` to `/waybill:review` and carries the
forge-detecting `stampCmd`.

Frontmatter:

```yaml
---
leg: review
command: /waybill:review
model: sonnet
effort: low
handover: through
argument: none
stampCmd: <the one-liner below, on ONE physical line>
---
```

The stamp, **verified end to end against `spawnSync(cmd, {shell: true})` with stubbed binaries**:

```sh
b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null); f=; for c in gh glab; do command -v "$c" >/dev/null 2>&1 || continue; f=1; if [ "$c" = gh ]; then o=$(gh pr list --head "$b" --state open --json number 2>/dev/null) || continue; else o=$(glab mr list --source-branch "$b" --output json 2>/dev/null) || continue; fi; case "$o" in *'"number"'*|*'"iid"'*) exit 0;; esac; exit 1; done; if [ -n "$f" ]; then echo "a forge CLI is installed but could not answer for this repository — check auth and host"; else echo "no forge CLI on PATH: install gh or glab, or rebook the review leg"; fi; exit 125
```

Measured behaviour:

| `PATH` | Exit | stdout |
| --- | --- | --- |
| neither binary | `125` | `no forge CLI on PATH: install gh or glab, or rebook the review leg` |
| `gh` prints `[]` | `1` | — |
| `gh` prints `[{"number":7}]` | `0` | — |
| `gh` and `glab` both exit 1 (the 401 shape) | `125` | `a forge CLI is installed but could not answer…` |
| `gh` exits 127, `glab` prints `[{"iid":3}]` | `0` | — |
| `gh` exits 127, `glab` prints `[]` | `1` | — |

**Key decisions**:

- **Neither CLI is mandatory, and `gh` is tried first.** The order is "first one that *answers*", not
  "first one installed" — `|| continue` on a failing probe falls through to the next. That is what
  lets a machine carrying both a working `gh` and a 401 `glab` stamp correctly on a GitHub
  repository. A `glab`-pinned stamp would stall waybill on waybill's own repo, which is the concrete
  bug this design exists to prevent.
- **No `jq`.** Waybill has zero dependencies and does not get to assume one on the operator's `PATH`.
  `--json number` / `--output json` plus a shell `case` on the field name is the whole parse.
- **The branch is read from git, not from the booking.** `stampCmd` receives no interpolation, so
  `$(git rev-parse --abbrev-ref HEAD)` is the only way to scope the probe to this docket. An unscoped
  probe would stamp the leg from somebody else's open PR.
- **One physical line.** `src/frontmatter.js:85-87` throws on `|` and `>` block scalars by design.
  `stripWrappingQuotes` only strips when the first and last characters are the same quote — this
  value starts with `b` and ends with `5`, so it is safe unquoted.
- **`handover: through`**, matching `cleanup`. Reviewing your own diff is worth doing with the
  context you just built in `execute`, and `model: sonnet` / `effort: low` is what pushing a branch
  and opening a request actually needs. `tests/inference.test.js:91` requires both keys on every
  booking.

The body must say, in prose: that the stamp asks the forge rather than the repository; that it needs
`gh` **or** `glab` and neither is mandatory; what each of the three verdicts means; and that the way
to bind this leg to your own review skill is an overlay under `waybill.bookingsdir`, not an edit to
this file — the same closing move `bookings/waybill-cleanup.md` makes.

### 3. The review leg in `LEGS`

**Pattern to follow**: `src/legs.js:27-35`.

```js
export const LEGS = [
  { id: 'ideate',   owner: 'booking' },
  { id: 'bay',      owner: 'wrapper' },
  { id: 'refine',   owner: 'booking' },
  { id: 'contract', owner: 'booking' },
  { id: 'specs',    owner: 'booking' },
  { id: 'execute',  owner: 'booking', progress: true },
  { id: 'review',   owner: 'booking' },
  { id: 'cleanup',  owner: 'wrapper' },
];
```

**Key decisions**:

- `owner: 'booking'`, not `'wrapper'`. `owner` says who supplies the *stamp*. Review's stamp is a
  booking's `stampCmd`, which is exactly what makes the leg swappable. `bay` and `cleanup` stay
  wrapper-owned because the anchor and the terminus must be relied on.
- No `progress: true`. Review has no checkbox count to be held to.
- No bespoke branch in `legIsDone`. Phase 4 added the generic `stampPath`/`stampCmd` fallthrough
  precisely so this leg needs no code there — if a `if (leg.id === 'review')` appears in
  `src/inference.js`, phase 4 did not land as specified.

**Implementation steps**:

1. **RED** — `node --test tests/legs.test.js` (phase 4's file) already asserts `bay` is the anchor
   and `cleanup` the terminus. Add the review leg and confirm those still pass; if `tests/legs.test.js`
   also pins the id list, update it.
2. **RED** — `node --test tests/inference.test.js` now fails twice: the `deepEqual` leg list at `:59`
   and the fixture count at `:74`. Both are the invariant working.
3. Update the leg list and its wording; create `tests/fixtures/review.js`. **GREEN.**

### 4. `/waybill:review`

**Pattern to follow**: `commands/cleanup.md` — it is the only other command that shells out to plain
git rather than to `src/cli.js`, and its `allowed-tools` comment states the pre-approval rule this
file must follow.

**Overview**: `commands/review.md` gathers the facts in one exit-guarded `` ! `` line, then walks the
session through push → open request → hand off.

Frontmatter:

```yaml
---
description: "Waybill — push the branch and open its pull or merge request for review"
allowed-tools: Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git remote:*), Bash(git log:*), Bash(git status:*), Bash(command:*), Bash(gh repo view:*), Bash(gh pr list:*), Bash(glab repo view:*), Bash(glab mr list:*)
---
```

The `` ! `` line reports, each segment guarded so the whole line exits 0: the current branch; the
default branch; `origin`'s URL; commits not yet pushed (`@{upstream}..HEAD`, with "never been
pushed" as the fallback); `git status --porcelain`; which of `gh`/`glab` are installed and where;
whether each can see this repository; and any request already open for this branch. Every segment
ends in `|| echo "(…)"` so a missing binary or a 401 becomes a readable line rather than a non-zero
exit — **Claude Code discards a command file whose `` ! `` line exits non-zero, and the Task section
then never renders at all** (`tests/bang-lines.test.js:82-84`).

The Task section, in order, stopping at the first step that does not hold:

1. **Uncommitted work?** Show it and stop. A request opened over a dirty tree reviews the wrong thing.
2. **Which forge?** Decide from `origin`'s URL and the probe output, not from which binary happens to
   be installed. If neither CLI can see this repository, say so, name the two remediations
   (`gh auth login`, `glab auth login --hostname <host>`), and offer opening the request in the
   browser instead. Do not guess and do not proceed.
3. **Push.** `git push -u origin <branch>`. Not pre-approved; it stops for approval.
4. **Open the request** — `gh pr create --fill --web` or `glab mr create --fill --web` — unless the
   probe already found one open, in which case say so and skip to 5.
5. **Hand off for review.** Print the request URL and stop. `/waybill:review` opens the request; it
   does not review, approve or merge it. Reviewing is a human's or a reviewer's job, and merging is
   `cleanup`'s.

**Key decisions**:

- **No dependency on anything Waybill does not ship.** This is the whole point of the phase: the
  stock route has to run on a bare machine with no user-supplied review skill. The command names
  `gh`/`glab` because they are the forge CLIs, and names them as *optional*. It must not reference
  `/mr-review`, `/cpr`, `/mar`, or any other personal dotfile command — those belong in the phase-7
  overlay. A stock booking naming a private skill was one of the five collisions the contract
  recorded and resolved.
- **`allowed-tools` pre-approves the questions and none of the answers**, exactly as
  `commands/cleanup.md:12-16` argues. `git push`, `gh pr create` and `glab mr create` reach outside
  this machine; one approval prompt each is the right price.
- **No `model:` or `effort:` frontmatter.** `tests/commands.test.js:202-222` asserts every command
  but `new.md` and `spec/*` declares neither — the booking owns the routing, and a model here would
  silently override it.
- **No `src/cli.js` in the `` ! `` line.** `tests/bang-lines.test.js:165` pins the CLI-invoking set to
  five files. Review does not need the CLI, so that list stays pinned and the guard keeps its teeth.
- **No `waybill review` CLI verb.** Nothing in the contract asks for one, the leg is a conversation
  rather than a computation, and adding a verb would mean a sixth entry in the `bang-lines` list plus
  a `help.js` `COMMANDS` block edit for no gain.

**Implementation steps**:

1. **RED** — add `'review.md'` to `DECLARED` in `tests/commands.test.js`.
   `node --test tests/commands.test.js` now fails on both-directions parity.
2. Write `commands/review.md`. **GREEN** on parity, and on the description, `${CLAUDE_PLUGIN_ROOT}`
   spelling and no-model/no-effort sweeps that run over every declared file.
3. **RED** — in `tests/review.test.js`, extract the `` ! `` line and run it through `bash -c` in a
   `createRepo()` fixture with `pathWithout('gh', 'glab')`; assert status 0 and that stdout names
   both CLIs as missing.
4. Adjust the guards until it exits 0. **GREEN.**

**Feedback loop**:

- **Playground**: the `` ! ``-line runner in `tests/review.test.js`, modelled on
  `tests/bang-lines.test.js:62-69`.
- **Experiment**: run the line in four repositories — no remote; a remote with neither CLI; a stubbed
  `gh` that answers; a stubbed `glab` that exits 1. Every one must exit 0 and print something legible.
- **Check command**: `node --test tests/review.test.js`

### 5. Fixtures, and deterministic goldens

This is the part most likely to be missed, because nothing about it appears in the deliverables list
and everything about it is load-bearing.

Inserting `review` before `cleanup` means **today's `cleanupFixture` no longer resolves to
`cleanup`** — the walk stops at `review`, whose stamp cannot pass in a throwaway repository. So:

- `tests/fixtures/review.js` exports `reviewFixture(branch)` with today's `cleanupFixture` body:
  every task ticked, bay on disk, branch unmerged. That repository's honest position *is* `review`.
- `tests/fixtures/cleanup.js` delegates to it. The two are identical on disk; they differ only in
  forge state, which lives outside the repository. Document that, do not fake a file difference.

Worse, the review stamp would otherwise run **for real** during every golden render, spawning the
developer's own `gh`, reaching the network, and pushing a warning into `state.warnings` — which
`src/waybill.js:303,409` renders into the output the goldens pin. That makes the goldens depend on
whether the developer has `gh` installed. Fix it at the source:

```js
/**
 * A `PATH` the goldens can be rendered against: the real `openspec`, `gh` and `glab` removed, and
 * a stub `gh` that answers `answer` put in their place. Hermetic on purpose — without it a golden
 * is a function of the developer's own installed CLIs.
 *
 * @param {'none'|'open'} [answer]
 * @returns {string}
 */
export function forgePath(answer = 'none') {
  const stub = stubBin('gh', answer === 'open' ? 'echo \'[{"number":7}]\'' : "echo '[]'");
  return [stub, pathWithout('openspec', 'gh', 'glab')].join(path.delimiter);
}
```

Then in `tests/waybill.test.js`:

```js
const resolve = (dir, answer) => withPath(forgePath(answer), () => resolveLeg(dir));
```

Every golden case keeps `'none'`; the `cleanup` case and the "every leg complete" case pass `'open'`.
`tests/inference.test.js` takes the same treatment in place of its bare `pathWithout('openspec')`.

**Key decisions**:

- `pathWithout` becomes variadic. Rest params, so all existing single-name call sites are untouched.
- Stubbing `gh` rather than `glab` for the fixtures is arbitrary but must be *stated*: the four-way
  forge matrix is `tests/review.test.js`'s job, and the goldens only need a stable answer.
- Note the cost: `legIsDone` runs for **every** leg on every `resolveLeg`, so every inference now
  spawns one `/bin/sh` for the review stamp. With `gh`/`glab` off `PATH` the one-liner short-circuits
  on `command -v` in single-digit milliseconds and never touches the network.

### 6. Re-blessing the goldens

```bash
UPDATE_GOLDEN=1 node --test tests/
git diff --stat tests/golden/
git diff tests/golden/
```

31 files today, 33 after (`review.txt`, `review.md`). 22 currently contain `of 7`; `help.txt` gains
a `7  review  /waybill:review  repo state` row.

**Read the regenerated diff line by line. Never accept it blind.** `assertGolden`
(`tests/helpers/repo-fixture.js:241-248`) rewrites the file and then asserts against what it just
wrote, so a re-blessed run is tautologically green — it cannot tell a corrected count from a
regression. Specifically, check that:

- every `leg N of 7` became `leg N of 8` with `N` unchanged for legs 1-6, and `cleanup` moved 7 → 8;
- `review` appears in the `✓`/`▶` line of `cleanup.txt` and nowhere earlier;
- `review.txt` names `/waybill:review`, `sonnet`, `low` and the booking's body;
- `complete.txt` still reports every leg complete rather than stopping at `review`;
- `help.txt` gained exactly one line and no column re-padded (`/waybill:review` is 15 characters,
  shorter than `/ideation:brainstorm`, so widths should not move);
- nothing else changed. A golden that moved for a reason you cannot name is a regression.

Then copy the new `review.txt` verbatim into the ride-along's `## Leg 7 · review` fence
(`tests/guide.test.js:145-156` compares byte for byte) and the re-blessed samples into the other
fences and into `README.md:12,148-149`.

---

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `tests/review.test.js` | The four stamp states; the 125 contract in `evaluateBooking`; the booking's frontmatter; the command file's `` ! `` line |
| `tests/inference.test.js` | The leg list and order; the fixture-count invariant; `review` binds a booking |
| `tests/commands.test.js` | Manifest parity, description, spelling sweep, no model/effort |
| `tests/legs.test.js` | `bay` anchor, `cleanup` terminus (phase 4) |
| `tests/guide.test.js` | Ride-along leg headings, numbering and per-leg golden samples |
| `tests/waybill.test.js` | Golden render for every leg including `review` |

**Key test cases** in `tests/review.test.js`:

- **No MR/PR yet** — `stubBin('gh', "echo '[]'")`: `done === false`, `warnings` empty. The absence of
  a warning is half the assertion: honest work remaining must not shout.
- **MR/PR open** — `stubBin('gh', 'echo \'[{"number":7}]\'')`: `done === true`.
- **401 / wrong host** — `stubBin('glab', 'echo "401 Unauthorized" >&2; exit 1')` with `gh` also
  stubbed to exit 1: `done === false` **and** a warning matching `/could not answer/` and naming the
  booking. This is the case the phase-2 exit-127 warning cannot catch, because an unauthenticated
  `glab` exits non-zero, not 127 — assert that distinction explicitly.
- **Neither CLI present** — `withPath(pathWithout('gh', 'glab'), …)`: `done === false` and a warning
  matching `/no forge CLI/`. Use `pathWithout`, never a hand-built `PATH`: a developer with `gh`
  installed would otherwise turn this into a false positive.
- **Missing binary (127)** — a booking whose `stampCmd` names a binary that does not exist: the
  phase-2 not-found warning, unchanged and *distinct in wording* from the 125 warning.
- **Fallthrough order** — `gh` stubbed to exit 127, `glab` stubbed to report an open MR:
  `done === true`. This is the waybill-on-GitHub / work-on-GitLab case, inverted.
- **Silent 125** — `exit 125` with no stdout: still warns, quoting the command.
- **Booking shape** — `loadBookings(BOOKINGS, {knownLegs})` yields a `review` entry whose `command`
  is `/waybill:review`, with `model`, `effort` and `argument: none` set.
- **Command file** — its `` ! `` line exits 0 in a repository with no remote and no forge CLI, and
  its output names both binaries as absent.

### Integration Tests

| Test File | Coverage |
| --- | --- |
| `tests/waybill.test.js` | `reviewFixture` renders the review waybill; `cleanupFixture` under `forgePath('open')` still renders cleanup |
| `tests/bang-lines.test.js` | The pinned CLI-invoking command list is unchanged by `review.md` |
| `tests/bookings-overlay.test.js` | An overlay binding `review` replaces the stock booking whole |

**Key scenarios**:

- Happy path: a docket with every task ticked and no request open stops at `review`; open a request
  and it advances to `cleanup`.
- Error handling: a 401 `glab` leaves the docket at `review` **with a warning**, not silently.
- Edge case: a docket on a repository with no `origin` at all — `review` is not done, and the
  operator is told which of the two causes it is.

### Manual Testing

- [ ] In this worktree (GitHub, `gh` authenticated): `node bin/waybill next` reports `review` before
      the PR is opened and `cleanup` after — proving the stamp works on waybill's own repo, which a
      `glab`-pinned stamp could never do.
- [ ] With `PATH` stripped of `gh`: the same command reports `review` **and** prints the
      "no forge CLI" warning.
- [ ] With `gh` removed and this machine's 401 `glab` on `PATH`: the warning says "could not answer",
      not "command not found" — the exact failure the phase-2 warning misses.
- [ ] `/waybill:review` in a Claude Code session renders its Task section (i.e. the `` ! `` line
      exited 0) on a branch that has never been pushed.

---

## Error Handling

| Error Scenario | Handling Strategy |
| --- | --- |
| `stampCmd` exits 125 with a reason on stdout | `done: false`, plus `<booking path>: stampCmd could not answer: <first line>` in `warnings` |
| `stampCmd` exits 125 with no output | `done: false`, plus the same warning quoting the command instead of a reason |
| `stampCmd` exits 127 | Unchanged from phase 2: `done: false` plus the not-found warning naming the binary |
| `stampCmd` times out (`STAMP_TIMEOUT_MS`, 10s) or is killed | `status === null` → `ran: false` → the existing "could not be executed" warning. Two sequential network calls can exceed 10s on a slow link; the warning is correct and the operator sees it |
| `stampCmd` floods stdout past `maxBuffer` | `result.error` is set, `status` is `null` → "could not be executed" warning. A behaviour change for overlay authors; see *Rollout* |
| `git rev-parse --abbrev-ref HEAD` fails inside the stamp (detached HEAD) | `$b` is empty; `gh pr list --head ''` lists every open PR, so the stamp could false-positive. Guard it: if `$b` is empty or `HEAD`, `exit 1` before probing |
| `/waybill:review` run with uncommitted changes | The Task's step 1 shows `git status --porcelain` and stops |
| `/waybill:review` run with neither CLI usable | Names both remediations and offers the browser; never guesses, never proceeds |
| `/waybill:review` run on the default branch | There is no docket. Step 1 stops; do not push the trunk |
| A command-file segment exits non-zero | Every segment is `|| echo "(…)"`-guarded so the line exits 0 and the Task still renders |

---

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| review `stampCmd` | **Silent permanent stall** | A forge CLI present but 401 or pointed at the wrong host | The leg reads "not done" forever; the operator re-runs `/waybill:review`, which opens a duplicate request or fails, with nothing explaining why | The 125 contract. This is the failure the whole phase exists for; on this machine `glab auth status` returns 401 today |
| review `stampCmd` | **Wrong-forge stall** | A `glab`-only stamp on a GitHub repository (waybill's own) | The stock route stalls on the repository that ships it | Try both, in order, and require neither |
| review `stampCmd` | **Detached-HEAD false positive** | `git rev-parse --abbrev-ref HEAD` prints `HEAD` | `gh pr list --head HEAD` matches nothing — but an empty `$b` would list *every* open PR and stamp the leg from somebody else's work | Guard on empty/`HEAD` and exit 1 |
| review `stampCmd` | **Draft request counted as open** | `gh pr list --state open` includes drafts | A draft PR stamps the leg and the docket advances to `cleanup` before anyone has reviewed it | Accepted, and named in the booking body. A draft *is* an open request; filtering drafts would need `--json isDraft` and a second parse, and the operator who opened a draft knows they did |
| review `stampCmd` | **Slow forge** | Two sequential API calls against a slow or self-hosted host | 10s `STAMP_TIMEOUT_MS` trips; the leg reads not-done with a "could not be executed" warning | Named, not fixed. Raising the timeout would slow every `waybill next`; the warning is honest |
| review `stampCmd` | **Cost per inference** | `legIsDone` evaluates every leg on every `resolveLeg` | One subprocess, and on a machine with a working `gh` one or two network calls, on every `waybill next`/`status` — including from the fleet view, once per docket | Named. The `command -v` short-circuit makes the no-CLI case free; the fleet case is the one to watch if `waybill status` on the trunk starts feeling slow |
| `runStamp` stdout capture | **Chatty-stamp regression** | An overlay's `stampCmd` prints more than `maxBuffer` | Was a plain verdict, now a "could not be executed" warning | Named in *Rollout*. The fix is `-q` or `>/dev/null` in the stamp |
| `runStamp` stdout capture | **Reason-line injection** | A stamp prints attacker-controlled text and exits 125 | Arbitrary text in a warning line | Accepted: a `stampCmd` is already arbitrary shell the operator configured. Only the first line, trimmed, and only on 125 |
| Golden fixtures | **Blind re-bless** | `UPDATE_GOLDEN=1` rewrites 33 files and then asserts against its own output | A genuine regression ships as a "count update" | The per-file review checklist in §6. This is the single highest-risk step in the phase |
| Golden fixtures | **Developer-dependent goldens** | The review stamp runs the developer's real `gh` | Goldens pass on one machine and fail on another | `forgePath` — stub `gh`, strip the real `gh`/`glab`/`openspec` |
| `/waybill:review` | **Duplicate request** | Run twice on a branch that already has one open | A second PR/MR, or a confusing CLI error | The `` ! `` line reports any open request; the Task skips creation when one exists |
| Ride-along guide | **Golden drift** | A re-blessed `review.txt` not copied into the `## Leg 7 · review` fence | `tests/guide.test.js` fails byte-for-byte — loudly, which is the point | Enforced; listed here so the implementer expects it |
| Prose sweep | **Missed surface** | A "seven"/`of 7` hit outside the six enumerated files | Documentation contradicts the tool, and nothing fails | Re-grep during implementation; the acceptance grep is fail-closed. The glossary `:32` hit was found this way and is *not* in the original five |

---

## Validation Commands

No lint, typecheck, build, CI or `justfile` exists in this repository. Zero dependencies, ESM,
JSDoc types, Node >= 22, `node:test`. The full suite runs in roughly 173 seconds, so the scoped run
is the loop and the full run is the gate.

```bash
# Inner loop — the four stamp cases and the command file, in ~2s
node --test tests/review.test.js

# The fixture-count invariant and the leg list
node --test tests/inference.test.js

# Manifest parity: shipped commands === DECLARED, in both directions
node --test tests/commands.test.js

# Full suite (~173s)
node --test tests/

# Re-bless the goldens, then READ the diff
UPDATE_GOLDEN=1 node --test tests/
git diff tests/golden/

# The prose sweep — fail-closed, must return nothing
grep -rniE 'of 7|7/7|7[- ]legs|seven[- ]legs?|seven-leg' README.md docs/guide/ src/ commands/ bookings/
```

**Acceptance checks**, verbatim:

- `node --test tests/review.test.js` — exits 0, driving all four stamp cases (no MR, MR open,
  401/wrong-host, neither CLI present)
- `node --test tests/inference.test.js` — exits 0 (fixture-count invariant)
- `node --test tests/commands.test.js` — exits 0 (manifest parity)
- `node --test tests/` — exits 0
- `grep -rniE 'of 7|7/7|7[- ]legs|seven[- ]legs?|seven-leg' README.md docs/guide/ src/ commands/ bookings/` — returns no matches

Do **not** add `--test-name-pattern` to any of these. It exits 0 when it filters out every test, so a
filtered check is vacuously green — the contract records this as measured, not assumed.

---

## Rollout Considerations

- **This is a breaking change for existing plugin users.** Every docket shifts from `leg N of 7` to
  `leg N of 8`, and every docket that was sitting at `cleanup` moves back to `review` the moment the
  new plugin version is installed. Nobody's work is lost and no repository state changes — but a
  branch that was one command from being retired now shows an extra leg, and on a machine with no
  `gh` or `glab` it shows a warning with it. Say so in the release notes in those words. The next
  release PR ships it.
- **Ordering is a machine-bricking hazard, and phase 6 exists to handle it.** Slash commands run from
  the plugin cache (`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"`), not from the working tree. Writing an
  overlay that binds `review` against a still-seven-leg installed plugin throws
  ``unknown leg `review` `` (`src/bookings.js:72-73`) and breaks **every** `/waybill:*` command on the
  machine. Do not write the phase-7 overlay until phase 6 has released, published and installed this
  route and confirmed `waybill help` reports eight legs.
- **Behaviour change for overlay authors**: a `stampCmd` that prints heavily now trips `maxBuffer` and
  warns where it previously returned a plain verdict, and `125` is now reserved. Both belong in the
  release notes and in `docs/guide/03-reference.md`'s `stampCmd` description.
- **Feature flag**: none. A conditional route would mean two leg models, two fixture counts and two
  sets of goldens — the cure is worse than the change.
- **Monitoring**: none — Waybill is a local CLI with no telemetry, by design.
- **Rollback**: revert the plugin to the previous version. Nothing in this phase writes to a
  repository, so a downgrade is complete and instant. An operator who has already written an overlay
  binding `review` must remove it *before* downgrading, or every `/waybill:*` command throws
  ``unknown leg``.
- **Stretch, not in this phase**: an `examples/` entry documenting the work overlay as a worked
  carrier swap, alongside `mar-cleanup.md` and `superpowers-execute.md`.

---

## Open Items

- [ ] `src/help.js`'s `stampOf` will label the review row `repo state`, its generic fallback for a
      booking with a `stampCmd` and no `stampPath` — the same label `ideate` carries. It is mildly
      wrong (review reads *forge* state, not repo state). The recommendation is to **leave it**: a
      per-leg literal in `help.js` would be a second place stating a fact the booking already owns,
      which is exactly the drift `tests/commands.test.js:202-222` was written to prevent. Revisit as
      a generic `stampCmd`-aware label in a later pass, not here.
- [ ] Decide whether the ride-along's new `## Leg 7 · review` section shows the no-request state or
      the open-request state. It must match `tests/golden/review.txt` byte for byte, and that golden
      is the *no request yet* render — so the prose has to be written around "the counter is waiting
      on a reviewer", not around a merged request.
- [ ] Confirm `tests/legs.test.js` (phase 4) does not pin the full leg id list. If it does, it is a
      third place stating the route and should assert the anchor/terminus positions only.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
