# Implementation Spec: Waybill on the Work Laptop — Phase 3

**Contract**: ./contract.md
**Estimated Effort**: M

Phase 3 of 7. `risk: medium`, `blocking: false`. Prereq: **Phase 2 — Portability fixes**. The two
overlap in one file: phase 2 rewrites `configuredBookingsDir` (`src/bookings.js:113`) and phase 3
exports that same function for check 6. Phase 2 lands first, so phase 3 exports the rewritten
function rather than the one it replaced, and `src/bookings.js` has one author at a time.

This is the reusable payoff of the whole project. Phases 1, 6 and 7 fix *this* laptop; `waybill
doctor` is what makes the next laptop a one-command diagnosis instead of a dozen shell probes.

---

## Technical Approach

`waybill doctor` is a **report**, not a repair. It is a sixth verb beside `new`, `bay`, `next`,
`status` and `help`, and it answers a question none of the others do: not "where does this docket
stand" but "can this machine run the route at all". It therefore calls no `repoRoot` — like `help`,
it reports configuration rather than position, and must answer on a machine with no checkout in
sight.

The engine is a new `src/doctor.js` built as a list of small, independently testable probe functions
that each return one `Check` record — `{ label, verdict, detail, fix? }` — and a renderer that turns
the list into aligned rows. No probe throws; a probe that cannot reach an answer returns `warn` with
a detail saying so. This shape is what makes the check set testable one gap at a time through the
existing `stubBin` / `withPath` / `withEnv` harness, and it is what keeps the exit-code rule down to
a single line: **exit 1 if and only if some check is `fail`.**

Three properties are load-bearing and are specified as constraints rather than as code, because
they are the properties a future edit could silently lose:

1. **Report-only.** `src/doctor.js` never writes a file, never creates a directory, never runs a
   mutating subprocess. Every subprocess it spawns is a version or status query. Out-of-scope in the
   contract: `waybill doctor --fix`, because the remediations mutate state outside any repo.
2. **Never prints a secret.** Doctor reads *exit codes* from the forge CLIs and nothing else. It
   never relays their stdout or stderr, never opens `~/.config/gh/hosts.yml`, `~/.config/glab-cli/`,
   a keyring, or any credential file. See [Security Constraint](#security-constraint).
3. **Honest about what it cannot see.** The plugin cache layout is an undocumented Claude Code
   internal. When doctor cannot recognise it, it says *cannot locate plugin cache* — never a green
   check. See [Assumed plugin-cache layout](#check-7--plugin-cache-version-and-cli-skew).

Environment is read from `env` (defaulting to the live `process.env`), never from `os.homedir()`.
This follows the pattern already recorded at `src/signals.js:130` and is the only thing that lets a
test relocate `HOME` / `CLAUDE_CONFIG_DIR` with `withEnv`.

Presence and health are distinguished by `spawnSync`'s own signal, not by an exit code: an absent
binary sets `result.error.code === 'ENOENT'`, while an unauthenticated `glab` **exits non-zero with
no `error`**. That distinction is the entire reason check 5 needs its own design — a plain presence
check reports the 401 machine as healthy.

---

## Feedback Strategy

**Inner-loop command**: `node --test tests/doctor.test.js`

**Playground**: the test suite, plus the CLI itself (`node bin/waybill doctor`) for eyeballing the
rendering. `tests/doctor.test.js` is created *first*, with a describe block and one smoke case, before
`src/doctor.js` exists.

**Why this approach**: every check is a pure function over an injected environment, so the test file
is both the fastest check and the only place the failure paths can be exercised without breaking the
real machine. The full suite is ~173s; this one file runs in seconds.

> **Never use `--test-name-pattern` in an acceptance check.**
> `node --test --test-name-pattern 'zzz_no_such_test_zzz' tests/help.test.js` exits **0** — a filter
> that matches nothing is vacuously green. Scope by *file*, never by name.

---

## File Changes

### New Files

| File Path              | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `src/doctor.js`        | The check engine: seven probes, the `Check` record, the renderer, the exit rule |
| `commands/doctor.md`   | The `/waybill:doctor` slash command — bang-line + `CLAUDE_PLUGIN_ROOT` guard   |
| `tests/doctor.test.js` | One case per gap, plus the healthy composition, the relocated config dir, and the no-secret assertion |

### Modified Files

| File Path                  | Changes                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `src/cli.js`               | A `doctor(cwd, args, io)` handler, a `['doctor', doctor]` entry in the `COMMANDS` map at `src/cli.js:588`, and one row in the `USAGE` Commands block |
| `src/bookings.js`          | Export the existing `configuredBookingsDir` (`src/bookings.js:113`) so check 6 reads the *same* tiers rather than a second copy of them |
| `src/help.js`              | One `waybill doctor` row in `OUTRO`'s `COMMANDS` block; `the four verbs` → `the verbs` in `INTRO[0]` (`src/help.js:22`) |
| `README.md`                | A row in the verb table (`README.md:120-121`), a short `## waybill doctor` section, and `the four verbs` → `the verbs` at `:121` |
| `docs/guide/03-reference.md` | `/waybill:doctor` and `waybill doctor` rows (**forced** — see below); `the four verbs` → `the verbs` at `:15` and `:40` |
| `commands/help.md`         | `description:` — `the four verbs` → `the verbs`                                       |
| `tests/commands.test.js`   | `'doctor.md'` added to the `DECLARED` array (`tests/commands.test.js:32-43`)          |
| `tests/bang-lines.test.js` | `'doctor.md'` added to the pinned `invoking` list (`tests/bang-lines.test.js:~165`)   |
| `tests/golden/help.txt`    | Re-blessed with `UPDATE_GOLDEN=1 node --test tests/help.test.js`                      |

### Deleted Files

None.

### Shared files with phase 5

Phase 5 ("Stock review leg and `/waybill:review`") touches four of the files above, and each spec was
written as though it were the only one:

- **`src/help.js`** — phase 3 adds a `waybill doctor` row to `OUTRO`'s COMMANDS block. Phase 5 edits
  nothing here, but its new `review` leg adds a row to the generated `ROUTE` block, so the rendered
  page grows for both.
- **`tests/golden/help.txt`** — both re-bless it.
- **`docs/guide/03-reference.md`** — phase 3 adds the `/waybill:doctor` rows, phase 5 the
  `/waybill:review` rows.
- **`tests/commands.test.js`** — phase 3 adds `'doctor.md'` to `DECLARED`, phase 5 `'review.md'`.

**Land order: phase 3, then phase 5.** Phase 3 is `blocking: false` and earlier in the sequence, and
phase 5 is the larger prose sweep; going the other way means redoing that sweep around doctor's rows.

Whichever lands second re-blesses `tests/golden/help.txt` **against the file as the first one left
it**, not against a pre-doctor baseline. The count is relative: this phase adds one row to whatever
the page currently renders. Both rows fit — `MAX_LINES = 45` leaves room for two — but the second
run's golden diff shows the *other* phase's row already present, and that is expected, not a
regression to investigate.

### The plugin manifest: a correction to the brief

The brief lists `.claude-plugin/plugin.json` as a modified file. **It must not gain a `commands`
key** — that specific edit, not the file as a whole. (The file is legitimately edited elsewhere: the
release in phase 6 bumps its `version`.) Two existing assertions say so, and both are deliberate:

- `tests/commands.test.js:476-478` asserts `plugin.commands === undefined`.
- The doc comment at `tests/commands.test.js:20-31` records the measurement behind it: with no
  `commands` key, `commands/` is discovered by convention and nested files resolve; with a file-path
  array, **nested commands stop resolving entirely**, which would silently unregister all four
  `commands/spec/*.md`.

The real declaration surface is the `DECLARED` array in `tests/commands.test.js`. This is the free
guard the brief is after, and it works in both directions:

```js
assert.deepEqual(shipped(COMMANDS), DECLARED);   // tests/commands.test.js:112
```

Ship `commands/doctor.md` without adding `'doctor.md'` to `DECLARED` and the suite fails. Add it to
`DECLARED` without shipping the file and the suite fails. Neither half can be forgotten.

### Two forced modifications the brief does not name

Both are pinned lists that exist precisely so a new command cannot ship half-wired:

- **`tests/bang-lines.test.js:~165`** — `assert.deepEqual(invoking, ['bay.md', 'help.md', 'new.md',
  'next.md', 'status.md'])`. Its own comment says "a sixth command that shells out to the CLI is
  added here alongside its wrapper." Add `'doctor.md'`. The same test then automatically asserts
  that every `node …src/cli.js` call in `doctor.md` carries the `2>&1 || echo "waybill: exited $?"`
  wrapper.
- **`docs/guide/03-reference.md`** — `tests/guide.test.js:191` ("references the whole surface")
  walks `commands/` and asserts `/waybill:<name>` appears in the reference page for every command
  file. A `commands/doctor.md` with no `/waybill:doctor` in the guide fails the suite.

---

## Implementation Details

### The `Check` record and the verdict scale

**Pattern to follow**: `src/help.js` — a small pure module with one exported render function, padded
columns computed from the data, and no I/O of its own beyond what it is asked for.

```js
/**
 * @typedef {'ok'|'warn'|'fail'|'info'} Verdict
 * @typedef {{label: string, verdict: Verdict, detail: string, fix?: string}} Check
 */
```

| Verdict | Meaning                                                | Exits non-zero |
| ------- | ------------------------------------------------------ | -------------- |
| `ok`    | The prerequisite is present and usable                  | no             |
| `warn`  | Degraded, or doctor could not see well enough to judge  | no             |
| `fail`  | A genuine prerequisite is missing; the route breaks     | **yes**        |
| `info`  | A fact worth reporting that is not a judgment at all    | no             |

**Key decisions**:

- **Exit 1 iff any `fail`.** One rule, one line: `checks.some((c) => c.verdict === 'fail') ? 1 : 0`.
  A caller has one condition to test, matching the reasoning `noWaybill` already records at
  `src/cli.js:185-203`.
- **`warn` for "cannot locate plugin cache" and for version skew, not `fail`.** The layout is an
  undocumented internal; a future Claude Code that reorganises it would otherwise turn every
  machine's doctor red overnight, which is doctor failing rather than the machine. Skew is a `warn`
  for a second, concrete reason: between phase 3 and phase 6 the working tree legitimately runs
  ahead of the latest release, and a `fail` there would make the acceptance check
  `node bin/waybill doctor` exit non-zero *by design*. Neither is a green check either way — both
  print a row and both name a remediation.
- **`fail` reserved for the five genuine prerequisites**: node, git, `openspec`, `~/.claude/commands/spec/`,
  and "no usable forge CLI at all". These are exactly the gaps that make a leg silently do the wrong
  thing, and exactly the set that must be closed for goal 1 — "exits 0 on this machine once setup is
  complete".
- **Every `fail` and every `warn` carries a `fix`.** A row that names a problem and not its
  remediation recreates the cost this whole phase exists to remove. `ok` and `info` carry none.

### Output format

**Overview**: aligned rows, one per check, with each remediation on its own continuation line
directly beneath the row it belongs to.

```
waybill doctor — <version>

  ok    node           v26.2.0 (engines: >=22.0.0)
  ok    git            git version 2.51.0
  FAIL  openspec       not on PATH — legs 5 and 6 fall back to parsing tasks.md, silently
        fix: npm install -g @fission-ai/openspec
  FAIL  spec commands  /Users/you/.claude/commands/spec/ is missing apply, archive, explore, propose
                       — the bare /spec:propose and /spec:apply the waybills name cannot resolve
        fix: for f in explore propose apply archive; do ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"; done
  ok    gh             authenticated
  WARN  glab           present, but `glab auth status` exited 1 — the review leg cannot open an MR
        fix: glab auth login --hostname <your-self-hosted-host>
  WARN  glab host      no host configured — work GitLab is self-hosted, so gitlab.com is not it
        fix: glab config set -g host <your-self-hosted-host>
  WARN  plugin cache   cannot locate plugin cache — no waybill entry in
                       /Users/you/.claude/plugins/installed_plugins.json
        fix: /plugin install waybill@tinetti, then re-run
  info  bookings       no overlay in force — the stock route applies
  info  waybill        this CLI: /Users/you/Projects/waybill/src/cli.js

2 failed, 3 warned — fix the FAIL rows above, then re-run `waybill doctor`
```

A healthy machine:

```
waybill doctor — <version>

  ok    node           v26.2.0 (engines: >=22.0.0)
  ok    git            git version 2.51.0
  ok    openspec       1.9.0
  ok    spec commands  4 of 4 present in /Users/you/.claude/commands/spec/
  ok    gh             authenticated
  ok    glab           authenticated
  ok    glab host      gitlab.example-corp.net
  ok    plugin cache   <version> at /Users/you/.claude/plugins/cache/tinetti/waybill/<version>
  info  bookings       overlay in force: /Users/you/.waybill/bookings (3 legs rebooked)
  info  waybill        this CLI: /Users/you/Projects/waybill/src/cli.js

all clear
```

**Key decisions**:

- `ok` / `WARN` / `FAIL` / `info` are all four characters, so the status column needs no padding
  and the eye can scan it. Uppercase for the two that want attention, lowercase for the two that do
  not.
- The label column is padded to the widest label, computed from the rows — the same
  `Math.max(...rows.map(...))` / `pad` construction as `routeLines` in `src/help.js:89-96`. Use
  `[...text].length` there too: the details carry em dashes.
- Continuation lines (a wrapped detail, or a `fix:`) indent to the detail column, so a remediation
  is visually owned by its row and a copy-paste picks up the command and nothing else.
- The footer is a count, not a verdict sentence, except for the all-clear case. `all clear` is the
  string a human greps for.
- Everything goes to **stdout**, including failures, for the reason `src/cli.js:167-178` records: an
  answer about the machine belongs in the stream a terminal caller reads, and the `` ! `` invocation
  in the command file is the only surface a session sees.

**Implementation steps**:

1. `renderDoctor(checks, version)` → string, terminated by `\n`.
2. Compute the label width, render `  ${verdict4}  ${pad(label)}  ${detail}`.
3. Emit `fix` as a continuation line indented to the detail column, prefixed `fix: `.
4. Footer: `all clear` when no `fail` and no `warn`; otherwise `${f} failed, ${w} warned — …`.

**Feedback loop**:

- **Playground**: `tests/doctor.test.js` with a hand-built `Check[]` array — the renderer is tested
  against literal records, never against a live probe.
- **Experiment**: render `[]`, one `ok`, one `fail` with a `fix`, and a mixed set of all four
  verdicts with labels of differing width.
- **Check command**: `node --test tests/doctor.test.js`

### Check 1 — node

**Overview**: the running interpreter against `engines.node` from the plugin's own `package.json`.

```js
/**
 * @param {string} version e.g. process.versions.node
 * @param {string} range   e.g. '>=22.0.0', straight from package.json engines
 * @returns {Check}
 */
export function checkNode(version, range) {}
```

**Key decisions**:

- The **running** node is the right subject, not whatever `node` resolves to on `PATH`. Every
  `/waybill:*` command runs `node "${CLAUDE_PLUGIN_ROOT}/src/cli.js"`, so the interpreter executing
  this check *is* the interpreter the route uses.
- `range` is read from `package.json` (`new URL('../package.json', import.meta.url)`), not
  hardcoded. Zero dependencies means no semver library: parse the minimum major out of `>=N` with a
  `/^>=\s*(\d+)/` match and compare majors. A range this module cannot parse is a `warn`, not a
  green check — same honesty rule as check 7.
- `version` is a parameter so the below-minimum case is testable without a second node install.

**Fix line**: `nvm install 22 && nvm use 22` (or install Node >= 22 however this machine manages it).

### Check 2 — git

**Overview**: `git --version`, judged by `ENOENT` vs exit code.

**Fix line**: `xcode-select --install` on darwin, `brew install git` otherwise. Pick on
`process.platform`.

### Check 3 — openspec

**Overview**: `openspec --version`. Absent means legs 5 and 6 fall back to parsing `tasks.md` with
no announcement — `src/openspec.js:12` spawns it, `src/openspec.js:31-33` returns a bare boolean,
and every caller treats `null` as "ask `tasks.md` instead".

**Key decisions**:

- Do **not** import `openspecAvailable` from `src/openspec.js`. It collapses ENOENT and a non-zero
  exit into one `false`, which is the exact conflation check 5 exists to avoid — and doctor wants to
  report the installed version string on success, which that function discards.
- The detail on failure names the consequence, not just the absence: *"legs 5 and 6 fall back to
  parsing tasks.md, silently"*. The silence is the defect.

**Fix line**: `npm install -g @fission-ai/openspec`

### Check 4 — `~/.claude/commands/spec/`

**Overview**: the bare `/spec:propose` and `/spec:apply` the OpenSpec waybills name resolve only
against `<configDir>/commands/spec/`. Installed as plugin files they answer to
`/waybill:spec:propose`, which is a different name — `README.md:335-347` records this and gives the
symlink loop.

```js
/**
 * @param {string} configDir  <HOME>/.claude, or CLAUDE_CONFIG_DIR
 * @param {string} pluginRoot the directory holding commands/spec/, from import.meta.url
 * @returns {Check}
 */
export function checkSpecCommands(configDir, pluginRoot) {}
```

**Key decisions**:

- The required set is **derived** from `readdirSync(<pluginRoot>/commands/spec)`, not from a literal
  `['apply', 'archive', 'explore', 'propose']`. A fifth vendored routing command must not need an
  edit here to be checked, and a literal is a second place to state one fact.
- A partially populated directory is still a `fail`, and the detail names *which* are missing.
- Symlink vs copy is not judged. `README.md:348-349` explains why symlinking is right, but a copy
  still resolves, and doctor reports resolvability, not hygiene.

**Fix line**: the loop from `README.md:340-344`, verbatim.

### Check 5 — forge CLI health (gh and glab)

**Overview**: three independent questions per CLI — present, authenticated, host-configured — and
one composite verdict. This is the check that cannot be a presence test.

```js
/**
 * @param {'gh'|'glab'} name
 * @returns {{present: boolean, authed: boolean, host: string|null, exit: number|null}}
 */
function probeForge(name) {}

/** @returns {Check[]} one per CLI, plus a glab-host row when glab is present */
export function checkForges() {}
```

**Key decisions**:

- **`ENOENT` is the only "absent" signal.** `spawnSync('glab', ['auth', 'status'])` on an
  unauthenticated machine returns `status: 1` with `error: undefined` — *not* 127, and not ENOENT.
  A check that tested `status !== 0` would report an unauthenticated glab identically to an
  uninstalled one, and the remediation for those two differs completely.
- **The host is a separate row, and only for glab.** Work GitLab is self-hosted. A `glab` that
  authenticates successfully against `gitlab.com` is a *worse* state than an unauthenticated one,
  because it looks green while pointing nowhere useful — this machine's live defect. Read the host
  with `glab config get host`, which prints a hostname and nothing sensitive. `gh` needs no
  equivalent row: GitHub is where waybill's own repo lives, and `github.com` is the right answer.
- **Composite rule.** At least one forge CLI healthy → the composite is satisfied and the run can
  still exit 0.
  - Neither present → **one `fail`** naming both install commands. The review leg has no forge at all.
  - One healthy, the other absent → the absent one is `info` ("not installed — not needed unless you
    ship to it"), no warning. A personal machine with only `gh` is a healthy machine.
  - One healthy, the other present-but-broken → `warn` on the broken one. A broken CLI is a
    misconfiguration someone will hit; an absent one is a choice.
  - Both present and broken → **`fail`**, same as neither present: nothing can open a review.
- **Timeout 5000 ms** for the auth probes, which touch the network, against `src/openspec.js`'s
  2000 ms for local version queries. A timeout is a `warn` naming the timeout, never a green check
  and never a hang — the same `windowsHide: true, timeout, encoding: 'utf8'` options
  `src/openspec.js:12-17` already uses.

**Fix lines**:

| State                       | `fix:`                                                        |
| --------------------------- | ------------------------------------------------------------- |
| gh absent                   | `brew install gh`                                              |
| gh present, not authed      | `gh auth login`                                                |
| glab absent                 | `brew install glab`                                            |
| glab present, not authed    | `glab auth login --hostname <your-self-hosted-host>`           |
| glab authed, no host        | `glab config set -g host <your-self-hosted-host>`              |

**Feedback loop**:

- **Playground**: `stubBin('glab', …)` writing a `/bin/sh` script that dispatches on `"$1$2"`.
- **Experiment**: four glab stubs — (a) `auth status` exit 0 and `config get host` printing a
  self-hosted name; (b) `auth status` exit 1, the 401 case; (c) `auth status` exit 0 with
  `config get host` printing `gitlab.com`; (d) no stub at all, via a synthetic `PATH`. Plus the
  gh × glab cross product for the composite rule: both healthy, gh-only, glab-only, neither.
- **Check command**: `node --test tests/doctor.test.js`

### Check 6 — bookings overlay (informational only)

**Overview**: report which overlay, if any, is in force. **Never fails the run, never warns.** An
absent `~/.waybill/bookings` is a healthy steady state on a personal machine — that is the whole
point of the extension point, and `src/bookings.js:127-130` already records that a directory which
does not exist reads as empty rather than as an error.

**Key decisions**:

- Export the existing `configuredBookingsDir` from `src/bookings.js:113` and call it, rather than
  re-deriving the tiers. Two readings of `WAYBILL_BOOKINGS_DIR` / `waybill.bookingsdir` would drift,
  and phase 2 is changing tilde handling in exactly that neighbourhood.
- Three distinguishable states, all `info`:
  - Nothing configured → `no overlay in force — the stock route applies`.
  - Configured and populated → `overlay in force: <path> (<n> legs rebooked)`, the count from
    `resolveBookings`.
  - Configured but the directory does not exist → still `info`, worded
    `configured at <path>, which does not exist yet — the stock route applies`. Not a warning:
    pointing at a not-yet-created config directory is explicitly supported.
- A *malformed* overlay is the one exception and is a `warn`, not an `info` — `resolveBookings`
  throws on an unknown leg or two files claiming one leg, and that genuinely breaks every
  `/waybill:*` command (the exact machine-bricking hazard phase 6 exists to sequence around). Catch
  the throw, `warn` with `error.message.split('\n')[0]`, the way `renderHelp` already does at
  `src/help.js:117-120`. It is still not a `fail`: doctor must stay runnable on the machine it is
  diagnosing.

### Check 7 — plugin cache version and CLI skew

**Overview**: the slash commands run from the plugin cache, not the working tree
(`commands/status.md:33`). A cache pinned five minor releases back is why this machine offers
`/waybill:start` and not `/waybill:new`. Doctor reports the installed version, where it lives, and
whether this CLI is the same one.

#### Assumed layout — recorded explicitly

Doctor assumes **all** of the following. Any one of them not holding means *cannot locate*, and the
detail names which assumption failed.

| # | Assumption                                                                                              |
| - | --------------------------------------------------------------------------------------------------------- |
| 1 | The config directory is `env.CLAUDE_CONFIG_DIR` when set and non-blank, otherwise `path.join(env.HOME, '.claude')`. `env.HOME` unset → *cannot locate* |
| 2 | `<configDir>/plugins/installed_plugins.json` exists and parses as JSON                                  |
| 3 | It has `{ version: 2, plugins: { "<name>@<marketplace>": [ … ] } }`. Any other `version` → *cannot locate* |
| 4 | Some key's name-part before `@` is `waybill`                                                             |
| 5 | Its first entry has a string `version` and a string `installPath`                                        |
| 6 | Conventional cache layout, reported but **not required**: `<configDir>/plugins/cache/<owner>/<plugin>/<version>/` |

**Key decisions**:

- **Read `installed_plugins.json`, do not glob the cache directory.** Measured on this machine: the
  third path segment is *not* reliably a version.
  `~/.claude/plugins/cache/claude-plugins-official/frontend-design/022b3c274938/` is a content hash,
  and that plugin has eight such directories side by side. A glob would have to guess which is
  current; the manifest states it. Assumption 6 is therefore reported for the human's benefit and
  never used to derive the version.
- **`env`, never `os.homedir()`.** `src/signals.js:124-141` already reads `HOME` from `env` for
  exactly this reason — "the tests hand in a `HOME` of their own" — and `withEnv` can then relocate
  both `HOME` and `CLAUDE_CONFIG_DIR`.
- **Every miss is `warn` with the words `cannot locate plugin cache`**, never `ok` and never a
  silent skip. The literal phrase is asserted by the test, so a reword cannot quietly turn the check
  into a pass.
- **Skew** compares the manifest's `version` against this CLI's own `package.json` version. Equal →
  `ok`. Different → `warn`: `plugin cache is at 0.3.1, this CLI is 0.8.0 — every /waybill:* command
  runs the cached copy`, fix `/plugin update waybill@tinetti`.
- **A second, cheap row**: whether the `waybill` binary that would resolve on `PATH` sits inside
  `<configDir>/plugins/cache`. Answered from `env.PATH` by `fs.existsSync` — no `which`, no
  subprocess. Inside the cache → `warn` with fix `npm link` run from the working tree; this is the
  `wyb`-does-not-resolve gap in one line. Emit this row as `info` when the binary is not found at
  all, since a machine that only ever uses the slash commands never needs it.

**Implementation steps**:

1. `configDir(env)` → `string|null`.
2. `readInstalledPlugins(configDir)` → `{ version, installPath } | { problem: string }`. Never throws.
3. Compose the cache row, the skew row, and the PATH row.

**Feedback loop**:

- **Playground**: `withEnv({ CLAUDE_CONFIG_DIR: tempRoot(), HOME: tempRoot() }, …)` plus `writeFile`
  to plant a manifest.
- **Experiment**: five manifests — absent file; `{}`; `{"version": 3, …}`; version 2 with no
  `waybill@*` key; version 2 with `waybill@tinetti` at a version deliberately unequal to
  `package.json`'s.
- **Check command**: `node --test tests/doctor.test.js`

### The `doctor` verb in `src/cli.js`

**Pattern to follow**: `help` at `src/cli.js:352-360` — not `status`, because doctor calls no
`repoRoot`.

```js
/**
 * `waybill doctor` — can this machine run the route at all.
 *
 * Calls no repoRoot, for `help`'s reason: it reports the machine, never a position, so it has an
 * answer outside any repository — which is the machine most likely to need one.
 *
 * @param {string} cwd used only to resolve the bookings overlay in force
 * @param {string[]} args
 * @param {{out:(text:string)=>void, err:(text:string)=>void}} io
 * @returns {number} 0, or 1 when some check failed
 */
function doctor(cwd, args, io) {}
```

**Key decisions**:

- **Takes no options at all**, rejecting any argument with exit 2 and the usage banner, for the
  reason `status` gives at `src/cli.js:301-313`: `next --json` is the one machine-readable surface,
  and a second would be another shape to keep in step. `--json` is not in scope.
- **Exit 1, not 2.** Exit 2 is this CLI's "you asked wrongly" code throughout. A failed check is a
  correct answer to a correct question, so it needs a code of its own.
- `cwd` is passed through only so check 6 resolves the overlay from where the operator stands,
  matching `resolveBookings`' own anchoring note at `src/bookings.js:142-145`.

**Implementation steps**:

1. Add `'  doctor          Can this machine run the route: every prerequisite, with its fix',` to
   the `USAGE` Commands block, after the `status` row and before `help`.
2. Change the `help` row's `the four verbs` to `the verbs` (`src/cli.js:41`).
3. Add `['doctor', doctor]` to the `COMMANDS` map at `src/cli.js:588`.
4. Add the matching `waybill doctor` line to `src/help.js`'s `OUTRO` COMMANDS block — **required**,
   not cosmetic: `tests/help.test.js:203-211` asserts every USAGE token appears there.
5. `src/help.js:22` `INTRO[0]`: `the four verbs` → `the verbs`. Drop the count rather than increment
   it — a number in the help card goes stale every time a verb is added, and `doctor` is diagnostic
   (it reports on the machine, not the docket) so it does not belong in the route-verb tally anyway.
   All six sites must change together: `src/help.js:22`, `src/cli.js:41`, `commands/help.md:2`,
   `README.md:121`, `docs/guide/03-reference.md:15` and `:40`. This adds one row to whatever the page
   currently renders, and `MAX_LINES = 45` has room for that row and phase 5's — check the current
   count rather than assuming one.
6. Re-bless: `UPDATE_GOLDEN=1 node --test tests/help.test.js`. If phase 5 landed first, re-bless
   against the page as it stands, review row included — see *Shared files with phase 5*.

### `commands/doctor.md`

**Pattern to follow**: `commands/status.md:33` and `commands/next.md` — byte-for-byte the same guard
shape.

```
---
description: "Can this machine run the route: every prerequisite, with its fix"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---
```

```
!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" doctor 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`
```

**Key decisions**:

- **`${CLAUDE_PLUGIN_ROOT}` with no `:-` fallback and no `:-.`.** `tests/commands.test.js:153-182`
  explains why at length: Claude Code rewrites the literal `${CLAUDE_PLUGIN_ROOT}` out of the body
  before bash ever sees it, matching that exact spelling and a bare `$CLAUDE_PLUGIN_ROOT` and
  nothing else. `${CLAUDE_PLUGIN_ROOT:-}` is the one spelling *guaranteed* to break, and a sweep
  over every non-comment line enforces this automatically.
- **The `2>&1 || echo "waybill: exited $?"` wrapper is load-bearing here more than anywhere else.**
  Claude Code discards a command file whose `` ! `` line exits non-zero — the Task section never
  renders. Doctor exits 1 precisely when it has something to say, so without the wrapper the command
  would be silent in exactly the case it exists for.
- **No `model:` or `effort:` frontmatter.** `tests/commands.test.js:202-222` asserts that every
  command except `new.md` declares neither: this command's waybill is not for this session.

**The Task section** says, in this order:

1. Show the block **verbatim** — same lines, same order, same glyphs. It is already the whole answer.
2. **Do not run any `fix:` line, and do not offer to.** Doctor is a diagnosis; the human runs the
   fix. Several remediations mutate state outside any repo — a plugin update, an `npm link`, a
   global git config, symlinks into `~/.claude` — which is why `--fix` is out of scope in the
   contract.
3. Do not edit `~/.claude`, `~/.waybill`, or any config file on the operator's behalf.
4. If the block ends `waybill: exited N`, that line records the exit code and nothing more. Show it
   and stop.
5. `info` rows are not problems. An absent bookings overlay in particular is a healthy steady state
   on a personal machine — do not offer to create one.

---

## Security Constraint

Doctor reports **auth status only**. This is a hard constraint on `src/doctor.js`, not a guideline:

- It **never prints, logs, or writes a token**, in any verdict, detail, or fix line.
- It **never relays stdout or stderr** from `gh auth status` or `glab auth status`. Those commands
  print token metadata; doctor reads `result.status` and `result.error?.code` and **discards the
  streams**. The only forge subprocess whose stdout is read is `glab config get host`, which returns
  a hostname.
- It **never reads a credential file to display its contents** — not `~/.config/gh/hosts.yml`, not
  `~/.config/glab-cli/config.yml`, not a keyring, not `.netrc`, not `.git-credentials`. Auth is
  judged by exit code alone.
- Fix lines carry **placeholders, never values**: `glab auth login --hostname <your-self-hosted-host>`.

Enforced by a test, not by good intentions: a `gh` stub that prints `Token: ghp_SECRETVALUE0123` on
both streams, asserting the full rendered output does not contain `ghp_SECRETVALUE0123`. See the
test table below.

---

## Testing Requirements

### Unit Tests

| Test File              | Coverage                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `tests/doctor.test.js` | All seven checks, the renderer, the exit rule, and the security constraint |

**Key test cases** — one per gap, each asserting **both** the non-zero exit **and** the remediation
string in stdout, per the contract's success criterion:

| # | Case                                  | Setup                                                                   | Assert                                                              |
| - | ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1 | node below the engines minimum        | `checkNode('20.11.0', '>=22.0.0')`                                       | verdict `fail`; fix names node 22                                    |
| 2 | node at or above                      | `checkNode('22.0.0', …)`, `checkNode('26.2.0', …)`                       | verdict `ok`                                                         |
| 3 | an unparseable engines range          | `checkNode('26.2.0', 'weird')`                                           | verdict `warn`, not `ok`                                             |
| 4 | git absent                            | `withPath(pathWithout('git'), …)`                                        | exit 1; stdout contains the install fix                              |
| 5 | openspec absent                       | `withPath(pathWithout('openspec'), …)`                                   | exit 1; stdout contains `npm install -g @fission-ai/openspec`        |
| 6 | spec commands absent                  | `withEnv({ CLAUDE_CONFIG_DIR: tempRoot() }, …)`                          | exit 1; stdout contains the `ln -sf` loop                            |
| 7 | spec commands partially present       | plant 2 of the 4 `.md` files                                             | exit 1; the detail names the two missing by name                     |
| 8 | glab present but unauthenticated      | `stubBin('glab', 'exit 1')` — **the 401 case**                           | `warn`, detail says present-but-exited-non-zero, fix is `glab auth login --hostname` |
| 9 | glab authed against the wrong host    | stub: `auth status` exit 0, `config get host` prints `gitlab.com`        | a distinct `warn` row; fix is `glab config set -g host`              |
| 10 | neither forge CLI present            | synthetic `PATH` with neither                                            | exit 1; both install fixes named                                     |
| 11 | gh healthy, glab absent              | stub gh only                                                             | exit 0; glab row is `info`, **not** `warn`                           |
| 12 | both present and broken              | both stubs exit 1                                                        | exit 1                                                               |
| 13 | **overlay absent → still exit 0**    | healthy stubs, `WAYBILL_BOOKINGS_DIR` unset, `HOME` at a bare `tempRoot()` | **exit 0**; the bookings row is `info`; output contains no `FAIL`   |
| 14 | overlay configured and populated     | `WAYBILL_BOOKINGS_DIR` at a dir with one booking                         | `info`; the path and the rebooked count appear                       |
| 15 | overlay configured but nonexistent   | `WAYBILL_BOOKINGS_DIR` at a missing dir                                  | `info`, not `warn`                                                   |
| 16 | overlay malformed                    | two booking files claiming one leg                                       | `warn`, not `fail`; doctor still renders every other row             |
| 17 | **config dir relocated, no manifest** | `withEnv({ CLAUDE_CONFIG_DIR: tempRoot(), HOME: tempRoot() }, …)`        | the row contains `cannot locate plugin cache`; verdict is **not** `ok`; exit still 0 |
| 18 | manifest is not JSON                 | plant `installed_plugins.json` = `not json`                              | `cannot locate plugin cache`                                         |
| 19 | manifest schema version is not 2     | plant `{"version": 3, "plugins": {}}`                                    | `cannot locate plugin cache`                                         |
| 20 | manifest has no waybill entry        | plant a valid v2 manifest for another plugin                             | `cannot locate plugin cache`                                         |
| 21 | version skew                         | plant `waybill@tinetti` at `0.3.1`                                       | `warn`; both versions appear; fix is `/plugin update`                |
| 22 | versions agree                       | plant the version from `package.json`                                    | `ok`                                                                 |
| 23 | `HOME` unset entirely                | `withEnv({ HOME: undefined, CLAUDE_CONFIG_DIR: undefined }, …)`          | `cannot locate plugin cache`; no throw                               |
| 24 | **no secret is ever printed**        | `stubBin('gh', 'echo "Token: ghp_SECRETVALUE0123"; echo "Token: ghp_SECRETVALUE0123" >&2; exit 0')` | the whole rendering does **not** contain `ghp_SECRETVALUE0123`      |
| 25 | the healthy composition              | every binary stubbed healthy, a matching manifest planted                | **exit 0**; `all clear` in stdout                                    |
| 26 | renderer: alignment and fix lines    | hand-built `Check[]` with all four verdicts, labels of differing width   | statuses align; each `fix:` is on its own line under its row         |
| 27 | renderer: empty input                | `renderDoctor([], '0.8.0')`                                              | does not throw                                                       |
| 28 | the verb rejects arguments           | `run(['doctor', '--json'])`                                              | exit 2; stderr names the unknown option and prints the usage         |
| 29 | doctor runs outside a repository     | `cwd` = a bare `tempRoot()`                                              | does **not** print `not inside a git repository`                     |

**Harness notes for the implementer**:

- Compose a fully **synthetic `PATH`** for the composite cases rather than chaining `pathWithout`:
  `[stubA, stubB, path.dirname(process.execPath), dirOfRealGit].join(path.delimiter)`. `stubBin`
  returns a fresh directory per call, so several stubs join cleanly, and a synthetic path is the
  only hermetic way to assert "neither forge CLI present" on a developer machine that has both.
- Use `pathWithout(name)` for the single-absence cases (4, 5) — it is exactly the "a real binary on
  the developer's machine must not turn an absent-CLI test into a false positive" guard its doc
  comment at `tests/helpers/repo-fixture.js:203-209` describes.
- `git` must stay reachable in every case that exercises check 6, since `configuredBookingsDir`
  shells out to `git config`.
- Import `after(cleanupAll)` from the harness, as every other suite does.
- `withEnv` and `withPath` mutate the live `process.env`, so a probe that reads `process.env` at call
  time sees the override. Do **not** snapshot `env` at module load.

### Integration Tests

Covered by existing suites, automatically, once the two pinned lists are updated:

| Test File                  | Coverage                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| `tests/commands.test.js`   | Ships-vs-declared parity in both directions; frontmatter has a description; no `model:`/`effort:`; the `${CLAUDE_PLUGIN_ROOT}` spelling sweep |
| `tests/bang-lines.test.js` | The `!` line is wrapped; a real bash run of it exits 0 even when doctor exits 1 |
| `tests/help.test.js`       | Every USAGE token has a COMMANDS row; the page stays within `MAX_LINES`; the golden |
| `tests/guide.test.js`      | `/waybill:doctor` is referenced in `docs/guide/03-reference.md`            |

Add one case to `tests/bang-lines.test.js`: run `doctor`'s `!` line through bash on a machine with a
forced failure and assert `status === 0` with `waybill: exited 1` in stdout. This is the one
integration that proves the wrapper does its job for a verb that legitimately exits non-zero.

### Manual Testing

- [ ] `node bin/waybill doctor` on this laptop before phase 1 — reads the six real gaps
- [ ] `node bin/waybill doctor` after phase 1 — `all clear`, exit 0
- [ ] `/waybill:doctor` in a session — the block renders verbatim and the session runs no fix
- [ ] `CLAUDE_CONFIG_DIR=/tmp/nope node bin/waybill doctor` — says cannot locate, still exits 0

---

## Error Handling

| Error Scenario                                    | Handling Strategy                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| A probed binary is absent                         | `ENOENT` from `spawnSync`; `fail` or `info` per the composite rule; never a throw   |
| A probed binary exits non-zero                    | Read the exit code; **discard both streams**; `warn` or `fail` with a targeted fix  |
| A probe exceeds its timeout                       | `warn` naming the timeout; never a green check, never a hang                        |
| `installed_plugins.json` absent or unparseable    | `warn`: `cannot locate plugin cache — <which assumption failed>`                    |
| `HOME` and `CLAUDE_CONFIG_DIR` both unset         | `warn`: cannot locate; checks 4 and 7 degrade, the rest still run                   |
| `package.json` unreadable from `src/doctor.js`    | Throw. This is the module's own installation being broken, not the machine's — dressing it up as advice would hide a packaging bug |
| `resolveBookings` throws on a malformed overlay   | Catch; `warn` with the first line of the message, as `src/help.js:117-120` does      |
| An unknown option is passed to the verb           | Exit 2 with the usage banner on **stderr**, as every other verb does                |
| A single probe throws unexpectedly                | Wrap each probe; convert to `warn` naming the check. One broken probe must not take the report down — a diagnostic that dies on the machine it is diagnosing is worthless |

---

## Failure Modes

| Component        | Failure Mode                     | Trigger                                                          | Impact                                                                 | Mitigation                                                                 |
| ---------------- | -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Check 5 (forge)  | Presence read as health          | `glab` installed but returns 401                                   | Doctor greens the exact defect this laptop has; the review leg then stalls | Judge `ENOENT` and exit code separately; test 8 pins the 401 case              |
| Check 5          | Authenticated against the wrong host | `glab auth status` passes against `gitlab.com` on a self-hosted org | Greenest-looking failure there is: authenticated, and pointing nowhere useful | A separate host row; test 9                                                  |
| Check 5          | Network stall                    | `gh auth status` behind a proxy or a captive portal                | Doctor hangs, and a hung `!` line hangs the slash command                  | 5000 ms timeout; a timeout is a `warn`                                       |
| Check 5          | Token leak                       | A future edit relays stub stdout into the detail for a better message | A credential printed to a terminal, a transcript, or a shared screenshot   | Streams discarded by construction; test 24 asserts the absence of a planted token |
| Check 7          | Undocumented layout changes      | A Claude Code release moves or reshapes `installed_plugins.json`   | A silent green check on a machine that is actually five releases behind    | Six enumerated assumptions; any miss → `cannot locate`; tests 17-20, 23        |
| Check 7          | Non-semver cache segment         | `<version>` is a content hash — measured, eight side by side today | A glob cannot tell which is current and would pick arbitrarily             | Read the manifest; treat the cache path as reported-not-derived                |
| Check 7          | Skew flagged mid-development     | Working tree at `<newer>`, latest release `<older>`, between phases 3 and 6 | A `fail` would break the `node bin/waybill doctor` acceptance check *by design* | Skew is a `warn`; the row names both versions                                 |
| Check 6          | False alarm on a healthy machine | No `~/.waybill/bookings`, which is the personal-machine steady state | Doctor cries wolf, and a doctor that cries wolf stops being run            | `info` only; test 13 pins exit 0 with the overlay absent                      |
| Check 6          | Malformed overlay takes doctor down | Two overlay files claim one leg                                   | The one command that could diagnose the break is the one the break kills   | Catch and `warn`; test 16                                                     |
| Check 4          | Symlink vs copy confusion        | The four files exist as copies that disagree with the plugin        | Doctor says green while the wrong model routes a leg                        | Out of scope and stated as such: doctor reports resolvability, not hygiene     |
| Check 1          | Wrong node judged                | `PATH`'s `node` differs from the running interpreter                | A false report about an interpreter the route never uses                    | Judge `process.versions.node`; the running node *is* the route's node          |
| Renderer         | Column drift on wide details     | A long path or a self-hosted hostname                              | A `fix:` line no longer reads as belonging to its row                       | Width computed from the data; continuations indent to the detail column; test 26 |
| Slash command    | Silent on failure                | `!` line exits 1 and Claude Code discards the file                  | Doctor is mute in exactly the case it exists for                            | The `\|\| echo "waybill: exited $?"` wrapper; enforced by `tests/bang-lines.test.js` once `doctor.md` is in the pinned list |
| Slash command    | The session runs the fixes       | A model reads `fix:` as an instruction                             | Unattended `npm link`, global git config edits, writes into `~/.claude`      | The Task section forbids it in its own numbered paragraph                      |
| The verb         | Exit-code collision              | Exit 2 reused for a failed check                                    | A caller cannot tell "you asked wrongly" from "your machine is broken"      | 0 clean / 1 some check failed / 2 bad arguments                                |

---

## Validation Commands

No lint, typecheck, build, CI or justfile exists in this repo — tests are the whole gate.

```bash
# Inner loop — seconds. Scoped by FILE, never by --test-name-pattern.
node --test tests/doctor.test.js

# Acceptance, stated verbatim from the contract's success criteria:

#   exits 0 on a healthy machine. Pinned to the working tree, NOT a bare `waybill`,
#   which resolves to the stale 0.3.1 plugin cache.
node bin/waybill doctor

#   exits 0, one case per gap asserting BOTH the non-zero exit and the remediation
#   string in stdout; plus a case asserting exit 0 with the overlay absent; plus a
#   withEnv case relocating the config dir.
node --test tests/doctor.test.js

#   exits 0 — the both-directions parity assertion at tests/commands.test.js:112.
node --test tests/commands.test.js

# Surfaces this phase forces, each with its own pinned list:
node --test tests/bang-lines.test.js
node --test tests/help.test.js
node --test tests/guide.test.js

# Re-bless the help page after the COMMANDS row lands:
UPDATE_GOLDEN=1 node --test tests/help.test.js

# Full suite, once, before the PR. ~173s — delegate this run.
node --test tests/
```

---

## Rollout Considerations

- **Feature flag**: none. A new verb that reads and reports cannot break an existing one.
- **Breaking change**: none. Nothing is renamed, no existing verb changes behaviour, no stamp moves.
  This is the one phase in the contract that is purely additive — which is why it is `blocking: false`
  and can land ahead of the leg-count work.
- **Rollback**: revert the commit. Nothing persists, nothing migrates, no state is written anywhere.
- **Shipping**: doctor reaches a machine through a plugin release, so it becomes usable there only
  after phase 6 installs a version carrying it. Phase 1 fixes this laptop by hand; doctor is what
  pays for the *next* one.

## Open Items

- [ ] Fix-line wording for node 22 is machine-manager-specific (`nvm` / `fnm` / `brew` / `mise`).
      Suggest `nvm` and append "or however this machine manages node versions" rather than probing —
      probing for a version manager is a check of its own and is not in scope.
- [ ] The stretch item "compare against the latest marketplace tag" stays out: it needs network, and
      every other check is offline. Skew against the *installed* version is the offline half.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
