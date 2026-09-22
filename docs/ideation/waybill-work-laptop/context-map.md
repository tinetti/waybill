# Context Map: waybill-work-laptop

**Phase**: 1
**Gates**: 5/5 ready
**Verdict**: GO

## Gates

| Gate                 | Status | Evidence                                                                                                                                                                                                                          |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope clarity        | ready  | Zero repository files change; the six machine-level steps and their artifact paths are enumerated concretely at `spec-phase-1.md:64-77` and `:94-288`, each with an exact command and a check command.                            |
| Pattern familiarity  | ready  | The symlink pattern is read and verified at `README.md:332-352` (loop at 346-348); the `model:`/`effort:` frontmatter it protects is verified at `commands/spec/propose.md:1-6`; the plugin invocation pattern at `commands/status.md:33`. |
| Dependency awareness | ready  | No repository consumers exist because no repository file changes; the machine-level consumers are `src/openspec.js:12-19` (spawns the bare `openspec`), the `commands/*.md` bang lines (run `${CLAUDE_PLUGIN_ROOT}/src/cli.js`), and phases 3/6/7 per `contract.md:89-99`. |
| Edge case coverage   | ready  | `spec-phase-1.md:330-346` enumerates twelve failure modes with triggers and mitigations; the one it leaves open (worktree vs main checkout for `npm link` and the symlinks) is flagged at `:391-393` and resolved below.           |
| Test strategy        | ready  | `package.json:14-16` declares exactly one script (`node --test tests/`); no `justfile`, ESLint config, or `tsconfig.json` exists, confirming the spec's "no linter, no typechecker, no build step" claim at `:350-351`; the phase gate is the probe block at `:39-44`. |

## Key Patterns

- `README.md:332-352` — the canonical `/spec:*` symlink instruction. The `ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"` loop is at 346-348; the "copying leaves two files that disagree" rationale is at 351-352 (the spec cites this as `README.md:346-347`, off by five lines — the substance is correct).
- `commands/spec/{explore,propose,apply,archive}.md` — all four exist; `propose.md:3-4` carries `model: opus` / `effort: high`, which is the model routing the symlink exists to keep single-sourced.
- `src/openspec.js:12-19` — `spawnSync('openspec', args)`; `result.error || result.status !== 0` both collapse to `{ ok: false }` at line 18 with no warning. `openspecAvailable()` at `:32-33` calls `--version` only. The spec's citation `12,31-33` points at the spawn and the availability function but not at line 18 where the swallow actually happens; the claim itself is accurate.
- `src/openspec.js:25-27,39-40` — documents that `openspec status --json` exits 1 without a change id, so `--version` exit 0 is the only valid availability proof. Matches the spec's step 3.
- `commands/status.md:33` (also `help.md:24`, `bay.md:42`, `new.md:43`) — slash commands run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"`, confirming the spec's premise at `:20-21` that the installed plugin, not PATH, is what `/waybill:*` executes.
- `package.json:7-10` — `"waybill": "bin/waybill"`, `"wyb": "bin/waybill"`. `bin/` contains only `bin/waybill`; there is no `bin/wyb`. The spec's explanation for why `wyb` does not resolve is exactly right.

## Dependencies

No repository file is modified, so there is no in-repo blast radius. The machine-level dependency chain:

- `openspec` on PATH — consumed by → `src/openspec.js:12` (`spawnSync` of the bare name), which is consumed by legs 5 and 6.
- `~/.claude/commands/spec/*.md` — consumed by → the bare `/spec:propose` and `/spec:apply` the OpenSpec bookings emit (`bookings/openspec-*.md`).
- The installed plugin cache — consumed by → every `commands/*.md` bang line via `${CLAUDE_PLUGIN_ROOT}`.
- This phase as a gate — consumed by → phases 3, 6 and 7 (`contract.md:89-99`); `contract.md:43-44` makes phase 6 assert against `${CLAUDE_PLUGIN_ROOT}/src/cli.js` and `wyb` specifically.

## Machine State Verified

Verified directly by the executing session (these supersede the scout's readings where they differ):

- `~/.claude/plugins/cache/tinetti/waybill/` contains **only** `0.3.1`. Confirmed — step 1 (HUMAN) not yet done.
- `~/.claude/commands/spec/` did not exist before this phase; created with four symlinks into the main checkout.
- `~/.claude/plugins/cache/ideation/ideation/0.15.0/` present.
- **Scout discrepancy, refuted.** The scout reported `~/.claude/commands/mar.md`, `~/.claude/skills/mr-review` and `~/.claude/skills/cpr` all absent, and concluded three rows of the spec's step-6 inventory were wrong. Direct checks show all three are **present**, along with 16 entries under `~/.claude/skills/`. The spec's inventory is correct as written; the scout's reading was not.
- npm global prefix is `/opt/homebrew`, bin `/opt/homebrew/bin`, both user-writable — no `sudo` needed for `npm link` or the global openspec install.
- `/opt/homebrew/bin` is **PATH position 1**; the plugin-cache waybill bin is **position 21**. The `npm link` shadowing failure mode (`spec-phase-1.md:336`) is therefore guaranteed on this machine, not merely possible.

## Conventions

- **Naming**: two deliberately distinct binary names — `waybill` = installed plugin, `wyb` = npm-linked working tree. Do not collapse them.
- **Imports**: ESM (`"type": "module"`), relative paths only, zero runtime and zero dev dependencies (`README.md:362-364`).
- **Error handling**: absent external CLIs are an expected state, never a throw — `src/openspec.js:44` states the contract explicitly.
- **Types**: JSDoc on a plain `.js` codebase; no TypeScript, no `tsconfig.json`.
- **Testing**: `node --test tests/`; 17 suites in `tests/`; golden fixtures re-blessed with `UPDATE_GOLDEN=1` (`README.md:357-359`). Nothing in this phase should touch any of them.
- **Secrets**: `spec-phase-1.md:78-92` matches the global AGENTS.md rule — interactive `glab auth login` only, human-performed, no token on a command line or in a variable.

## Risks

- **This session is in a git worktree.** Steps 2 and 4 both create links whose target is `$PWD`. Both were run against the main checkout `/Users/jtinetti/Projects/tinetti/waybill` instead, resolving Open Item 3 — see `implementation-notes-phase-1.html`.
- **Two steps are HUMAN-only** (step 1 `/plugin` UI commands, step 5 `glab` host + login). An agent must hand back rather than improvise. The phase cannot reach fully-green without the human.
- **Citation drift**: `README.md:346-347` in the failure-mode table should be `351-352`; `src/openspec.js:12,31-33` should include line 18. Harmless for execution, worth correcting if the spec is edited.
- **No automated coverage for any of this.** `node --test tests/` is a regression guard only; the real gate is the probe block, which is a human-read table. Phase 3's `waybill doctor` is the fix, and it is downstream.
