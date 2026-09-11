# Implementation Spec: Bang-line exit guard

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Claude Code runs each command file's `` !` `` line before rendering the file, and when that line
exits non-zero it reports `Shell command failed for pattern …` and never renders the body — the
`## Task` section is lost (observed with Claude Code 2.1.267,
`openspec/changes/archive/2026-09-10-new-bay-and-fleet/tasks.md` §7.2). The four commands that shell
out to the CLI (`next`, `bay`, `new`, `status`) wrap it in `if [ -f … ]; then node …; else echo …;
fi`, which exits with node's status, so every non-zero CLI outcome — `next` on a trunk with zero or
several dockets, every `bay` error, any command outside a repository — discards the instructions
written for it.

The fix lives entirely in the `!` line: append `2>&1 || echo "waybill: exited $?"` to the `node`
call inside the `then` branch. `2>&1` folds the CLI's stderr into the captured stream, so `bay`'s
usage and `BayError` messages reach the session regardless of how the harness treats stderr on exit
0 (unmeasured). `|| echo …` makes the compound exit 0 whenever node did not, and records node's
code on a final line the Task can key on. The CLI and its exit contract are untouched — terminal
and `--json` callers still see exit 2 — and only comments in `src/cli.js` change, to stop claiming a
rationale the wrapper has made incomplete.

Each of the four `## Task` sections gains one rule for that trailing line, and a new suite,
`tests/bang-lines.test.js`, executes the *real* `!` line from each command file in fixture
repositories — the first test in the repo to do so. It is written first and fails against today's
command files.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Absorb the exit code in the command-file `!` line** — rejected: make `next` exit 0 on its trunk cases. Reopens the spec'd contract (`openspec/specs/command-surface/spec.md`, `README.md:132`) that callers test against, and leaves bay's errors and not-a-repository still dropping the Task.
- **Absorb the exit code in the command-file `!` line** — rejected: a CLI `--session` flag that clamps exit to 0 and routes stderr to stdout. New CLI surface, parsing and per-subcommand tests for what one shell operator already does.
- **`2>&1 || echo "waybill: exited $?"`** — rejected: `|| true`. `true` is not on the commands' restrictive `allowed-tools` list while `echo` is, and echo also tells the session which code the CLI exited with.
- **Wrap all four cli.js `!` lines and add a Task rule to each** — rejected: fix `next` only. `bay` loses its Task on every error and all four lose it outside a repository; the same one-line fix covers them.
- **Acceptance needs both the scripted snippet test and a live-session check** — rejected: scripted test only. The script proves exit 0; only a live session proves Claude Code then renders the Task.
- **Add a success-path check that the marker is absent on exit 0** — rejected: only failure-path snippet checks. An unconditional `; echo "waybill: exited $?"` passes every failure check while printing `exited 0` after every real waybill, which the new Task rule would read as "no waybill".
- **Gate completion on `npm test` plus a non-empty bang-lines suite** — rejected: a TAP ok-line count above the 441 baseline. A dated count passes on any one added ok line.
- **Reword the stdout-only rationale in README, living spec and src comments; guard allows comment-only src diffs** — rejected: leave the stale rationale in place knowingly.

## Feedback Strategy

**Inner-loop command**: `node --test tests/bang-lines.test.js`

**Playground**: Test suite — fixture repositories from `tests/helpers/repo-fixture.js`, each command's real `!` line run through `bash -c`.

**Why this approach**: The change is to shell text that only means something when executed; a test that extracts and runs the literal line is the tightest loop and runs in well under a second per case.

## File Changes

### New Files

| File Path                  | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/bang-lines.test.js` | Extracts each command's real `!` line, substitutes the plugin root, runs it in fixtures. |

### Modified Files

| File Path                                | Changes                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `commands/next.md`                       | Wrapper on the `!` line (:32); Task rule for `waybill: exited N`, deferring to the `SELECT A DOCKET:` exception. |
| `commands/bay.md`                        | Wrapper on the `!` line (:26), after `"$ARGUMENTS"`; Task rule.                                           |
| `commands/new.md`                        | Wrapper on the `!` line (:39); Task rule — no `NEXT:` block means nothing to run.                         |
| `commands/status.md`                     | Wrapper on the `!` line (:29); Task rule.                                                                 |
| `tests/index.js`                         | `import './bang-lines.test.js';` as the first import (`bang` sorts before `bay`).                          |
| `README.md`                              | Reword :143-144 — the stdout-only rationale — and document the wrapper and its marker.                    |
| `openspec/specs/command-surface/spec.md` | Reword the because-clause at :49-50 only; the SHALL stands.                                               |
| `src/cli.js`                             | Comments only, at :115-118 and :283, where they say the `!` invocation captures stdout only.              |

### Deleted Files

None.

## Implementation Details

### 1. `tests/bang-lines.test.js` (write first; must fail on today's command files)

**Pattern to follow**: `tests/commands.test.js:152-181` (walking a command file line by line, skipping HTML comments) and `:366-375` (`spawnSync` + `result.status`); fixtures as in `tests/cli.test.js` (`trunkWith`, ~:165) using `createRepo`, `addWorktree`, `tempRoot`, `cleanupAll` from `tests/helpers/repo-fixture.js`.

**Overview**: Run each command's literal `!` line the way the harness would — root substituted, `$ARGUMENTS` substituted — and assert on the exit status and the combined stdout.

```js
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The command's `!` line, outside HTML comments, with the plugin root and arguments substituted. */
function bangLine(command, { root = ROOT, args = '' } = {}) { /* … */ }

/** @returns {{status: number|null, stdout: string, stderr: string}} */
function runBang(command, cwd, options) {
  return spawnSync('bash', ['-c', bangLine(command, options)], { cwd, encoding: 'utf8' });
}
```

**Key decisions**:

- Substitute exactly what Claude Code rewrites: the literal `${CLAUDE_PLUGIN_ROOT}` (to the repo root) and `$ARGUMENTS` (to the argument string, `''` for none). `"$ARGUMENTS"` with no argument therefore becomes `""` — the case the live probe hit.
- Assert on `stdout` only, plus `stderr === ''` for the stderr-producing cases: the point of `2>&1` is that nothing is left on stderr for the harness to decide about.
- Match the marker as a whole final line, `/^waybill: exited 2$/m`, and assert its *absence* on success paths.
- Build every repository with `createRepo()` (it pins `git init -b main`); non-repo cases use a bare `tempRoot()` directory.

**Implementation steps**:

1. Write the helpers and the cases below; run `node --test tests/bang-lines.test.js` and confirm the failure cases fail on status (2, not 0) and the structural case fails — this is the red step.
2. Add the import to `tests/index.js`.

**Feedback loop**:

- **Playground**: the suite itself.
- **Experiment**: `next` with 0, 1 and 2 dockets; `bay` with `''`; `status`/`new` inside a repo and in a non-repo temp dir; the unset-root `else` branch.
- **Check command**: `node --test tests/bang-lines.test.js`

### 2. The wrapper on four `!` lines

**Overview**: One edit per file, inside the `then` branch only.

```
!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`
```

`bay.md` keeps `"$ARGUMENTS"` quoted, with the wrapper after it: `… bay "$ARGUMENTS" 2>&1 || echo "waybill: exited $?"; else …`.

**Key decisions**:

- Keep `${CLAUDE_PLUGIN_ROOT}` spelled bare — `tests/commands.test.js:175-176` enforces it.
- Leave the `else` branch alone: it already exits 0 (echo).
- Update the HTML comment above each `!` line only if it now misdescribes the line; add one sentence there saying why the wrapper exists (the harness discards a file whose `!` line exits non-zero), since those comments are this repo's place for that rationale.

**Implementation steps**:

1. Edit the four lines. 2. Run the inner loop — failure and success cases go green. 3. Run `node --test tests/commands.test.js` — spelling and frontmatter checks still pass.

### 3. The Task rule in four `## Task` sections

**Overview**: A trailing `waybill: exited N` must be read as "no waybill was issued", never as part of a waybill.

Text to adapt per file (keep each file's voice; one short paragraph):

> If the block ends with a line `waybill: exited N`, the CLI stopped without issuing a waybill and
> that line only records its exit code. Show the block verbatim, as above, and stop — do not run a
> command, and do not improvise the leg.

- `next.md`: place it before the `SELECT A DOCKET:` exception and say that exception still applies — a `SELECT A DOCKET:` block also ends with `waybill: exited 2`, and the literal-string rule wins.
- `new.md`: add that there is then no `NEXT:` block, so there is nothing to run; this sits beside the existing "cannot be resolved — say so in one line" paragraph.
- `bay.md`: there is no `cd` line in that case; relay the error as shown.
- `status.md`: same rule, no additions.

**Implementation steps**: 1. Edit the four Task sections. 2. Check with the contract's Task-anchored criterion (the `awk '/^## Task/…'` loop).

### 4. Rationale rewording (README, living spec, `src/cli.js` comments)

**Overview**: The claim "the `!` invocation captures stdout only" is why the CLI prints its non-zero answers on stdout. Stdout stays right — terminal and `--json` callers read it — but the session no longer depends on it, because the wrapper folds stderr in.

- `README.md:143-144`: keep "Both non-zero cases print to stdout, not stderr"; replace the reason with the terminal/`--json` one, and add two sentences: inside a session the commands run `node … 2>&1 || echo "waybill: exited $?"`, because Claude Code discards a command file whose `!` line exits non-zero; the marker line appears only when the CLI exited non-zero.
- `openspec/specs/command-surface/spec.md:49-50`: reword the because-clause only. Do not touch the SHALL or the scenarios.
- `src/cli.js:115-118`, `:283`: comment text only. The guard criterion fails on any non-comment line.

Trivial text edits — no feedback loop; `grep -q "waybill: exited" README.md` and the guard criterion cover them.

## Testing Requirements

### Unit Tests

| Test File                  | Coverage                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| `tests/bang-lines.test.js` | Every cli.js `!` line: exit status, merged output, marker line. |

**Key test cases**:

- `next`, trunk, 0 dockets → status 0; stdout has `no dockets open`; ends `waybill: exited 2`.
- `next`, trunk, 2 dockets (`addWorktree` ×2) → status 0; `SELECT A DOCKET:`; ends `waybill: exited 2`.
- `next`, trunk, 1 docket → status 0; a waybill (`NEXT:`); **no** marker.
- `bay` with `''` → status 0; stdout has the `bay` arity error and `Usage:`; stderr empty; ends `waybill: exited 2`.
- `status` and `new` in a non-repo temp dir → status 0; `not inside a git repository`; ends `waybill: exited 2`.
- `status` on a clean trunk → status 0; non-empty; **no** marker.
- Unset root (`root` substituted with a non-existent directory) → status 0; the `CLAUDE_PLUGIN_ROOT is unset` message.
- Structural: every declared command whose `!` line invokes `src/cli.js` carries `2>&1 || echo "waybill: exited $?"` — so a fifth command added later cannot ship without it.

### Manual Testing

- [ ] `claude --plugin-dir <this bay>` with the installed `waybill@tinetti` disabled, on a trunk with two dockets: `/waybill:next` loads its Task and offers the docket choice.
- [ ] Same session: `/waybill:bay` with no argument loads its Task; the usage error is relayed and the model stops.
- [ ] Neither shows `Shell command failed for pattern`.
- [ ] Optionally close contract open question `repro-next-trunk-040` first, by running `/waybill:next` on the trunk under the installed 0.4.0 before the switch.

## Error Handling

| Error Scenario                          | Handling Strategy                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| CLI exits 2 (any documented refusal)    | Output shown via `2>&1`; `waybill: exited 2` appended; Task rule: show and stop. |
| CLI throws (malformed booking, exit 1)  | Stack trace shown via `2>&1`; `waybill: exited 1`; same rule. Prettifying is out of scope. |
| Plugin root unresolved                  | Unchanged `else echo …` branch, exit 0.                                            |

## Failure Modes

| Component         | Failure Mode                          | Trigger                                                                  | Impact                                                               | Mitigation                                                                                          |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Wrapper           | Marker on success                     | `;` written instead of `\|\|`                                            | Every real waybill read as "no waybill"                              | Success-path tests (1 docket, clean `status`) assert the marker is absent.                          |
| Wrapper           | `$?` rewritten by the harness         | Claude Code's argument substitution touching `$?` (it rewrites `$ARGUMENTS`, `$N`) | Marker prints a wrong or empty code                                  | Not reproducible offline; the live check reads the marker. `$?` is not `$<digit>`, so expected safe. |
| Wrapper           | Permission refusal on the compound    | `2>&1 \|\|` evaluated against `allowed-tools` (`node`, `test`, `echo`) | `!` line blocked — same symptom as today                             | Both subcommands are allowed; the live check is the proof. Do not add `Bash(true:*)` — not needed.  |
| Wrapper           | Stderr noise on success               | CLI writing to stderr on exit 0 (none today)                             | Extra lines inside a verbatim block                                  | Accept; `2>&1` is deliberate, and today no exit-0 path writes stderr.                                |
| Task rule (next)  | Rule shadows the SELECT exception     | Rule placed so it reads as covering the `SELECT A DOCKET:` block        | Model stops instead of offering the docket choice                    | Rule text names the exception and defers to it; live check exercises exactly this.                  |
| bang-lines suite  | Fixture trunk not recognised          | Host `init.defaultBranch` not main/master/trunk                          | Fixture branch counted as a docket; `next` exits 0; false red        | `createRepo()` pins `git init -b main`.                                                             |
| bang-lines suite  | Extraction picks a commented example  | A `!` line quoted inside an HTML comment                                 | Test runs the wrong text                                             | Skip HTML comments, as `commands.test.js:163-168` does; take the first remaining `` !` `` line.    |

## Validation Commands

```bash
# Inner loop
node --test tests/bang-lines.test.js

# Command-file invariants (spelling, frontmatter, declared set)
node --test tests/commands.test.js

# Full suite (baseline on this bay: 376 pass, 0 fail; ~50s)
npm test

# Contract acceptance — runs every cmd criterion
node /Users/tinetti/.claude/plugins/cache/nicknisi/ideation/0.26.1/scripts/verify.mjs docs/ideation/bang-line-exit-guard/contract-data.json
```

No typecheck, lint or build step exists in this repo.

## Rollout Considerations

- **Feature flag**: none.
- **Release**: ships in the next `chore: release` PR as a patch (0.4.1); operators pick it up with `/plugin update`.
- **Rollback plan**: revert the four `!` lines; the CLI is unchanged, so nothing else depends on them.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
