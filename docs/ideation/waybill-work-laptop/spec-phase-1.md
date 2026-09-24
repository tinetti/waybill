# Implementation Spec: Waybill on the Work Laptop - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: S
**Kind**: gate — risk `low`, blocking `true`
**Type**: runbook, not code. No `src/` changes. No repository files are modified by this phase.

## Technical Approach

This phase brings one machine up to a known-good baseline so every later phase can trust what it
observes here. Nothing is built; five setup steps are performed and one already-satisfied inventory
is recorded. It is a gate because phases 3 and 6 verify themselves against this machine, and a
machine that silently degrades (an `openspec` that is absent, a `/spec:propose` that cannot resolve,
a `glab` pointed at the wrong host) produces confident green results that mean nothing.

The organising fact is that **Claude Code puts an installed plugin's `bin/` directory on PATH**.
That is why `waybill` resolves today to `~/.claude/plugins/cache/tinetti/waybill/0.3.1/bin/waybill`
— a git checkout at rev `08d0c6f`, five minor releases behind the 0.8.0 working tree — and it is why
the fix is not "add the working tree to PATH". The two names are deliberately given two different
jobs: `waybill` stays the *installed plugin* binary (what `/waybill:*` commands actually execute,
since they run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"`), and `wyb` becomes the *working tree*
binary via `npm link`. `wyb` is absent today for a mundane reason: there is no `bin/wyb` file, only a
`"wyb": "bin/waybill"` alias in `package.json`, and an alias only becomes a real shim when something
links or installs the package. Keeping the two names distinct means later phases can say which build
they mean instead of hoping PATH agrees.

Three of the five steps are ordinary shell commands an agent can run and verify. Two are not, and the
spec marks them as **HUMAN** and stops there: `/plugin marketplace update` and `/plugin install` are
Claude Code UI commands with no CLI equivalent an agent can invoke, and `glab auth login` is an
interactive credential flow. Credential handling is the hard constraint on this phase — see
[Security Constraints](#security-constraints). The phase is done when the verification one-liner in
[Feedback Strategy](#feedback-strategy) reports every line green and the
[Manual Testing](#manual-testing) checklist is fully ticked.

## Feedback Strategy

**Inner-loop command**: paste this whole block as one command; it re-runs every probe in seconds.

```bash
for c in waybill wyb openspec node git gh glab jq tmux; do \
  printf '%-10s %s\n' "$c" "$(command -v "$c" 2>/dev/null || echo '** MISSING **')"; done; \
ls ~/.claude/commands/spec/ 2>/dev/null || echo '** MISSING ~/.claude/commands/spec/ **'; \
glab auth status 2>&1 | tail -4
```

**Playground**: the CLI itself. There is no server, no test harness and no browser in this phase —
the shell is the environment, and `command -v` / `ls` / `glab auth status` are the assertions.

**Why this approach**: every deliverable here is "a binary or a path that either resolves or does
not", so re-running the original probe set is both the tightest loop available and the literal
definition of done.

Read the output against these expectations:

| Probe             | Expected after this phase                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| `waybill`         | a path **inside** `~/.claude/plugins/cache/tinetti/waybill/<new-version>/`   |
| `wyb`             | a path **outside** `~/.claude/plugins/cache` (the npm global bin)            |
| `openspec`        | any resolving path                                                            |
| `~/.claude/commands/spec/` | four entries: `explore.md propose.md apply.md archive.md`            |
| `glab auth status`| authenticated against the **self-hosted work host**, not `gitlab.com`        |
| node/git/gh/jq/tmux | already resolving — confirm unchanged, take no action                       |

## File Changes

No file in this repository is created, modified or deleted by this phase. The artifacts are all
outside the repo, on the machine:

| Machine path                                          | Action                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `~/.claude/plugins/cache/tinetti/waybill/<version>/`  | new version directory installed; `0.3.1` ceases to be the resolved one |
| `<npm global bin>/wyb`, `<npm global bin>/waybill`    | created by `npm link` from the working tree                            |
| `<npm global lib>/node_modules/waybill`               | symlink to the working tree, created by `npm link`                     |
| `<npm global bin>/openspec`                           | created by the global install of `@fission-ai/openspec`                |
| `~/.claude/commands/spec/{explore,propose,apply,archive}.md` | four symlinks into the **working tree**, directory created if absent |
| `~/.config/glab-cli/config.yml` (glab's own config)   | host set, and credentials written **by glab itself** during interactive login |

## Security Constraints

These bind every step below and every person or agent executing them.

- **Never print, echo, log, paste into a file, or store in a shell variable any token, password or
  credential value.** Not in a command, not in output, not in a note, not in a commit.
- Do **not** use `glab auth login --token`, `--stdin` fed from a literal, `GITLAB_TOKEN=<value> …`,
  or any form that puts a secret on a command line — command lines are visible in the process table
  and in shell history.
- The only sanctioned credential path is the **interactive** `glab auth login` flow, run by the
  human, which reads the token at a hidden prompt and hands it to glab's own credential storage.
- Reading an existing credential in order to use it is fine. Writing, rotating or relocating one is
  the human's action, always.
- `glab auth status` is safe to run and safe to show: it reports host and validity, and redacts the
  token. It is the only credential-adjacent command in the inner loop for exactly that reason.

## Implementation Details

### 1. Update the installed plugin off 0.3.1 — **HUMAN**

**Overview**: replace the stale `0.3.1` plugin cache so the `waybill` on PATH, and therefore every
`/waybill:*` slash command, runs a current build.

**Why an agent cannot do this**: `/plugin marketplace update` and `/plugin install` are Claude Code
UI commands. They are not shell commands, there is no CLI equivalent to shell out to, and hand-
editing the plugin cache directory would leave Claude Code's own bookkeeping inconsistent.

**Steps** (the human types these into Claude Code, not into a terminal):

1. `/plugin marketplace update tinetti`
2. `/plugin install waybill@tinetti`
3. Restart or reload Claude Code if it does not pick the new version up on its own.
4. Verify from a terminal: `command -v waybill` prints a path under
   `~/.claude/plugins/cache/tinetti/waybill/<version>/bin/waybill` with a `<version>` that is **not**
   `0.3.1`.

**Key decisions**:

- The installed plugin stays the owner of the `waybill` name. Do not try to make the working tree win
  that name — phase 6 needs to be able to ask "what does the *installed* plugin report?" and get an
  honest answer.
- This phase does **not** require the installed version to be 0.8.0. Whatever the marketplace
  currently publishes is acceptable; the eight-leg route is installed in phase 6, which is a separate
  gate for that reason. Record the version actually installed so phase 6 can tell it apart from its
  own.

**Feedback loop**

- **Playground**: the terminal, after the UI commands.
- **Experiment**: `command -v waybill` and `ls ~/.claude/plugins/cache/tinetti/waybill/` — confirm the
  new version directory exists and the resolved binary sits inside it.
- **Check command**: `command -v waybill`

### 2. `npm link` the working tree so `wyb` resolves — agent

**Overview**: `package.json` declares `"wyb": "bin/waybill"` but ships no `bin/wyb` file, so `wyb`
only exists once npm creates the shim. `npm link` from the repo root creates it and points it at the
working tree, giving a stable name for "the code I am editing" that is immune to plugin-cache skew.

**Steps**:

1. From the repository root (the worktree is fine — but prefer the main checkout, since a worktree
   can be removed out from under the link; see Failure Modes): `npm link`
2. Verify: `command -v wyb` prints a path **outside** `~/.claude/plugins/cache`.
3. Verify it is the working tree and not a copy: `node -e "console.log(require('fs').realpathSync(require('child_process').execSync('command -v wyb').toString().trim()))"`
   — or simply `ls -l "$(command -v wyb)"` and read the symlink target.
4. Re-check `command -v waybill`. `npm link` also creates a `waybill` shim. Whichever of the npm
   global bin or the plugin cache bin comes first on PATH wins. The plugin cache winning is the
   desired outcome; if the npm shim wins instead, that is a Failure Mode below, not a success.

**Key decisions**:

- `npm link`, not `npm install -g .`. A link tracks the working tree live; a global install snapshots
  it and reintroduces exactly the staleness this phase exists to remove.
- No attempt is made to reorder PATH. PATH ordering under Claude Code is not ours to own, and the two
  distinct names make ordering irrelevant to correctness.

**Feedback loop**

- **Playground**: the shell.
- **Experiment**: run `wyb help` and `waybill help` and compare. On this machine before phase 6 they
  should *differ* (working tree ahead of the installed plugin); note the difference rather than
  treating it as a fault.
- **Check command**: `command -v wyb`

### 3. Install `openspec` — agent

**Overview**: `@fission-ai/openspec` is not installed. `src/openspec.js:12,31-33` spawns `openspec`
and treats *any* spawn error or non-zero exit as "unavailable", returning `{ ok: false }` with no
warning. Legs 5 and 6 then fall back to parsing `tasks.md` and say nothing about it — a silent
degradation, which is the whole reason this is a gate.

**Steps**:

1. `npm install -g @fission-ai/openspec` (latest stable).
2. Verify: `openspec --version` exits 0. This is the exact call `openspecAvailable()` makes, so it is
   the authoritative check — note that `openspec status --json` is **not**, because it exits 1
   without a change id (documented at `src/openspec.js:33-40`).

**Key decisions**:

- Global install, not a project dependency. `src/openspec.js` spawns the bare name `openspec` and
  resolves it through PATH; a devDependency would only work under `npm exec`.
- No `openspec init` here. Initialising the work repo belongs to phase 7, along with the decision
  about whether `openspec/` and `.claude/commands/opsx/` are committed or excluded there.

**Feedback loop**

- **Playground**: the CLI.
- **Experiment**: `openspec --version; echo "exit=$?"` — the exit code is what the code branches on,
  so assert on it, not on the printed string.
- **Check command**: `openspec --version`

### 4. Symlink the `/spec:*` commands into `~/.claude/commands/spec/` — agent

**Overview**: `~/.claude/commands/spec/` does not exist on this machine, so the bare `/spec:propose`
and `/spec:apply` that legs 5 and 6 emit cannot resolve. `README.md:335-347` documents the fix and is
explicit that **this step is not optional if you use the OpenSpec legs as shipped**, and that
symlinking (not copying) is required: the `model:`/`effort:` frontmatter in those files *is* the model
routing, and two copies that drift leave nothing to tell you which one won.

**Steps**:

1. `mkdir -p "$HOME/.claude/commands/spec"`
2. From the repository root:
   ```bash
   for f in explore propose apply archive; do
     ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"
   done
   ```
3. Verify all four exist **and** point at the working tree, not at the plugin cache:
   ```bash
   ls -l ~/.claude/commands/spec/
   readlink ~/.claude/commands/spec/*.md | grep -c 'plugins/cache'   # must print 0
   ```

**Key decisions**:

- `$PWD` must be the repository root when the loop runs, and it must be a checkout you intend to
  keep. Running it from `.claude/worktrees/...` produces four symlinks that dangle the moment the
  worktree is removed. Prefer the main checkout for this step specifically.
- Four symlinks, not a single symlinked `spec/` directory. The plugin also ships these files as
  `/waybill:spec:*`; per-file links keep one source of truth serving both names, which is what the
  README describes and what `~/.claude/commands/mar.md` already does.

**Feedback loop**

- **Playground**: the filesystem, then Claude Code.
- **Experiment**: `ls -l ~/.claude/commands/spec/` — confirm four entries, all arrows, all pointing
  outside `plugins/cache`. Then in Claude Code, type `/spec:` and confirm four completions appear.
- **Check command**: `ls ~/.claude/commands/spec/`

### 5. Point `glab` at the self-hosted work host and authenticate — **HUMAN**

**Overview**: `glab` is installed, but `glab auth status` returns **401 against gitlab.com** while
work runs on a **self-hosted** GitLab. Two separate things are wrong — the host and the credential —
and fixing only one leaves the CLI just as useless.

**Why a human does this**: `glab auth login` is an interactive credential flow. Per
[Security Constraints](#security-constraints), no agent supplies the token and no token value is
typed on a command line.

**Steps**:

1. **Host, first.** Either set it persistently:
   `glab config set -g host <work-gitlab-host>`
   or export `GITLAB_HOST=<work-gitlab-host>` in the shell profile. Pick one and use it consistently
   — two mechanisms disagreeing is a Failure Mode below. The hostname is not a secret; the token is.
2. **Then authenticate, interactively**: `glab auth login --hostname <work-gitlab-host>` and follow
   the prompts. Let glab read the token at its own hidden prompt and store it in its own credential
   store.
3. Verify: `glab auth status` reports the **work host** and a valid token. Confirm the host line
   reads the self-hosted host, not `gitlab.com` — "authenticated" against the wrong host is the
   failure this step exists to prevent.
4. Leave the pre-existing `gitlab.com` entry alone unless it is actively in the way. Removing or
   rotating a credential is the human's decision, separately, not part of this phase.

**Key decisions**:

- Host before auth. Authenticating first just re-authenticates the wrong host.
- `glab auth status` is the only accepted evidence. "I ran the login and it seemed fine" is not.
- No token is written to `.env`, to a dotfile, to a note, or to a CI secret in this phase. Phase 5's
  review-leg work must also treat an unusable `glab` (401, wrong host, missing binary) as a
  first-class reportable state rather than assuming this phase always succeeded.

**Feedback loop**

- **Playground**: the `glab` CLI.
- **Experiment**: `glab auth status` (expect the work host, valid), then a harmless authenticated
  read against a real work project, e.g. `glab repo view <group>/<project>` — proving the credential
  works for the scope that matters, not merely that it parses.
- **Check command**: `glab auth status`

### 6. Record the already-satisfied inventory — agent, no action

**Overview**: these were confirmed present on this machine during the probe. They are listed so later
phases do not re-litigate them and so a future `waybill doctor` (phase 3) has a known-good reference.
**Take no action on any of them.** Do not reinstall, upgrade, or "tidy" them.

| Item                        | Location / version                                  | Status    |
| --------------------------- | ---------------------------------------------------- | --------- |
| `ideation` plugin           | `~/.claude/plugins/cache/ideation/ideation/0.15.0`   | satisfied |
| `/mar` command              | `~/.claude/commands/mar.md`                          | satisfied |
| `mr-review` skill           | `~/.claude/skills/mr-review`                         | satisfied |
| `cpr` skill                 | `~/.claude/skills/cpr`                               | satisfied |
| Node.js                     | v26.7.0 (`package.json` requires `>=22.0.0`)         | satisfied |
| `git`, `gh`, `jq`, `tmux`   | on PATH                                              | satisfied |

Note for phase 5: `/cpr` and `/mr-review` are **user-supplied** skills on this machine. The contract
requires the stock route to run without them, so nothing shipped by the plugin may depend on their
presence here — their being satisfied is a convenience for the work overlay (phase 7), not a licence.

## Testing Requirements

There are no unit or integration tests for this phase. It changes no repository code, so there is no
behaviour to assert in `tests/`. Verification is the inner-loop command plus the checklist below.

### Manual Testing

- [ ] `/plugin marketplace update tinetti` run in Claude Code (**human**)
- [ ] `/plugin install waybill@tinetti` run in Claude Code (**human**); Claude Code reloaded
- [ ] `command -v waybill` resolves inside `~/.claude/plugins/cache/tinetti/waybill/<version>/` with `<version>` != `0.3.1`
- [ ] The installed version number is written down, for phase 6 to compare against
- [ ] `npm link` run from the repository root
- [ ] `command -v wyb` resolves, and the path is **outside** `~/.claude/plugins/cache`
- [ ] `ls -l "$(command -v wyb)"` shows the link target inside the working tree
- [ ] `command -v waybill` still resolves to the plugin cache after `npm link` (npm's shim did not win PATH)
- [ ] `npm install -g @fission-ai/openspec` completed
- [ ] `openspec --version` exits 0
- [ ] `~/.claude/commands/spec/` exists and contains `explore.md`, `propose.md`, `apply.md`, `archive.md`
- [ ] All four are symlinks, and `readlink` on them shows **no** `plugins/cache` path
- [ ] Typing `/spec:` in Claude Code offers four completions
- [ ] `glab config set -g host <work-host>` (or `GITLAB_HOST`) set — one mechanism, not both (**human**)
- [ ] `glab auth login --hostname <work-host>` completed interactively (**human**)
- [ ] `glab auth status` reports the **self-hosted work host**, valid — not `gitlab.com`
- [ ] An authenticated read against a real work project succeeds (`glab repo view <group>/<project>`)
- [ ] No token value appears in shell history, any file, any commit, or any output produced by this phase
- [ ] Already-satisfied inventory re-confirmed untouched: ideation plugin, `/mar`, `mr-review`, `cpr`, node, git, gh, jq, tmux
- [ ] The full inner-loop command reports every line green in one run
- [ ] `node --test tests/` still exits 0 (regression guard only — nothing here should affect it)

## Error Handling

| Error Scenario                                          | Handling Strategy                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/plugin install` reports no newer version available     | Stop. Do not hand-edit the cache. Confirm the marketplace actually published a newer tag; escalate to the human. |
| `npm link` fails on permissions to the global prefix     | Do **not** `sudo`. Reconfigure the npm prefix to a user-writable path, or ask the human. Sudo is always the human's call. |
| `npm install -g @fission-ai/openspec` fails (registry/proxy) | Report the failure verbatim minus any credential; do not retry more than twice; treat legs 5/6 as degraded until fixed. |
| `ln -sf` overwrites an existing non-symlink file in `~/.claude/commands/spec/` | Inspect first. If a real file is already there, stop and ask — it may be an untracked original that is the only copy. |
| `glab auth login` fails or the token is rejected         | Report the host and the failure class only. Never the token. The human retries; the agent does not attempt auth. |
| Any command would require printing a secret to proceed   | Stop and hand back to the human. There is no exception to this.                                                  |

## Failure Modes

| Component            | Failure Mode                          | Trigger                                                                                              | Impact                                                                                                        | Mitigation                                                                                                      |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Plugin update        | Update installs an older-than-expected version | The marketplace tag lags the working tree, or `marketplace update` was skipped and the cache re-resolves a stale tag | Phase 6 believes it installed the eight-leg route when it did not; `/waybill:*` commands run an old route silently | Record the exact installed version string now; phase 6 must assert the version it expects, not merely "not 0.3.1" |
| Plugin update        | Old version directory lingers on PATH | Claude Code keeps `0.3.1/bin` on PATH alongside the new version until reload                          | `command -v waybill` still resolves to 0.3.1; every check appears to fail after a successful install            | Fully reload Claude Code, then re-run the inner loop before concluding anything                                   |
| `npm link`           | npm's `waybill` shim shadows the plugin-cache binary | npm global bin sorts earlier on PATH than the plugin cache bin dir                                    | `waybill` now means the working tree, so phase 6's "does the *installed* plugin report 8 legs?" check is answered by the wrong build | Explicitly re-check `command -v waybill` after linking; if npm won, use `wyb` for the tree and the absolute plugin-cache path for the installed build — do not reorder PATH |
| `npm link`           | Link points into a git worktree that is later removed | `npm link` run from `.claude/worktrees/...` instead of the main checkout                             | `wyb` becomes a dangling shim; failures look like "waybill is broken" rather than "the link target is gone"     | Run `npm link` from the main checkout; `ls -l "$(command -v wyb)"` to confirm the target before declaring done    |
| `/spec:*` symlinks   | Links point into the 0.3.1 plugin cache | `$PWD` was the plugin cache directory (it *is* a git checkout, so it looks plausible) when the loop ran | `/spec:propose` resolves, but to five-releases-old frontmatter; the wrong model silently routes legs 5 and 6    | `readlink ~/.claude/commands/spec/*.md \| grep -c 'plugins/cache'` must print `0`                                 |
| `/spec:*` symlinks   | Copies instead of links                | `cp` used, or an editor resolved the link on save                                                     | Two files disagree about model routing and nothing reports which one won (`README.md:346-347`)                  | Assert they are symlinks (`ls -l` shows `->`), not just that they exist                                           |
| `/spec:*` symlinks   | Only some of the four created         | The loop was interrupted, or one name was typo'd                                                      | Legs 5/6 work until they reach the missing verb, then fail mid-route                                            | Assert the count is exactly four and the names match `{explore,propose,apply,archive}`                            |
| `openspec`           | Installed but not on the PATH Claude Code sees | npm global bin absent from the PATH inherited by the Claude Code process                              | `openspecAvailable()` returns false inside Claude Code while `openspec --version` works in the terminal — the degradation is invisible in both places | Verify from a shell launched the same way Claude Code launches, and re-verify after any reload                    |
| `openspec`           | Silent fallback to `tasks.md` parsing | Any spawn failure or non-zero exit (`src/openspec.js:12,31-33` swallows both)                         | Legs 5/6 appear to work and produce subtly different output; no warning is emitted                              | Treat `openspec --version` exit 0 as the only proof; phase 3's doctor makes this permanently visible              |
| `glab`               | Authenticated against the wrong host  | Auth run before the host was set, or `GITLAB_HOST` and `glab config` disagree                         | `glab auth status` reads green while every work-repo call 404s or 401s; phase 5's review leg mis-stamps         | Read the **host line** in `glab auth status`, not just the validity line; use one host mechanism, not both        |
| `glab`               | Env var overrides config in one shell only | `GITLAB_HOST` exported interactively but not in the profile                                           | Works in the shell where it was set, fails in Claude Code's shell and in new terminals                          | Prefer `glab config set -g host`, which is process-independent; if using the env var, put it in the profile       |
| `glab`               | Token expires or is revoked           | Time, or a corporate policy rotation                                                                  | Silent re-emergence of the original 401                                                                         | `glab auth status` stays in the inner loop permanently; phase 5 must report "CLI unusable" distinctly from "no MR yet" |
| Credential handling  | Token leaks into history, a file or output | Any attempt to pass a token on a command line or store it for convenience                            | A live work credential in a readable location                                                                   | Hard prohibition in [Security Constraints](#security-constraints); interactive login only; human performs it     |

## Validation Commands

This repository has **no linter, no typechecker, no build step and no `justfile`**. Do not invent
them and do not add them in this phase. `package.json` declares exactly one script:

```bash
# Unit tests — the only test/lint/build command this repo has
node --test tests/            # equivalently: npm test

# Phase-1 verification (the real gate for this phase — see Feedback Strategy)
for c in waybill wyb openspec node git gh glab jq tmux; do \
  printf '%-10s %s\n' "$c" "$(command -v "$c" 2>/dev/null || echo '** MISSING **')"; done; \
ls ~/.claude/commands/spec/ 2>/dev/null || echo '** MISSING ~/.claude/commands/spec/ **'; \
glab auth status 2>&1 | tail -4
```

`node --test tests/` is run here only as a regression guard: this phase touches no repository code,
so a failure means something unrelated is wrong, not that the phase failed.

## Rollout Considerations

- **Feature flag**: none. This is one machine's local setup.
- **Blast radius**: entirely local to this laptop. Nothing is published, pushed, or shared. The
  personal machine's configuration is untouched.
- **Monitoring**: the inner-loop command, re-run at the start of any later phase that depends on this
  baseline (phases 3, 6 and 7 all do). Phase 3 turns it into `waybill doctor` so it stops being a
  copy-pasted one-liner.
- **Rollback plan**: each step reverses independently and cheaply —
  `npm unlink -g waybill` (or `npm rm -g waybill`) removes the `wyb`/`waybill` shims;
  `npm rm -g @fission-ai/openspec` removes openspec;
  `rm ~/.claude/commands/spec/{explore,propose,apply,archive}.md` removes the symlinks (they are
  links, so no source file is at risk);
  `glab auth logout --hostname <work-host>` clears the credential — but treat credential removal as
  the human's action, not an automated rollback step.
  The plugin install is the one step with no clean reversal; that is acceptable because reverting to
  0.3.1 is not a state anyone wants.

## Open Items

- [ ] The self-hosted work GitLab hostname is not recorded in the contract. The human supplies it at
      step 5; note it (hostname only, never a token) wherever phase 7's overlay work will need it.
- [ ] Decide and record which version the plugin update actually lands on, so phase 6 can assert the
      eight-leg release specifically rather than "anything newer than 0.3.1".
- [ ] Confirm whether `npm link` should be run from the main checkout or this worktree. This spec
      recommends the main checkout (see Failure Modes); if the worktree is chosen deliberately, note
      that `wyb` and the `/spec:*` symlinks die with it.

---

_This spec is ready for execution. Two steps are human-only and are marked **HUMAN**; an agent must
stop at those and hand back rather than improvise an equivalent._
