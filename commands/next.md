---
description: "Waybill — where this docket stands, and the waybill for the next leg"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), AskUserQuestion
---

<!--
No `model:` or `effort:` frontmatter on purpose. The waybill below names the model and effort for the
*next* session; declaring one here would silently override the booking's choice with this session's.

`AskUserQuestion` is on the `allowed-tools` line, and it has to be on the line rather than mentioned
here: the list is restrictive, so a tool left off it is not merely unmentioned but unavailable, with
nothing raised to explain the silence. The Task section has exactly one case that asks anything — a
trunk with more than one docket open — and undeclared, that prompt simply never happens, leaving the
selection block on screen and the session looking as though it had ignored its own instruction.
-->

# Waybill: next

<!--
`${CLAUDE_PLUGIN_ROOT}` bare, in both clauses, and never `${CLAUDE_PLUGIN_ROOT:-}`. It is not an
environment variable: Claude Code rewrites the literal out of this line before bash is handed it,
and the rewrite matches `${CLAUDE_PLUGIN_ROOT}` or a bare `$CLAUDE_PLUGIN_ROOT` and nothing else.
Give it a `:-` default and the rewrite passes over it, bash finds no such variable, the path
collapses to `/src/cli.js`, and the test below reports an unset root on a plugin that is installed
and working. Guarding the guard is what breaks it. `tests/commands.test.js` holds the spelling.

No `:-.` fallback either: falling back to the operator's cwd points the command at `./src/cli.js`
in *their* repository, where it does not exist, and hands the model a raw node MODULE_NOT_FOUND
dump in place of the block below. One line of guidance is the honest failure.

`2>&1 || echo "waybill: exited $?"` because Claude Code discards a command file whose `!` line exits
non-zero — the Task below never renders — and `next` exits 2 on a trunk with no docket or several.
The CLI's exit code stays 2 for terminal callers; here it is folded into a final marker line.
`tests/bang-lines.test.js` runs this line.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

It is markdown, with each command in a fence of its own so that each gets its own copy button: show
it as markdown, and do not wrap it in a further fence.

Then stop. Running the commands the waybill lists is the next session's job, not this one's: the
first block is `/clear` when the next leg wants a fresh session, and acting on any of them here
would spend the context the waybill is trying to hand over.

If the block ends with a line `waybill: exited N`, the CLI stopped without issuing a waybill and
that line only records its exit code. Show the block verbatim, as above, and stop — do not run a
command, and do not improvise the leg. The exception below still applies: a `SELECT A DOCKET:`
block ends with `waybill: exited 2` too, and the literal string wins.

There is exactly one exception, and it is keyed on an exact string rather than on your reading of
the situation — a verbatim rule that bends whenever a model decides it should is not a rule.
**If the block contains the literal `SELECT A DOCKET:`**, it is not a waybill at all: it is the
trunk reporting that more than one effort is in flight and that it cannot tell which one I meant.
Nothing has been handed over, so there is no context to protect and nothing to stop for. Show that
block as above, and then work these three steps.

**1. Ask me which docket.** Use `AskUserQuestion`, and offer the branch names the block itself
listed — those and no others. Do not pick one for me and do not infer it from whatever we were last
working on: a branch you invented is a branch with no bay, and step 2 will fail on it. If the fleet
is too long to present comfortably, ask in plain text rather than offering a truncated list as
though it were the whole of it.

**2. Re-run `next` against the branch I chose**, by appending it to the same command that produced
the block above:

```
node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" next --markdown <branch>
```

Not `waybill next <branch>`. That line is printed for *me* — it is what I would type in a terminal,
and it assumes a `waybill` on my PATH that a plugin install never puts there. The `allowed-tools`
line above permits `node`, not `waybill`, which is the whole reason the second invocation needs no
new permission.

**3. Show me that second block, verbatim**, on exactly the terms the first was shown, and then stop
as you would for any other waybill. The second block only: the first has done its job, and
repeating it buries the answer underneath the question that led to it.

If the re-run reports `no bay for <branch>`, that is the answer — show it verbatim and stop. Either
the bay was removed between the two commands or the branch was not one of the ones listed. Do not
prompt me a second time and do not go hunting for the bay yourself.

If the command in step 2 will not run at all, do not improvise a path to it. Say so in one line,
name the branch I chose, and show me the `waybill next <branch>` line from the block so I can run
it myself.

If the block reports `IGNORED BY GIT`, mention that those papers will not survive a commit, and
leave editing `.gitignore` to me.
