# The reference

The back of the clipboard. Tables, not stories. Find your row, read it, get back to work.

## Slash commands

What you can type in a Claude Code session once the plugin is in.

| Command | What it does | Argument |
| --- | --- | --- |
| `/waybill:new` | Shows leg 1's waybill, then runs the command it names in this session | none |
| `/waybill:bay` | Cuts the branch and its bay, then hands off the next leg | `[<branch>]`; leave it off to pick from a list of branches |
| `/waybill:next` | Where this docket stands, and the waybill for the next leg. Given a leg, it moves the session into that docket's bay and runs the leg | `[<branch>[/<leg>]]`, e.g. `feat/thing/execute` |
| `/waybill:status` | Where this docket stands, or the whole fleet from the trunk | none |
| `/waybill:help` | The route, the words and the four verbs on one screen | none |
| `/waybill:cleanup` | Checks with plain git that the branch is merged, then removes its bay and deletes the branch | `<branch>` |
| `/waybill:spec:explore` | OpenSpec explore: think an idea through before committing to it | what to explore |
| `/waybill:spec:propose` | OpenSpec propose: scaffold the proposal, spec deltas, design and `tasks.md` | the change to propose |
| `/waybill:spec:apply` | OpenSpec apply: implement `tasks.md` | the change id, e.g. `add-thing` |
| `/waybill:spec:archive` | OpenSpec archive: fold completed deltas into the living spec | the change id |

The plugin files the four OpenSpec commands under `/waybill:spec:*`. The waybills for legs 5 and 6
name the bare `/spec:propose` and `/spec:apply`, which only resolve from `~/.claude/commands/spec/`.
Symlink those files at this repository's `commands/spec/` copies, as described in
[the vendored `/spec:*` commands](../../README.md#the-vendored-spec-commands). The alternative is
to rebook those two legs to the `/waybill:spec:*` names.

## The CLI

The `waybill` command, also installed as `wyb`. Both come from `npm link` in a clone of this
repository.

| Command | What it does |
| --- | --- |
| `waybill new` | Prints the first leg's waybill and nothing else |
| `waybill bay <branch>` | Creates the branch and its bay, then hands off the next leg |
| `waybill bay --list` | Lists the branches a bay could be cut or reopened for, and changes nothing |
| `waybill next [<branch>[/<leg>]]` | Where this docket stands, and the waybill for the next leg |
| `waybill status` | Where this docket stands without the waybill, or the whole fleet on the trunk |
| `waybill help` | The route, the words and the four verbs on one screen |

| Flag | Applies to | What it does |
| --- | --- | --- |
| `--json` | `next` | Prints the raw resolved state as JSON instead of the waybill |
| `--markdown` | `next`, `bay` | Prints the waybill as markdown, with each handover command in its own fence |
| `--list` | `bay` | Lists candidate branches instead of cutting a bay |
| `--bay-dir <path>` | `bay` | Where bays are created; overrides `WAYBILL_BAY_DIR` and `waybill.baydir` |
| `--help` | any | Prints the usage |

`--json` and `--markdown` cannot be combined. `waybill next` exits 0 only when it issued exactly
one waybill. With no docket open, or more than one to choose from, it exits 2.

## Booking keys

Each booking is a markdown file: YAML frontmatter, then the text the waybill prints for that leg.

| Key | Required | Meaning |
| --- | --- | --- |
| `leg` | yes | The leg this booking is for: `ideate`, `bay`, `refine`, `contract`, `specs`, `execute` or `cleanup` |
| `command` | yes | The carrier command the waybill tells the next session to run |
| `model` | yes | The model for that session, printed as `/model <model>` |
| `effort` | no | The effort level, printed as `/effort <effort>` |
| `handover` | no | `transfer` puts `/clear` first; `through` adds nothing; any other value is printed as it is |
| `argument` | no | What is appended to `command`: `change-id` (the default), `branch` or `none` |
| `stampPath` | no | A path glob; the leg is stamped when a matching file is part of this branch's changes |
| `stampCmd` | no | A shell command; the leg is stamped when it exits 0 |

A booking needs at least one of `stampPath` and `stampCmd`. This is the shipped
`bookings/ideation-refine.md`:

```markdown
---
leg: refine
command: /ideation:ideation
model: opus
effort: high
handover: transfer
stampPath: docs/ideation/*/contract-data.json
---
Run the ideation interview. Push on scope, sequencing, and the decisions worth recording as
rejected, and keep going until the shape of the work is settled rather than merely described.
The interview and the contract are one session's work; carry straight on into the contract leg.
```

## Environment and git config

Where bays go. The first one that is set wins:

| Precedence | Setting | Example |
| --- | --- | --- |
| 1 | `--bay-dir <path>` on `bay` | `waybill bay feat/thing --bay-dir ../bays` |
| 2 | `WAYBILL_BAY_DIR` | `WAYBILL_BAY_DIR=~/bays waybill bay feat/thing` |
| 3 | `git config waybill.baydir` | `git config waybill.baydir ..` |
| 4 | the default | `.claude/worktrees` inside the main checkout |

A relative path resolves against the main checkout, not the current directory. Each bay is named
`<checkout>-<branch>` inside that directory. Details are in
[Where bays live](../../README.md#where-bays-live).

Where overlay bookings come from. The first one that is set wins:

| Precedence | Setting | Example |
| --- | --- | --- |
| 1 | `WAYBILL_BOOKINGS_DIR` | `WAYBILL_BOOKINGS_DIR=./alt-bookings waybill next` |
| 2 | `git config waybill.bookingsdir` | `git config --global waybill.bookingsdir ~/.config/waybill/bookings` |

With neither set, only the shipped bookings are used. An overlay booking replaces the shipped
booking for its leg whole. Details are in
[An overlay, rather than an edit](../../README.md#an-overlay-rather-than-an-edit).

## Prerequisites

Waybill names carriers it doesn't ship. A waybill that points at a command you don't have is a dead
end, so check this table before you ride.

| Carrier namespace | Legs | Needs | Where it comes from |
| --- | --- | --- | --- |
| `ideation` | 1 ideate, 3 refine, 4 contract | the `ideation` plugin | `/plugin install ideation@tinetti` |
| `spec` | 5 specs, 6 execute | the `openspec` CLI, a per-project `openspec init`, and the bare `/spec:*` commands | `npm i -g @fission-ai/openspec`; `openspec init` writes the `opsx:*` commands into `<project>/.claude/commands/opsx/`; the symlink step above supplies `/spec:*` |
| `waybill` | 2 bay, 7 cleanup | nothing beyond the waybill plugin | `/waybill:bay` and `/waybill:cleanup` ship with it; cleanup uses plain git, so no `gh`, `glab` or auth |

Every one of these can be rebooked. See [Prerequisites](../../README.md#prerequisites) in the
README.
