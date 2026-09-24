# Implementation Spec: Waybill on the Work Laptop - Phase 6

**Contract**: ./contract.md
**Estimated Effort**: S (mechanical), but **blocking** — nothing in phase 7 may start until this gate closes
**Kind**: gate · **Risk**: medium · **Blocking**: true
**Prereqs**: Phase 5 (Stock review leg and `/waybill:review`), Phase 1 (Machine setup to a known-good baseline)

> This is a **release runbook**, not a code spec. It ships no source change beyond a version bump.
> Sections the template reserves for code — Data Model, API Design, code-level Failure Modes — are
> deliberately omitted; the failure modes that matter here are release and install failure modes,
> and they live under *Rollout Considerations*.

---

## Why this phase exists

**Read this before doing anything else. It is the reason the phase was added after critique.**

Every `/waybill:*` slash command runs the CLI out of the **installed plugin cache**, not the working
tree. From `commands/status.md:33`:

```
!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" status 2>&1 || echo "waybill: exited $?"; else ... fi`
```

`CLAUDE_PLUGIN_ROOT` points at `~/.claude/plugins/cache/tinetti/waybill/<version>/`. On this laptop
that is `0.3.1` today. An `npm link` of the working tree changes what `waybill` on PATH resolves to;
it changes **nothing** about what a slash command executes.

Meanwhile `src/bookings.js:72-73` throws on load:

```js
if (known && !known.has(meta.leg)) {
  throw new Error(`${file}: unknown leg \`${meta.leg}\``);
}
```

Bookings are loaded on **every** command, and the throw is not scoped to the offending leg. So if
phase 7 writes `~/.waybill/bookings/review.md` declaring `leg: review` while a **seven-leg** plugin
is still installed, the result is not "the review leg misbehaves" — it is **every `/waybill:*`
command on this machine failing**, including the ones you would reach for to diagnose it.

Therefore the ordering is not a preference. The eight-leg route must be released, published,
installed, **and confirmed reporting eight legs from the installed plugin**, before phase 7 writes
one line of overlay.

The gate closes when `waybill help` — the bare PATH binary — names eight legs. Not before.

## Technical Approach

The release itself is three moving parts, and only the first lives in this repository.

1. **The version bump in this repo.** The version is duplicated in `.claude-plugin/plugin.json` and
   `package.json`, and the two must never disagree: the marketplace serves the plugin manifest's
   version, `npm link` honours the package manifest's `bin` entries. A release here is a one-commit
   bump of exactly those two files, merged as its own PR, then tagged `v<version>`. `git show d301bac`
   (`chore: release 0.8.0 (#32)`) is the shape to copy: two files, two changed lines, a commit body
   that lists the merged PRs since the last release and justifies the semver step.

2. **The marketplace repo.** The plugin is distributed through a **separate repository**,
   `tinetti/claude-plugins`, which is not a checkout in this worktree and is not touched by this
   repo's release commit. Updating it so the new version is servable is a **human action in a
   different repo** (see *Human-gate steps*). Until it happens, `/plugin install waybill@tinetti`
   keeps serving the old version and this gate cannot close.

3. **The install on this laptop.** `/plugin marketplace update tinetti` and
   `/plugin install waybill@tinetti` are **Claude Code UI commands**. They are typed by the human
   into a Claude Code session. An agent cannot run them, cannot shell out to them, and must not
   pretend to have.

The CLI (`waybill` / `wyb`) and the plugin are two independent distribution channels — README.md:76,
"The two surfaces install separately, and neither one brings the other." The CLI comes from
`git clone` + `npm link`; the plugin comes from the marketplace. Both must land on eight legs, and
the acceptance checks verify each one separately for exactly that reason.

### Semver: this is a breaking change

Phase 5 appends a stock eighth leg. For every existing plugin user, every waybill that previously
read "leg 6 of 7" now reads "leg 7 of 8", the route gains a step between `execute` and `cleanup`,
and any user overlay that pinned leg positions shifts under them. Route output is waybill's public
surface; this is not an additive change.

**Recommendation: take the breaking step of the semver treatment** — the major step if the project
is prepared to leave 0.x, otherwise the widest step 0.x affords, which is a minor bump, and say in
the release commit body that the minor is carrying a breaking change because 0.x has no larger step.
Argue it in the body the way `chore: release 0.8.0` argues "Minor, not patch".

**Do not name a version number** in this spec, in the phase-7 spec, in any test, or in any doc
written for this work. Per the `bang-line-exit-guard` learning in `docs/ideation/learnings.md:32-39`:
main releases independently, release PRs own versioning, and a spec that names its release version
goes stale — it happened once already (spec said 0.4.1, shipped as 0.4.2). Say **"the next release
PR ships it"**. The runbook below is written so it never needs the number.

## Feedback Strategy

**Inner-loop command** — seconds, and it measures the two things this phase actually changes:

```bash
node -p "[require('./package.json').version, require('./.claude-plugin/plugin.json').version]" \
  && node bin/waybill help
```

The first half prints the two version strings side by side, so a disagreement is visible rather than
deduced; the second half confirms the route still renders and names eight legs. Post-install, the
same pair against the installed artifacts: `waybill help` from a fresh shell.

`node --test tests/` is **not** the inner loop. It is the ~173s full suite, and it belongs where
*Validation Commands* puts it: a pre-release gate run once in Step A, before the release PR is
opened.

**Playground**: the terminal, plus one Claude Code session for the two UI commands. There is no dev
server and no build step — the "build" is a git tag and a marketplace pointer.

**Why this approach**: the only thing being changed in code is two version strings, so the whole risk
sits in *distribution*. The feedback that matters is not a repeated test run but the answer to "what
does the installed thing actually do", and the fastest honest check for that is reading the two
version fields and running the binary.

## File Changes

### Modified Files

| File Path                    | Changes                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `.claude-plugin/plugin.json` | `version` → the next release version. One line. Nothing else in the file. |
| `package.json`               | `version` → the same string, byte-for-byte. One line.                     |

### New Files

None in this repository.

### Out-of-repo changes (human, separate repo)

| Location                       | Change                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| `tinetti/claude-plugins`       | Point the `waybill` marketplace entry at the new tag/version and push it. |
| `~/.claude/plugins/cache/...`  | Written by `/plugin install`; never edited by hand.                       |

## Implementation Details

### Step A — Pre-release verification (agent may run)

**Overview**: prove the working tree is releasable before the version moves. The bump commit should
be the last thing that happens, so that the tag names a tree already known green.

**Implementation steps**:

1. Confirm phase 5 is merged to `main` and `main` is what you are releasing from. A release cut from
   a feature branch ships a tree nobody reviewed.
2. Run `node --test tests/` from the repo root. It must exit 0. This is the only verification command
   this repo has (see *Validation Commands*).
3. Run `node bin/waybill help` and confirm the ROUTE block lists **eight** numbered legs with
   `review` between `execute` and `cleanup`. This checks the *working tree*, which is necessary but
   nowhere near sufficient — it is the thing this gate exists to distinguish from.
4. Read `git log v<previous-tag>..main --oneline` and draft the release commit body: every merged PR
   since the last release, one line each, then the semver justification.

**Feedback loop**:

- **Playground**: the repo root, on `main`, clean tree.
- **Experiment**: `node --test tests/` and `node bin/waybill help` back to back — the suite green and
  the route showing eight legs are two different claims, and the second is the one users see.
- **Check command**: `node --test tests/`

### Step B — The release PR (agent may prepare; human merges)

**Pattern to follow**: `git show d301bac` — `chore: release 0.8.0 (#32)`.

**Overview**: one commit, two files, two changed lines, on its own branch, opened as a PR.

**Key decisions**:

- **Exactly two files.** If the diff touches a third file, it is not a release commit — split it. The
  bump must be trivially reviewable and trivially revertable.
- **The two versions must be identical strings.** They are the same release seen from two
  distribution channels; a mismatch means the marketplace and the linked CLI disagree about what is
  installed, which is precisely the confusion this phase exists to end.
- **The tag is `v<version>`,** matching `v0.2.0`…`v0.8.0`, and points at the merge commit of the
  release PR on `main`.

**Implementation steps**:

1. Branch: `chore/release-<next-version>` — per the global rule, work in a branch and a worktree,
   never the main checkout.
2. Edit the two `version` fields. Nothing else.
3. Commit with a single-line imperative summary (`chore: release <version>`) and a body listing the
   merged PRs and the semver argument, including the sentence that this release carries a breaking
   route change (leg N of 7 → leg N of 8).
4. Push, open the PR, and state in the description: what changed, the breaking-change note, and the
   `node --test tests/` output from Step A.
5. **Human merges.** After merge, tag `main` and push the tag.

### Step C — Publish to the marketplace (human only)

**Overview**: `tinetti/claude-plugins` is a **separate repository** that this release does not touch
automatically. Somebody has to update it, and that somebody is the human.

Publishing to a marketplace is an **outward-facing action**: it changes what other machines and other
people install. It is not a local, reversible, non-production operation, so it is not an agent's to
perform. The human performs the publish and the human confirms it landed.

**No token is ever printed, echoed, logged, written to a file, or parked in a shell variable** during
this step — not in a command, not in a PR body, not in this runbook, not in a transcript. If any step
appears to need a credential value to be visible, stop and hand it to the human instead.

**Implementation steps** (all human):

1. Update the `waybill` entry in `tinetti/claude-plugins` to the new version, and push it.
2. Confirm the marketplace source actually serves the new version before moving on. A silent
   no-op here looks exactly like a successful publish from the install side, right up until
   `/plugin install` hands back the old build.

### Step D — Install on this laptop (human-gate, Claude Code UI)

**These are Claude Code UI commands. An agent cannot run them.** They are typed by the human into a
Claude Code session; there is no shell equivalent, and no agent should claim to have executed them.

```
/plugin marketplace update tinetti
/plugin install waybill@tinetti
```

Then restart the Claude Code session, so `CLAUDE_PLUGIN_ROOT` resolves to the newly installed version
directory rather than the one the running session started with.

Separately, and in a shell (agent may run): re-run `npm link` from the working-tree clone if the CLI
half of the install has drifted, so `wyb` continues to resolve to the linked tree. The CLI and the
plugin are independent — see README.md:98-110.

### Step E — Confirmation (the whole point of the gate)

**Overview**: verify the **installed plugin**, not the working tree. Everything before this step can
be done perfectly and still leave a seven-leg runtime on the machine.

Today, before the gate:

```
$ command -v waybill
/Users/jtinetti/.claude/plugins/cache/tinetti/waybill/0.3.1/bin/waybill
$ ls ~/.claude/plugins/cache/tinetti/waybill/
0.3.1
```

That `0.3.1` is what makes the confirmation non-obvious: PATH resolves `waybill` *into the plugin
cache*, so a bare `waybill help` is reporting on the cache, not on the clone. After the install, the
cache must contain the new version directory and PATH must resolve inside **it**.

**The four acceptance checks, verbatim:**

- `node --test tests/` — exits 0 before the release commit is cut
- `waybill help` — names 8 legs (run AFTER install; this deliberately uses the bare PATH binary
  because that is what we are verifying)
- `command -v waybill` — resolves inside the newly installed plugin cache version, not 0.3.1
- `command -v wyb` — prints a path outside `~/.claude/plugins/cache`

The third and fourth checks are two different assertions and both must hold. `waybill` resolving into
the *new* cache version proves the plugin install took. `wyb` resolving **outside** the cache proves
the npm link is what is serving the CLI — there is no `bin/wyb` in the plugin cache at all
(contract-data.json, problem statement), so a `wyb` that resolves inside the cache, or not at all,
means the link half of the setup is gone.

One further confirmation that no command can express as a one-liner: open a Claude Code session and
run `/waybill:status`. That exercises the real `CLAUDE_PLUGIN_ROOT` path from `commands/status.md:33`
— the exact code path phase 7's overlay would break. If it prints a route, the gate is closed.

**Feedback loop**:

- **Playground**: a fresh shell (so PATH is re-resolved) plus a restarted Claude Code session.
- **Experiment**: run all four checks in one fresh shell, then `/waybill:status` in the restarted
  session. Fresh shell matters: a shell open since before the install has the old PATH entry cached
  and will happily report success from the old directory.
- **Check command**: `waybill help`

## Testing Requirements

No new automated tests. Phase 5 owns the eight-leg assertions
(`tests/legs.test.js`, `tests/inference.test.js`, `tests/review.test.js`); this phase only requires
that the existing suite is green at the commit being tagged.

### Manual Testing

- [ ] `main` contains phase 5, working tree clean, release cut from `main`
- [ ] `node --test tests/` exits 0 **before** the release commit is cut
- [ ] `node bin/waybill help` (working tree) lists eight legs with `review` between `execute` and `cleanup`
- [ ] Release diff touches exactly `.claude-plugin/plugin.json` and `package.json`, two changed lines
- [ ] The two `version` strings are byte-identical
- [ ] Release commit body lists merged PRs since the last release and states the breaking route change
- [ ] Release PR merged, `v<version>` tag pushed and pointing at the merge commit on `main`
- [ ] **Human**: `tinetti/claude-plugins` updated and pushed; publish confirmed by the human
- [ ] **Human, Claude Code UI**: `/plugin marketplace update tinetti`
- [ ] **Human, Claude Code UI**: `/plugin install waybill@tinetti`
- [ ] Claude Code session restarted after install
- [ ] `ls ~/.claude/plugins/cache/tinetti/waybill/` shows the new version directory
- [ ] In a **fresh shell**: `waybill help` names 8 legs
- [ ] In a fresh shell: `command -v waybill` resolves inside the new cache version, not `0.3.1`
- [ ] In a fresh shell: `command -v wyb` prints a path outside `~/.claude/plugins/cache`
- [ ] `/waybill:status` in a restarted Claude Code session prints a route (exercises `CLAUDE_PLUGIN_ROOT`)
- [ ] No credential value appeared in any command, log, PR body, file, or transcript
- [ ] **Only now** may phase 7 write `~/.waybill/bookings`

## Validation Commands

```bash
# Pre-release gate — the only automated verification this repo has. ~173s, run once in Step A
# before the release PR is opened. Not an inner loop; see Feedback Strategy.
node --test tests/

# Inner loop — seconds. The two version strings agree, and the route still renders
node -p "[require('./package.json').version, require('./.claude-plugin/plugin.json').version]"
node bin/waybill help

# Post-install confirmation (fresh shell, after the human-gate install steps)
waybill help
command -v waybill
command -v wyb
```

This repository has **no lint, no typecheck, no build step, and no justfile**. `package.json` declares
exactly one script, `"test": "node --test tests/"`. There is nothing else to run, and this spec does
not invent commands to fill the template's empty slots.

## Rollout Considerations

- **Feature flag**: none. There is no flag mechanism, and the route is not flaggable — `LEGS` is the
  route. The gate itself is the control: the overlay does not get written until the install is
  confirmed.
- **Blast radius**: this release changes the route for *every* plugin user, not just this laptop.
  Anyone on the marketplace entry moves from seven legs to eight on their next `/plugin install`.
  That is the intended outcome, and it is why the semver step and the commit body matter.
- **Monitoring**: none automated. The observable signal is `waybill help` and `/waybill:status` on
  this machine.

### Rollback plan

Rollback is genuinely cheap here, and knowing that is what makes the gate safe to attempt.

1. **The previous cache version directory still exists.** `/plugin install` writes a new
   `~/.claude/plugins/cache/tinetti/waybill/<version>/` directory alongside the old one — the
   `0.3.1` directory on this machine has survived every release since. If the new install is broken,
   the previous version's tree is still on disk and still runnable directly
   (`node ~/.claude/plugins/cache/tinetti/waybill/<old>/src/cli.js status`) for diagnosis. Do not
   hand-edit or hand-delete cache directories to "fix" an install; reinstall instead.
2. **Pin the marketplace back.** The human reverts the `tinetti/claude-plugins` entry to the previous
   version and pushes, then re-runs `/plugin marketplace update tinetti` and
   `/plugin install waybill@tinetti`. That is the supported path back, and it restores every other
   machine too, not just this one.
3. **The repo side reverts as one commit.** The release commit is two lines in two files; `git revert`
   of it is the whole undo. A tag pointing at a reverted release should be deleted and re-cut rather
   than moved.
4. **The CLI half is independent.** If only `wyb`/`waybill` on PATH is wrong, re-run `npm link` from
   the clone — no marketplace involvement, no plugin reinstall.
5. **If an overlay has already been written and every `/waybill:*` command is throwing
   `unknown leg`** (the failure this phase exists to prevent): the fastest recovery is to move
   `~/.waybill/bookings` aside, or unset `git config --global waybill.bookingsdir`, which returns the
   machine to stock bookings immediately without touching the plugin. Keep this in mind during
   phase 7 — it is the escape hatch if the ordering is violated.

## Open Items

- [ ] Whether the project leaves 0.x for this release (major) or takes the widest 0.x step (minor
      carrying a breaking change) — a human call, argued in the release commit body, and deliberately
      not decided here.
- [ ] Whether `tinetti/claude-plugins` needs a local clone for the human to update it, or is edited
      through the GitHub UI. Not blocking; either way the human performs it.

---

_This spec is ready for execution. It is a gate: do not start phase 7 until every box in Manual
Testing is ticked, and especially not until `waybill help` names eight legs._
