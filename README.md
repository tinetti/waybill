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
/clear
/model opus
/effort high
/spec:propose add-session-handover

  Scaffold the change: proposal, spec deltas, design notes, and a tasks list. …
```

The NEXT block is the handover itself rather than a description of it: each command sits on its own
line, to be pasted on its own, in order. They cannot share one paste — Claude Code submits a
multi-line paste as a single input, so `/model` would take the lines after it as its argument.

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

That gives you `/waybill:new`, `/waybill:bay`, `/waybill:next`, `/waybill:status`, and the four
routing commands as **`/waybill:spec:{explore,propose,apply,archive}`**. Claude Code namespaces
every plugin command under the plugin name, and a `commands/` subdirectory becomes one more segment
— measured against a scratch install, `/waybill:spec:propose` resolves and `/waybill:propose` is an
unknown command.

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
| `waybill new` | `/waybill:new` | Begin an effort: the first leg's waybill, and nothing else |
| `waybill bay <branch>` | `/waybill:bay [<branch>]` | Cut the branch and its bay, then hand off the leg that follows |
| `waybill bay --list` | `/waybill:bay` with no branch | The branches a bay could be cut or reopened for, and nothing changed |
| `waybill next [<branch>]` | `/waybill:next` | Where this docket stands, and the waybill for the next leg |
| `waybill status` | `/waybill:status` | Where this docket stands, or the whole fleet from the trunk |

The **docket** is the branch. It is open whenever a branch other than the default one is checked
out, and there is no state file to keep in step: git already tracks what is in flight. The
**waybill** is issued fresh for one leg: the command, the model, and the prose the next session
needs, and nothing that outlives that session. `waybill next` prints a waybill; the docket is
already in the repository.

`waybill new` is the entry point, and the one verb asked before there is a docket to be about: it
prints the first leg's waybill and stops, because a terminal has no session to run anything in.
`/waybill:new` shows that same block and then runs the command it names, in that session and at the
model and effort the booking asked for — a session cannot switch its own model, so the command file
declares them and the test suite pins them against the booking.

Standing on the default branch, no docket is open — so both commands answer for the repository
instead of for the branch you are on. A **docket in flight is a bay on disk**: that is already the
tool's own definition, since the bay is cut at leg 2 and removed at leg 7, and it is the definition
that gives every docket a directory, so each one's position is read from its own working tree.
Ideating comes before the docket exists — the papers it produces travel as the branch's first diff
once `waybill bay <branch>` cuts the bay.

`waybill status` on the trunk lists them:

```
main · 2 dockets open

DOCKETS:
  feat/session-handover · leg 5 of 7 (specs)
  fix/stamp-scoping     · leg 6 of 7 (execute, 4 of 9 tasks)
```

**`waybill next` exits 0 if and only if it issued exactly one waybill.** With one bay open it
issues that docket's waybill and names the `cd` that moves you into it. With none, and with more
than one, no waybill was issued, so both exit 2 — one condition for a script to test rather than
three:

```
waybill: no dockets open — begin one with `waybill new`
```

With more than one it prints the same list under `SELECT A DOCKET:` and names the way to pick:
`waybill next <branch>` resolves that branch's bay from anywhere — the trunk, or another bay — and
says so when the branch has no bay at all. Both non-zero cases print to stdout, not stderr, because
they are an answer about the repository rather than a complaint — the stream a terminal caller reads,
and the one `--json` writes its object to.

Inside a session the commands run `node … 2>&1 || echo "waybill: exited $?"`, because Claude Code
discards a command file whose `` ! `` line exits non-zero, Task and all. The marker line
`waybill: exited N` appears only when the CLI exited non-zero, and tells the session no waybill was
issued.

`waybill next --json` prints the raw resolved state for scripts, and an object in the non-zero cases
too — `{"error": …, "dockets": [{"branch", "path", "leg", "index"}]}` — so the fleet is machine-
readable without a second surface. `waybill next --markdown` and `waybill bay --markdown` print the
same waybill as markdown instead, the position in a `text` fence and each command — the bay's `cd`
included — in a fence of its own, so a chat client gives every one its own copy button.
`/waybill:next` and `/waybill:bay` ask for that form; `--json` and `--markdown` cannot be combined.
`waybill status` takes no options; the fleet view is chosen by where you stand, not by a flag.

`waybill bay` needs exactly one branch; a bare `waybill bay` is a usage error. `waybill bay --list`
is what to ask instead when you have not decided: every local branch but the trunk (and whatever the
main checkout has checked out, which git will not give a bay), the ones without a bay first. It
exits 0 and changes nothing, even when the only answer is `no branches besides main`:

```
SELECT A BRANCH:
  feat/bay-picker     · no bay · tmux window "bay picker"
  fix/stamp-scoping   · no bay
  ideation/fleet-view · bay at /repo/.claude/worktrees/waybill-ideation-fleet-view

  waybill bay <branch>
```

The list is ordered by what your terminal says you are working on. A branch the **tmux window**
names comes first, then branches named in your recent **shell history** (`git checkout -b`,
`git switch`, `git worktree add -b`, `waybill bay` and the like, in the last 500 lines of
`$HISTFILE`, `~/.zsh_history` or `~/.bash_history`), then the **tmux session** name, then the pane
title — matched on the whole name or its last segment, ignoring case, spaces, `-` and `_`. Every
promoted row says why. When nothing existing matches but the tmux window has a real name, a
`feat/<window>` branch is suggested first, marked `new`. Each source is read best-effort and skipped
silently when it is not there; iTerm tab titles are not read, since that needs an `osascript`
permission prompt and answers for the frontmost window rather than yours. `/waybill:bay` with no
argument runs `--list`, offers the first four rows as a menu, and cuts the one you choose.

All four warn when a paper directory is git-ignored in the host repository — `next` and `status`
before their position block, `new` in the leg-1 waybill it prints, and `bay` in the waybill it
prints after cutting the bay. That matters more than it sounds: untracked papers are destroyed when
the bay is removed at the cleanup leg. In the fleet view each warning is prefixed with the branch it
came from, so a docket that cannot read its own diff is named rather than blamed on the repository
at large.

### Where bays live

A bay is a git worktree, and by default it goes in `.claude/worktrees/` inside the main checkout —
`<main>/.claude/worktrees/<checkout>-<branch>`, with every `/` in the branch name flattened to `-`.
Waybill adds that directory to `.git/info/exclude` on the first `bay`, never to the tracked
`.gitignore`: the host repository's ignore file belongs to the host, and a nested worktree that is
not ignored is staged as an embedded repository by `git add -A`.

Point it somewhere else, in order of precedence:

| Where | Example |
| --- | --- |
| `--bay-dir <path>` on `bay` | `waybill bay feat/thing --bay-dir ../bays` |
| `WAYBILL_BAY_DIR` | `WAYBILL_BAY_DIR=~/bays waybill bay feat/thing` |
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
| 7 | nothing — `/waybill:cleanup` ships with Waybill | it assumes the request was already merged on the forge and verifies that with plain git, so there is no `gh`, no `glab`, and no auth to arrange |

Leg 7 is the one most likely to be wrong for you anyway. `/waybill:cleanup` never merges — it
retires a branch someone else already merged. If your habit is to merge from the terminal, rebook
that leg; the overlay below is how, and `examples/mar-cleanup.md` is a worked one.

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
handover: transfer              # transfer (a /clear first) | through (none) | else: shown as-is
argument: change-id             # change-id (default) | branch | none
stampPath: openspec/changes/*/tasks.md   # at least one stamp is required
stampCmd: test -f Makefile               # judged by exit code
---
Everything below the fence is the waybill text, rendered verbatim.
```

The NEXT block lists `/model`, then `/effort` when the booking declares one, then the command.
`handover` decides what comes ahead of them: `transfer` adds a leading `/clear` command, `through`
adds nothing, and any other value is printed verbatim above the commands, so a booking can ask for
a handover Waybill never anticipated.

`handover: transfer` is not an apology. Handlers are amnesiac by design: each session starts empty,
reads one waybill, runs one leg, and leaves its mark on the docket. `/clear` between legs is the
premise of the tool, not a limitation it works around — the paperwork carries the change, so the
handler never has to.

### An overlay, rather than an edit

Editing `bookings/` in place works, but not for long: installed as a plugin, Waybill lives in
`~/.claude/plugins/cache/`, and the next update overwrites whatever you changed there. Point
Waybill at a directory of your own instead. Bookings found in it replace the shipped booking for
the leg they name, and every other leg keeps its default:

| Where | Example |
| --- | --- |
| `WAYBILL_BOOKINGS_DIR` | `WAYBILL_BOOKINGS_DIR=./alt-bookings waybill next` |
| `git config waybill.bookingsdir` | `git config --global waybill.bookingsdir ~/.config/waybill/bookings` |

So keeping `/mar` as your cleanup carrier, on every repository on this machine, is three commands:

```
mkdir -p ~/.config/waybill/bookings
cp examples/mar-cleanup.md ~/.config/waybill/bookings/cleanup.md
git config --global waybill.bookingsdir ~/.config/waybill/bookings
```

Set it without `--global` to rebook a leg for one repository — a repository whose branches are
finished by a script the rest of your work has never heard of. There is no CLI flag and no default
directory, on purpose: an overlay is a standing decision about how a machine or a repository
finishes work, not something retyped per invocation, and a conventional path would have Waybill
reading a directory nobody configured. A relative setting resolves against the checkout you are
in — in a bay, that is the branch's own answer. `git config` reads the value as a path, so a
leading `~` expands. A directory that does not exist yet is simply an empty overlay, not an error.

A leg is replaced **whole**, never merged key by key. A booking is one statement — the command, the
model, and the stamp that says when that command is finished — and a per-key merge would let you
change the command while silently keeping a stamp written for the command you replaced. An overlay
binding a leg that does not exist, or two of its own files claiming one leg, is an error, exactly as
it is in `bookings/`.

Two worked examples ship in `examples/`:

| File | Rebooks | To |
| --- | --- | --- |
| `mar-cleanup.md` | `cleanup` | `/mar`, which merges the request as well as cleaning up after it |
| `superpowers-execute.md` | `execute` | `superpowers:subagent-driven-development` instead of `/spec:apply` |

They live in `examples/` rather than in `bookings/` on purpose. Two bookings claiming one leg is a
hard error — Waybill refuses to guess which one you meant — so an alternative that shipped beside
the booking it replaces would break every command on install.

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
