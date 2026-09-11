---
description: "Waybill — cut the branch and its bay, then hand off the next leg"
argument-hint: "[branch — the branch to cut a bay for, e.g. feat/thing; omit it to pick from a list]"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion
---

<!--
No `model:` or `effort:` frontmatter on purpose. The waybill below names the model and effort for the
*next* session; declaring one here would silently override the booking's choice with this session's.

`AskUserQuestion` is on the `allowed-tools` line for the reason `next.md` gives: the list is
restrictive, so a tool left off it is unavailable rather than merely unmentioned, and the branch
menu below would simply never appear. Nothing else was added — the second invocation the menu leads
to is `node`, which the line already permits.
-->

# Waybill: bay

<!--
The branch name is interpolated into the command rather than handed to the model to run, which is
what keeps the output below verbatim rather than paraphrased. Two things make that safe enough to
choose deliberately: the argument is quoted, and `allowed-tools` pre-approves only `node`, so
anything that broke out of the quoting would no longer match and would stop for approval. The CLI
then rejects the name outright with `git check-ref-format --branch` before a single git call
mutates anything.

An empty argument is routed to `bay --list` instead, which changes nothing and prints a
`SELECT A BRANCH:` menu for the Task below to offer. It is routed here, in the shell, rather than
by teaching the CLI that `bay ""` means "list": a bare `waybill bay` typed in a terminal is still a
usage error, and should stay one — the menu is only useful where there is a session to ask with.

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next`: falling back to the
operator's cwd points the command at `./src/cli.js` in *their* repository, where it does not exist.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then if [ -z "$ARGUMENTS" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" bay --list; else node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" bay --markdown "$ARGUMENTS"; fi; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

It is markdown, with each command in a fence of its own so that each gets its own copy button: show
it as markdown, and do not wrap it in a further fence.

The `cd` command is the one instruction in Waybill meant for my shell rather than for a session: do not
run it, and do not offer to. Nothing you do here can move me into the new bay — that is why the
path is printed.

Then stop. Running the commands the waybill lists is the next session's job, not this one's: the
first block is `/clear` when the next leg wants a fresh session, and acting on any of them here
would spend the context the waybill is trying to hand over.

If the block reports `IGNORED BY GIT`, mention that those papers will not survive a commit, and
leave editing `.gitignore` to me.

### When I named no branch

The exception to all of the above is keyed on exact strings, not on your reading of the situation.
If the block contains the literal `SELECT A BRANCH:`, or begins `no branches besides`, it is not a
waybill: I ran `/waybill:bay` without a branch, nothing has been created, and there is no context to
protect yet. Do not show that block; ask instead, in these three steps.

**1. Ask me which branch.**

- **`SELECT A BRANCH:`** — call `AskUserQuestion` with one question, "Which branch should get a
  bay?", and one option per listed branch, **in the order listed** and at most the first four. The
  label is the branch name exactly as printed. The description is `no bay yet — cuts one` for a row
  marked `no bay`, `new branch — cuts it and its bay` for a row marked `new`, and
  `bay exists — prints its cd line` for a row marked `bay at …`. If the **first** row carries a
  reason after its status (`· tmux window "…"`, `· shell history`, and so on), append
  ` (Recommended)` to that one label, and only that one: the reason is the CLI saying why it ranked
  that row first. The question always has an automatic "Other", which is how I type a branch that
  is not listed.
- **Only one branch listed** — `AskUserQuestion` needs at least two options, so add a second one
  after it: label `A different branch`, description `type a new branch name`. If I pick it, ask me
  for the name in plain text.
- **`no branches besides …`** — there is nothing to offer. Ask me in plain text for the name of the
  branch to cut, and do not suggest one of your own.

Do not invent a branch, and do not pick one for me from whatever we were last working on.

**2. Run `bay` for the branch I chose**, with the same `node` path the block above ran:

```
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" bay --markdown '<branch>'
```

Strip any ` (Recommended)` suffix first — it is a label, not part of the name. Wrap the name in
single quotes exactly as shown. If the name I gave contains a single quote itself, do not try to
escape it: say it cannot be used as given and ask me again. Not `waybill bay <branch>`: that line is
printed for *me*, and assumes a `waybill` on my PATH that a plugin install never puts there.

**3. Show me that second block**, on exactly the terms at the top of this Task — **verbatim**, the
`cd` command left for me, and then stop. If it fails instead, show its error verbatim and stop; do not
retry with a different name unless I give you one.
