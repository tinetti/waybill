## 0. Inner loop

Measured on this tree. Run the scoped suite while iterating; keep `npm test` for section boundaries
only — it is 7x the slowest scoped run and nothing in the inner loop needs it.

| While working on | Run | Time |
| --- | --- | --- |
| §2 the rename | `node --test tests/cli.test.js` | 5.4s |
| §2.1, §2.3 command files and bookings | `node --test tests/commands.test.js` | 0.2s |
| §2.3 the booking literal | `node --test tests/inference.test.js` | 11.9s |
| §3 renderers and goldens | `node --test tests/waybill.test.js` | 2.7s |
| §4 exit contract and dispatch | `node --test tests/cli.test.js` | 5.4s |
| §5 `new` | `node --test tests/cli.test.js` | 5.4s |
| §6 session-facing command files | `node --test tests/commands.test.js` | 0.2s |
| §7 and every section boundary | `npm test` | 36.5s |

Acceptance checks live in `docs/ideation/new-bay-and-fleet/contract-data.json`; run them all with
`node ~/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/new-bay-and-fleet/contract-data.json`.
10 of the 16 command checks fail against the pre-implementation tree by design — that is what makes
them acceptance gates rather than descriptions.

## 1. Enumeration

Already implemented and committed as `24d7ed0` on this branch, ahead of this change being written.
See design.md — "this change is proposed against work already committed".

- [x] 1.1 Move the `git worktree list --porcelain` query into the shared repository module so the bay
  mutation path and the read-only listing use one parser — verified by the existing bay suite passing
  unchanged against the relocated function
- [x] 1.2 Add the fleet module mapping each surviving worktree to a single-docket resolution call,
  with one case per exclusion (main checkout, detached HEAD, default branch, prunable, empty fleet) —
  verified by `tests/fleet.test.js`

## 2. The rename

Moved ahead of rendering and dispatch during the ideation interview. `tests/golden/bay.txt` contains
the literal `/waybill:start`, so leaving the rename until last meant §3 would verify against a golden
this section then rewrites. Renaming first is one mechanical diff against a green suite, and every
section after it is written against final verb names.

- [x] 2.1 Rename `commands/start.md` to `commands/bay.md` and update the declared-command list in the
  commands suite in the same step — verified by the commands suite passing with no `start.md`
- [x] 2.2 Rename the CLI verb from `start` to `bay` with no alias, leaving its argument, collision
  handling and success block unchanged. Touches the dispatch entry (`src/cli.js:204`), the usage line
  (`:17`), the `--bay-dir` help (`:22`), the jsdoc (`:124`), the function (`:136`) and the two error
  strings (`:155`, `:163`), plus `startBay` in `src/bay.js` — verified by the existing start cases at
  `tests/cli.test.js:198-297` passing under the new name and `start` being rejected as unknown
- [x] 2.3 Update `bookings/waybill-bay.md:3` from `/waybill:start` to `/waybill:bay`. That literal is
  pinned by `tests/inference.test.js:146` (`assert.equal(result.booking.command, '/waybill:start')`),
  so **update that assertion in the same step** — verified by the inference suite passing. Editing
  `tests/inference.test.js` does **not** breach the boundary: the guardrail is on `src/inference.js`,
  not on its suite. Do not stop on this.
- [x] 2.4 Update the README route and command tables to name `bay` — verified by the commands suite's
  vendored-routing assertion
- [x] 2.5 Regenerate `tests/golden/bay.txt`, and update the text-only mentions of the old verb at
  `commands/status.md:19` and `src/bay.js:209` — verified by the waybill suite
- [x] 2.6 **Do not** correct the stale `/waybill:start` comment at `src/inference.js:113`. It is left
  deliberately: the zero-diff criterion on that file is the check on the whole approach, and an
  implementer who "fixes" the comment has done exactly what the boundary exists to catch. The next
  change that legitimately opens that module fixes it.

## 3. Rendering

- [x] 3.1 Write golden files `fleet.txt`, `select.txt`, `trunk-one-docket.txt` and `fleet-empty.txt`
  matching the blocks in the approved design §4, and wire each into `tests/waybill.test.js`, which
  resolves goldens by name — verified by them existing, being non-empty, and being referenced by the
  waybill suite before any renderer is written. (`fleet-empty.txt`, not `no-dockets.txt`: the latter
  is one character from the existing `no-docket.txt`, which is the leg-1 waybill and means something
  entirely different.)
- [x] 3.2 Add the fleet and selection renderers beside the existing ones. They consume
  `fleet(cwd, bookings)` from `src/fleet.js` and `listWorktrees`/`defaultBranch` from `src/repo.js`,
  both already committed in `24d7ed0` — read them, do not rebuild them. Share the existing findings
  helper rather than building new blocks, but note `withFindings(sections, state, inspection)`
  (`src/waybill.js:151`) is typed to **one** `Inference` plus an `Inspection`, while the fleet has N
  states and no per-tree inspection: widen its parameters to accept a plain warnings list rather than
  fabricating a synthetic `Inference` to reach the `WARNINGS:` block — verified by the four new
  goldens passing
- [x] 3.3 Move the `cd` block currently built inline at `src/cli.js:193` into a shared helper, so
  trunk-resolved `next` and `bay` cannot print different shapes of the same instruction. The helper
  covers the `cd <path>` line and its already-inside suppression **only**, not the surrounding block:
  `specs/command-surface/spec.md:30-31` freezes `bay`'s success block, while design §4 gives trunk
  `next` an `IN BAY:` section — verified by `tests/cli.test.js:236`, which asserts `/^ {2}cd /m` and
  `already inside`. **Not** by `tests/golden/bay.txt`: that is a `renderWaybill` golden
  (`tests/waybill.test.js:82`) and cannot detect this helper regressing at all.

## 4. The exit contract and trunk dispatch

- [ ] 4.1 Write the exit-contract sweep in the CLI suite first: `next` exits 0 iff exactly one
  waybill was issued, across zero, one, and three dockets — verified by the new cases failing before
  implementation. **Constraint:** `tests/inference.test.js:70-73` asserts
  `readdirSync(tests/fixtures/).length === LEGS.length + 1`, so any new fixture *file* breaks it —
  build multi-docket repositories through `tests/helpers/repo-fixture.js` (the route
  `tests/fleet.test.js` already uses), or update that count in this same task.
- [ ] 4.2 Implement trunk dispatch for `next`: one docket issues its waybill and exits 0; zero
  dockets points at `new` and exits 2; many dockets print the selection block and exit 2, all on
  stdout — verified by 4.1 passing
- [ ] 4.3 Add the optional positional branch to `next`, resolving that branch's bay from anywhere and
  erroring when it has none — verified by hitting and missing cases in the CLI suite
- [ ] 4.4 Make `status` on the trunk render the fleet, exit 0, and attribute each docket's warnings to
  its own branch; keep it option-free — verified by `fleet.txt` and `fleet-empty.txt`
- [ ] 4.5 Confirm `next --json` still emits an object in every case, including both non-zero ones, and
  keeps its per-docket `dockets` array — verified by a CLI case asserting the ambiguous-case shape.
  The array stays: `src/cli.js:97` and `README.md:124-125` keep `status` option-free *because*
  `next --json` already carries the fleet shape.
- [ ] 4.6 Update `README.md:95-107`, whose command table and prose ("the docket is the branch", "all
  three commands say so and stop") this section makes false — verified by review

## 5. `new`

- [ ] 5.1 Add the CLI `new` verb printing leg 1's waybill and stopping, and re-point the existing
  `tests/golden/no-docket.txt` fixture at it — verified by that golden passing **unchanged**; a diff
  there means the ideate waybill was altered by accident. That golden is compared at
  `tests/waybill.test.js:118` (renderer level, not the CLI suite), and `tests/waybill.test.js:121-129`
  additionally pins `no-docket.txt` and `ideate.txt` as byte-identical on purpose — the re-point must
  disturb neither.
- [ ] 5.2 Add `commands/new.md` declaring the model and effort its booking names, and invoking the
  command the waybill names after showing the block — verified by the commands suite seeing the new
  declared command
- [ ] 5.3 Pin `commands/new.md`'s model and effort against `bookings/ideation-ideate.md` — verified by
  a test that fails when the booking is rebooked to a different model
- [ ] 5.4 Warn, and proceed, when `new` is invoked from inside a bay — verified by a CLI case
  asserting the warning and a zero exit
- [ ] 5.5 Handle the case where the command `new` names cannot be resolved: say so and leave the
  waybill on screen as the instruction — verified by the instruction being stated in `commands/new.md`
- [ ] 5.6 Add the fourth verb to the README command table — verified by review

## 6. The session-facing branch

- [ ] 6.1 Add the selection branch to `commands/next.md`, keyed on the exact `SELECT A DOCKET:`
  literal with verbatim as the default — verified by the commands suite asserting both the literal and
  the surviving verbatim rule. That literal appears nowhere in `src/` or `commands/` today, so a
  positive grep for it is a real, currently-failing anchor.
- [ ] 6.2 Add `AskUserQuestion` to `commands/next.md`'s `allowed-tools` **line**, since the list is
  restrictive and an undeclared prompt is silently unavailable — verified by the commands suite
  asserting the entry. The acceptance check anchors on `^allowed-tools:`, so an explanatory comment
  naming the tool will not satisfy it.
- [ ] 6.3 Update `commands/status.md` for the trunk fleet view — verified by the commands suite

## 7. Verification

- [ ] 7.1 Run the full suite and confirm every pre-existing golden file covering the in-a-bay path
  passes **unchanged** — this is the cheapest available proof the trunk/bay dispatch did not disturb
  the path that already worked
- [ ] 7.2 Determine whether stderr is captured by the session's `` ! `` invocation and record the
  finding in the change. No command in this repository can answer this: it depends on a live session.
  Procedure — run a waybill command from a non-git directory inside a session via the `` ! ``
  invocation and record whether `repoRoot`'s `is not inside a git repository` text reaches the
  transcript. If it does not, that pre-existing error is already invisible in every session. Record
  it; do **not** fold the fix into this change — an acceptance check asserts that error literal does
  not appear in this branch's `src/cli.js` diff.
