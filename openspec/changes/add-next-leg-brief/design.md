## Context

See `proposal.md` for motivation. The source is the approved ideation contract at
`docs/ideation/next-leg-brief/` (`contract.md`, `spec-phase-1.md`, `spec-phase-2.md`). That contract
was written against a seven-leg route. Since then #39 cut the route to six legs, and this branch was
fast-forwarded onto it before this proposal was written, so the contract's leg names, file names and
several of its machine checks no longer match the tree. The translation is recorded under
"Deviations from the contract" below; where this document and the contract disagree, this document
is the one to build from.

Constraints that shape the approach:

- `src/waybill.js` is a pure renderer — no filesystem, no subprocess — and golden files pin its
  output. `src/cli.js` gathers the repository facts and passes them in.
- `commands/*.md` act only on literals the renderer exports (`ENTER BAY:`, `RUN:`, `NEXT LEG:`,
  `SELECT A DOCKET:`), one line at a time. Their `allowed-tools` lists are restrictive, and
  `tests/commands.test.js` pins them.
- `src/frontmatter.js` accepts flat single-line scalars only.
- Booking overlays replace a leg's booking whole, and are resolved from the bay, not the trunk.
- The help card has a 45-line budget (`MAX_LINES` in `src/help.js`); it is at 39 today, 40 when the
  bookings fail to load.

## Goals / Non-Goals

**Goals:**

- Keep every path, target and ignore decision in tested Node; the model authors HTML and nothing
  else.
- Leave every leg without a `brief:` key byte-identical, so `tests/golden/next-run.md` does not
  change.
- Make the triggers impossible to get wrong by reading: command files act when `BRIEF:` is present
  and never otherwise.

**Non-Goals:**

- Briefs for `execute`, `review`, `bay`, `cleanup` or the off-route brainstorm. `tasks.md` is
  already execute's brief, and `/spec:apply`'s handling of extra argument text is unverified.
- Markdown briefs, a format setting, or converting HTML to pass it inline.
- Generating a brief at the start of a leg. Disk cannot recover a conversation nobody wrote down.
- Stale-brief detection. An explicit `/waybill:brief` overwrites; the prompt only appears when no
  brief exists.
- Any change to the ideation or OpenSpec plugins.
- Hand-editing `openspec/specs/`. The living specs change when this change is archived.

## Decisions

### 1. Layered context: Waybill's facts always, a model-written brief when one exists

The `RUN:` suffix always carries what Waybill infers (branch, bay, ideation directory, skipped legs,
the following leg) and adds the brief's path when the file exists.

*Rejected:* brief only — a model would restate facts Waybill already knows, and could misstate them.
Facts only — loses the brainstorm at `/clear`, which is the whole problem.

### 2. The brief is an untracked file in the bay, in a directory that ignores itself

`<bay>/.waybill/handoff/<leg>.html`, beside a `.gitignore` containing `*`. Ignored files do not
block `git worktree remove`, so `commands/cleanup.md` needs no change; a test pins that.

*Rejected:* the git common dir — the owner wants the brief visible in the worktree. Committing it on
the branch — it would land in every PR diff and in the diff that stamp inference reads. Editing the
repository's own `.gitignore` — Waybill does not edit the operator's ignore files anywhere else.

### 3. The file is keyed by the leg that reads it

`handoff/ideate.html` is read by `ideate`. Lookup at the start of a leg is then exact.

*Rejected:* keying by the writing leg, which would need "the latest done leg" resolved across skips,
and has no answer at all for the off-route brainstorm.

### 4. The target is `state.leg`, and only when its booking has `brief:`

No walk of the route table. Inference already resolves `state.leg` to the first leg not yet done at
the moment `brief` runs: right after `/waybill:bay` that is `ideate`; after an ideate session that
stamped `contract.md` it is `specify`; if the contract was never written it is still `ideate`, and
the brief written is for `ideate` — which is correct, because that is the session that will run.

*Rejected:* "the next leg after a `/clear`", found by scanning forward for a `transfer` handover.
More code, and wrong whenever an overlay rebooks a handover.

### 5. `src/brief.js` owns where and whether; the renderer only formats

A small module, patterned on `src/bookings.js`:

```js
export const HANDOFF_DIR = path.join('.waybill', 'handoff');
export function briefTarget(state)        // state.leg when state.booking?.brief, else null
export function briefPath(bay, leg)       // <bay>/.waybill/handoff/<leg>.html
export function briefExists(bay, leg)
export function ensureHandoff(bay, leg)   // mkdir -p + `*\n` .gitignore; idempotent; returns path
export function briefContext(bay, state)  // the BriefContext below, or null when no target
```

`src/cli.js` calls `briefContext` at its three markdown call sites (`issueWaybill`, the in-bay
branch of `next`, and `bay --markdown`) and passes the result as `route.context`:

```js
/**
 * @typedef {object} BriefContext
 * @property {string} leg
 * @property {string} path          absolute path of the brief for `leg`
 * @property {boolean} exists
 * @property {string} bay
 * @property {string|null} ideationDir   e.g. docs/ideation/next-leg-brief
 * @property {string[]} skipped
 * @property {string|null} after    the leg that starts after this session
 */
```

`keyedLines` then has two additions and no I/O: with no `route.token`, a context whose `exists` is
false earns `BRIEF: <leg> <path>`; with `route.token === state.leg`, a context appends the suffix to
`RUN:`. A `Route` with no `context` renders exactly as today, which is what keeps the pure-renderer
goldens (`ideate.md`, `specify.md`, `next-run.md`, …) untouched without re-recording them.

`briefContext` is only ever built when there is a bay. The in-bay branch of `next` passes
`inBay(cwd) ? root : null`, so a feature branch in the main checkout gets no `BRIEF:` line.

*Rejected:* having the renderer stat the file. `renderWaybillMarkdown` is pure by design and its
goldens would need a bay on disk.

### 6. `ideationDir` and `after` are derived, not configured

- `ideationDir`: among the docket's changed files (`changed` in the repo state, already computed for
  stamp matching), the directory of the one file matching `docs/ideation/*/contract.md`; `null` when
  there is none or more than one. Reuse the glob matcher `src/bookings.js` uses for `stampPath`
  rather than adding a second one. It is a convenience field: when it is null the field is omitted,
  and nothing else depends on it.
- `after`: the first entry of `LEGS` after `state.leg` that is not in `state.completed`; `null` at
  the end of the route.
- `skipped`: `state.skipped`, as the leg strip already shows it.

*Rejected:* a booking key naming the ideation directory. One more thing to keep in step with
`stampPath`, for a field that is advisory.

### 7. `RUN:` stays one line; fields are joined with ` · `

`commands/next.md` acts on keyed lines one at a time, so a multi-line argument would truncate the
command. The suffix is assembled from single-line values only; the `brief:` guidance is *not* part
of it (it is for the author, and travels on `GUIDANCE:`).

The ``→ runs `…` `` annotation keeps showing the bare command, so the display stays readable.

### 8. `brief:` is one line of free text

Presence marks the leg; the text guides the author. No enum, unlike `argument`, because it is
guidance for a model rather than a lookup key. An empty value is treated as absent.

Stock values:

- `bookings/ideation-ideate.md` — `brief: What the brainstorm settled — the decision and its
  concrete problem, the assumptions, each rejected alternative with its reason, and what is
  explicitly out.`
- `bookings/openspec-specify.md` — `brief: What the contract settled — the approved scope, the
  phase this change covers, the decisions already made, and what is explicitly out.`

*Rejected:* a multi-line block scalar — the frontmatter parser throws on one.

### 9. `waybill brief` resolves like `next`, but never prints a menu

Optional `<branch>`, resolved through `fleet()` and `parseTarget`, because the flagship caller is
the brainstorm session, still standing on the trunk after `/waybill:bay`. Bookings and leg are
resolved from the bay, as `issueWaybill` does, so an overlay is honoured.

Exit codes: 0 for a target and for both `NOTHING TO BRIEF:` answers; 2, on stdout, when no docket
can be resolved. Several dockets with none named is a one-line exit 2 rather than the
`SELECT A DOCKET:` menu: every session caller knows its branch (the `BRIEF:` line and the `RUN:`
line both came from a named docket or a bay), so a menu would be a prompt nobody should reach.

`ensureHandoff` runs only when there is a target, so a bay that never takes a brief never grows the
directory.

### 10. Triggers: a keyed line on display runs, an instruction after run-mode

- **Display run** (`/waybill:next` with no leg token, `/waybill:bay`): the CLI prints `BRIEF:` only
  when a brief is due and unwritten. The command files ask with `AskUserQuestion` *before* showing
  the waybill — after it, the session's parting instruction is "stop", and anything further reads as
  breaking the verbatim rule.
- **Run mode** (`/waybill:next <branch>/<leg>` printing `RUN:`): once the leg's command has finished,
  `next.md` invokes `/waybill:brief <branch>`. No prompt: the operator pasted the handover, and the
  verb answers `NOTHING TO BRIEF:` cheaply when the following leg takes none.

*Rejected:* the display run authoring the brief implicitly; each booking body asking for it — the
owner wants one explicit, nameable step. A printed reminder line — skimmable. A `/waybill:brief`
paste block in the handover — it would run even with nothing to brief.

### 11. `bay.md` gains `Skill` and `SlashCommand`

Its list is `Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion` today. Without the two
invoking tools a "yes" on bay's prompt does nothing, silently, on the one path that carries the
brainstorm. The pinned list in `tests/commands.test.js` and the comment block at the top of `bay.md`
change in the same task. `next.md` already declares everything it needs.

### 12. `commands/brief.md` follows the house bang line, not the sketch in the phase spec

The guarded form `next.md` and `bay.md` use: test `${CLAUDE_PLUGIN_ROOT}/src/cli.js` exists, pass
`"$ARGUMENTS"` only when non-empty, `2>&1 || echo "waybill: exited $?"`. `allowed-tools` is
`Bash(node:*), Bash(test:*), Bash(echo:*), Write`. `tests/bang-lines.test.js` runs the line, and
`brief.md` joins `DECLARED` in `tests/commands.test.js`.

### Deviations from the contract

| Contract | This change | Why |
| --- | --- | --- |
| Brief-taking legs `refine`, `specs` | `ideate`, `specify` | #39 folded `refine` and `contract` into `ideate` and renamed `specs` |
| `bookings/ideation-refine.md`, `openspec-specs.md` | `bookings/ideation-ideate.md`, `openspec-specify.md` | Same |
| Goldens `refine-brief.md`, `refine-no-brief.md`, `specs-brief.md` | `ideate-brief.md`, `ideate-no-brief.md`, `specify-brief.md` | Same |
| "refine continues into contract in the same session" | One leg now; decision 4 is unchanged | Same |
| The ideate leg writes nothing; ideate → bay in one session | The off-route brainstorm writes nothing; `/waybill:new` → `/waybill:bay` in one session | Brainstorm moved off the route |
| Help card "says the four verbs and must be reworded" | No rewording; one COMMANDS row added (39 → 40 lines) | The header no longer counts verbs |
| "Re-record display goldens whose next leg is brief-taking" | None re-recorded except `help.txt` | Pure-renderer goldens pass no `context` (decision 5) |
| Living specs edited by hand in phase 2 | Delta specs here; living specs change at archive | This repo's OpenSpec flow |
| No-brief `RUN:` "prints a no-brief warning line" | `Brief: none written` inside the suffix | A separate line would be a new keyed line for nothing to act on; phase 1 spec already chose this |

Two of the contract's machine checks cannot pass as written and are replaced in `tasks.md`: the
golden-name check (old leg names), and the docs check's `openspec/specs/*` half, which becomes true
only after `/spec:archive`. `scripts/verify.mjs` run against `contract-data.json` will therefore
report those two as failing until the contract is amended or the change is archived.

## Risks / Trade-offs

- [The automatic brief after a run-mode leg is an instruction at the end of a long interactive
  skill, and can be missed] → the `BRIEF:` line reappears on every later display run until a brief
  exists, so the end-of-leg prompt is the backstop.
- [The receiving command ignores the path] → `(read first)` is the only nudge, and ideation's
  intake carries a conclusion only from its own conversation. Confirmed by one manual run (task
  9.3); if it fails, the fix is in the suffix wording, not the mechanism.
- [A model fills empty sections with invention] → `brief.md` forbids it explicitly and says why; a
  missing section is the honest output.
- [A repository commits `.waybill/` wholesale] → the `*` `.gitignore` sits inside `handoff/` and
  wins there; a test asserts a clean `git status`.
- [A brief outlives the conversation it summarised — written for `ideate`, then the operator
  brainstorms again] → out of scope by decision; `/waybill:brief` overwrites on request.
- [`RUN:` suffix text containing ` · ` or a path with spaces] → the session passes the remainder of
  the line whole, so nothing parses the fields; they are for a model to read.
- [`new test file never runs`] → `tests/index.js` imports are explicit; the task that adds
  `tests/brief.test.js` adds the import and greps for it.

## Migration Plan

Additive. No operator action: a booking overlay without `brief:` behaves exactly as before, and a
bay with no `.waybill/handoff/` is the normal state. Rollback is reverting the change; any
`handoff/` directories left behind are ignored by git and disappear with their bays.

## Open Questions

- `command-surface` still opens with "The command surface SHALL consist of exactly four verbs",
  which `doctor` and `help` already contradict and `brief` contradicts further. This change adds
  its own requirement for `brief` and leaves that one alone, as #34 did; reconciling the count is a
  separate, spec-only change.
