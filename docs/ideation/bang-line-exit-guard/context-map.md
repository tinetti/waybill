# Context Map: bang-line-exit-guard

**Phase**: single spec (`spec.md`)
**Gates**: 5/5 ready
**Verdict**: GO

## Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | 1 new file (`tests/bang-lines.test.js`), 8 modified files with concrete changes; `!` lines confirmed at next.md:32, bay.md:26, new.md:39, status.md:29; rationale text confirmed at README.md:143-144, spec.md:49-50, cli.js:115-118 / :282-283. |
| Pattern familiarity | ready | commands.test.js:152-181 (comment-skipping walk), :366-375 (spawnSync); cli.test.js:165-168 (`trunkWith`); repo-fixture.js in full. |
| Dependency awareness | ready | No code imports command files; consumers are commands.test.js (spelling :152-181, `SELECT A DOCKET:` include :238-244, frontmatter), waybill.test.js:238, Claude Code. |
| Edge case coverage | ready | stderr paths, `bay ""`, non-repo, unset root, marker absent on success, Task-rule precedence. |
| Test strategy | ready | `node --test tests/bang-lines.test.js` → `node --test tests/commands.test.js` → `npm test` → contract `verify.mjs` (guard needs `/usr/bin/git`). |

## Key Patterns

- `tests/commands.test.js:166-179` — HTML-comment tracking by line (`<!--` opens, `-->` closes, inclusive); reuse to extract first non-comment line starting with `` !` ``.
- `tests/commands.test.js:16` — `ROOT` from `import.meta.url`; suites import `after, describe, it` from `node:test`, `assert` from `node:assert/strict`, `after(cleanupAll)`.
- `tests/commands.test.js:32-42` — `DECLARED` not exported; walk `commands/` recursively (like `shipped()` :53-62), keep files whose `!` line contains `src/cli.js`, assert the set is exactly `{bay,new,next,status}.md`.
- `tests/cli.test.js:165-168` — `trunkWith(...branches)`; copy locally.
- `tests/helpers/repo-fixture.js` — import sets `GIT_CONFIG_GLOBAL/SYSTEM=/dev/null`, deletes `WAYBILL_BAY_DIR` (:13-15); `tempRoot()` realpath'd (:52); `createRepo()` pins `-b main` + commits (:69-93); `addWorktree` uses `resolveBayPath` (:120-125).

## Dependencies

- `commands/{next,bay,new,status}.md` — bare `${CLAUDE_PLUGIN_ROOT}` enforced (commands.test.js:175-176); next.md must keep `SELECT A DOCKET:` and `**verbatim**` (:238-244).
- `src/cli.js` comments only; `tests/cli.test.js` must be diff-free.
- `tests/index.js` — add `import './bang-lines.test.js';` before `./bay.test.js`.

## Conventions

- ESM, 2-space, single quotes, JSDoc on helpers, why-comments; test names are sentences.
- CLI streams: stderr+exit 2 for not-a-repo (cli.js:54-56), bay arity (:384-386), `BayError` (:400), unknown option; stdout+exit 2 for `no dockets open` (:207), `SELECT A DOCKET:` (:215-216); uncaught throw exit 1.

## Risks

- Branch forked at b5fe3bf; main already released 0.4.1 — spec's "0.4.1" rollout note is stale (0.4.2).
- `tests/cli.test.js:188` repeats the stdout-only rationale but the guard forbids touching it — mention in PR.
- `bash -c` resolves `node` from PATH; pin `path.dirname(process.execPath)` first.
- Use `split().join()` for substitution, not `String.replace` with a string.
- cli.js:471 main-module check needs a non-symlinked ROOT (confirmed).
- Marker regex needs `m` flag; assert `stderr === ''` for stderr-producing cases.
- next.md rule must precede the `SELECT A DOCKET:` exception and defer to it.
- bay.md HTML comment line 17 already understates `allowed-tools` — note, don't fix.
- Permission acceptance of `2>&1 ||` and `$?` substitution only provable live.
- cleanup.md out of scope (already `|| echo`); no `commands/spec/*.md` has a `!` line.
