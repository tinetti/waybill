# Waybill

A single change moves through seven legs, three tool ecosystems, and at least four sessions. No tool
models the route, so every session boundary costs a manual re-orientation: which leg is this, which
command comes next, which model does it want, and does the work live in the main checkout or a bay.

Waybill is the freight forwarder. It owns no trucks — it reads the docket, decides which leg comes
next, names the carrier that runs it, and hands over the paperwork. One command answers all four
questions:

```
feat/session-handover · leg 5 of 7 (specs)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract
  ▶ specs

NEXT:
  /clear, then run:
  /spec:propose add-session-handover
  └ opus · high effort

  Scaffold the change: proposal, spec deltas, design notes, and a tasks list. …
```

There is no state file and nothing to keep in sync, because nothing is being tracked. Every leg is
judged by its **stamp** — a mark left on the docket itself: a branch, a bay, a file on disk, a
command that exits 0. Waybill reads the last stamp off repository reality, so a leg done by hand is
seen exactly as one done through the tool.

## The route

| # | Leg | Stamped by | Booked to |
| --- | --- | --- | --- |
| 1 | `ideate` | the docket being open, or any later leg being stamped | `bookings/ideation-ideate.md` |
| 2 | `bay` | the bay at the configured path — see *Where bays live* | `bookings/waybill-bay.md` |
| 3 | `refine` | `docs/ideation/*/contract-data.json` | `bookings/ideation-refine.md` |
| 4 | `contract` | `docs/ideation/*/contract.md` | `bookings/ideation-contract.md` |
| 5 | `specs` | `openspec/changes/*/tasks.md` | `bookings/openspec-specs.md` |
| 6 | `execute` | every checkbox in `tasks.md` ticked | `bookings/openspec-execute.md` |
| 7 | `cleanup` | branch merged into the default branch **and** no bay left | `bookings/waybill-cleanup.md` |

Legs 2 and 7 are wrapper-owned: Waybill stamps them from git rather than from a booking, because the
anchor and the terminus have to be relied on while everything they hand to is swappable. They still
take their command, model, and prose from a booking like every other leg.

Every path glob above — rows 3, 4 and 5 — is scoped to the docket. A file only stamps its leg when
it is also part of what this branch changed against the default branch: committed on the branch,
staged, unstaged, or untracked. Papers that shipped with an earlier change are on disk in every
worktree and stamp nothing. When Waybill cannot work out that diff at all it stamps nothing either,
and says so under `WARNINGS:` — visibly unable to tell beats invisibly wrong.

`stampCmd` bookings receive no such scoping — row 6 is the only shipped one that can ever succeed,
and it runs against the repository as it stands, so a command that greps a directory tree can still
match papers left over from history. On the default branch that no longer matters: with no docket
open, nothing is reported as stamped at all.

## Install

The two surfaces install separately, and neither one brings the other.

**Slash commands** — install the plugin:

```
/plugin marketplace add tinetti/claude-plugins
/plugin install waybill@tinetti
```

That gives you `/waybill:next`, `/waybill:start`, `/waybill:status`, and the four routing commands as
**`/waybill:spec:{explore,propose,apply,archive}`**. Claude Code namespaces every plugin command
under the plugin name, and a `commands/` subdirectory becomes one more segment — measured against a
scratch install, `/waybill:spec:propose` resolves and `/waybill:propose` is an unknown command.

The waybills for legs 5 and 6 name the **bare** `/spec:propose` and `/spec:apply`. Those names come
from `~/.claude/commands/spec/`, not from the plugin — the symlink step under *The vendored
`/spec:*` commands* is what supplies them. Install the plugin alone and legs 5 and 6 hand you a
command your session cannot resolve. If you would rather not touch `~/.claude`, the other way out is
a one-line `command:` edit in `bookings/openspec-specs.md` and `bookings/openspec-execute.md`
pointing them at the `/waybill:spec:*` names instead.

The plugin does **not** give you the `waybill` command: Claude Code clones the plugin into its own
cache and never runs npm.

**The `waybill` command** — from a clone of this repository:

```
git clone https://github.com/tinetti/waybill
cd waybill && npm link
```

`npm link` is what honours the `bin` entries, and there are two of them: `waybill` and the shorter
`wyb`, both pointing at the same shim. There are no dependencies to install; the link is the whole
step.

## Commands

| Command | Slash command | Answers |
| --- | --- | --- |
| `waybill next` | `/waybill:next` | Where this docket stands, and the waybill for the next leg |
| `waybill start <branch>` | `/waybill:start` | Cut the branch and its bay, then hand off the leg that follows |
| `waybill status` | `/waybill:status` | Where this docket stands, without the waybill |

The **docket** is the branch. It is open whenever a branch other than the default one is checked
out, and there is no state file to keep in step: git already tracks what is in flight. The
**waybill** is issued fresh for one leg: the command, the model, and the prose the next session
needs, and nothing that outlives that session. `waybill next` prints a waybill; the docket is
already in the repository.

On the default branch no docket is open, and all three commands say so and stop reporting a
position:

```
main · no docket open

NEXT:
  /clear, then run:
  /ideation:brainstorm
  └ opus · high effort
```

That is the whole trunk state: no leg strip, no completed legs, and `next --json` reports
`"docketOpen": false` with `leg: "ideate"` and empty `completed`/`skipped`. Ideating comes before
the docket exists — the papers it produces travel as the branch's first diff once
`waybill start <branch>` cuts the bay.

`waybill next --json` prints the raw resolved state for scripts. `waybill status` takes no options —
the machine-readable surface is `next --json`, and a second one would be a second thing to keep in
step.

All three warn when a paper directory is git-ignored in the host repository — `next` and `status`
before their position block, and `start` in the waybill it prints after cutting the bay. That
matters more than it sounds: untracked papers are destroyed when the bay is removed at the cleanup
leg.

### Where bays live

A bay is a git worktree, and by default it goes in `.claude/worktrees/` inside the main checkout —
`<main>/.claude/worktrees/<checkout>-<branch>`, with every `/` in the branch name flattened to `-`.
Waybill adds that directory to `.git/info/exclude` on the first `start`, never to the tracked
`.gitignore`: the host repository's ignore file belongs to the host, and a nested worktree that is
not ignored is staged as an embedded repository by `git add -A`.

Point it somewhere else, in order of precedence:

| Where | Example |
| --- | --- |
| `--bay-dir <path>` on `start` | `waybill start feat/thing --bay-dir ../bays` |
| `WAYBILL_BAY_DIR` | `WAYBILL_BAY_DIR=~/bays waybill start feat/thing` |
| `git config waybill.baydir` | `git config waybill.baydir ..` |

An absolute path is the container directory as it stands; a relative one resolves against the main
checkout, not your current directory. The directory *name* inside the container never changes, so
`git config waybill.baydir ..` reproduces the sibling layout — `<checkout>-<branch>` next to the
main checkout — exactly. A container outside the checkout is left out of `.git/info/exclude`, since
there is nothing there for git to notice.

## Prerequisites

Waybill hands off to carriers rather than reimplementing them, so the waybills name commands it does
not ship. Everything below is optional in the sense that the booking that names it can be swapped —
see *Swapping a carrier* — but a waybill pointing at a command you do not have is a dead end.

| Leg | Needs | Where it comes from |
| --- | --- | --- |
| 1, 3, 4 | the `ideation` plugin | `/plugin install ideation@tinetti` |
| 5, 6 | the `openspec` CLI, and a per-project `openspec init` | `npm i -g @fission-ai/openspec` |
| 5, 6 | the `opsx:*` commands the `/spec:*` commands invoke | written into `<project>/.claude/commands/opsx/` by `openspec init` |
| 7 | `/mar` — a personal dotfile command, not part of Waybill | `tinetti_dev_tools` (`files/home/.claude/commands/mar.md` plus the `merge-and-reset` skill), and it needs `gh`/`glab`, `jq`, and the `ExitWorktree` tool |

Leg 7's carrier is the one most likely to be wrong for you. It is a single line in
`bookings/waybill-cleanup.md`.

## Swapping a carrier

Every pluggable leg's command, model, effort, handover, and stamp live in one markdown file under
`bookings/`. Rebooking a leg is one file edit and zero changes to Waybill's source — that property
is asserted mechanically in `tests/booking-swap.test.js`.

```yaml
---
leg: execute                    # which leg this books
command: /spec:apply            # what the waybill tells the next session to run
model: opus                     # the model that leg wants
effort: high                    # optional
handover: transfer              # transfer (/clear first) | through (keep going)
argument: change-id             # change-id (default) | branch | none
stampPath: openspec/changes/*/tasks.md   # at least one stamp is required
stampCmd: test -f Makefile               # judged by exit code
---
Everything below the fence is the waybill text, rendered verbatim.
```

`handover: transfer` is not an apology. Handlers are amnesiac by design: each session starts empty,
reads one waybill, runs one leg, and leaves its mark on the docket. `/clear` between legs is the
premise of the tool, not a limitation it works around — the paperwork carries the change, so the
handler never has to.

`examples/superpowers-execute.md` is a worked alternative booking for the execute leg, pointing it at
`superpowers:subagent-driven-development` instead of `/spec:apply`. Apply it by copying it over the
booking it replaces:

```
cp examples/superpowers-execute.md bookings/openspec-execute.md
```

It lives in `examples/` rather than in `bookings/` on purpose. Two bookings claiming one leg is a
hard error — Waybill refuses to guess which one you meant — so an alternative that shipped beside the
booking it replaces would break every command on install. The swap is still one file and no source
change; it is an overwrite rather than an addition.

## The vendored `/spec:*` commands

`commands/spec/{explore,propose,apply,archive}.md` are byte-identical copies of four commands that
previously lived only in `~/.claude/commands/spec/` and were tracked in no git repository. Their
`model:`/`effort:` frontmatter *is* the model routing the OpenSpec waybills point at, which made one
disk failure the whole backup story.

**These copies are canonical, and this step is not optional if you use the OpenSpec legs as
shipped.** Installed as part of the plugin they answer to `/waybill:spec:propose`; the waybills name
`/spec:propose`, and only `~/.claude/commands/spec/propose.md` answers to that. Symlink the originals
at the vendored copies so one file serves both names and there is one source of truth — the same
arrangement `~/.claude/commands/mar.md` already uses:

```
for f in explore propose apply archive; do
  ln -sf "$PWD/commands/spec/$f.md" "$HOME/.claude/commands/spec/$f.md"
done
```

Copying instead of symlinking leaves two files that disagree about which model runs which leg, and
nothing will tell you which one won.

## Development

```
node --test tests/          # the whole suite
node --test tests/cli.test.js   # one suite
UPDATE_GOLDEN=1 node --test tests/waybill.test.js   # re-bless the rendered-output fixtures
```

Zero runtime dependencies, zero dev dependencies, no build step — `node --test` and `git` are the
entire toolchain, and `tests/commands.test.js` asserts it stays that way. Read the regenerated golden
files before committing them; that is the whole point of making regeneration explicit.
