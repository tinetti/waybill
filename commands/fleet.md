---
description: "Waybill — every open docket in every repository at or below here"
argument-hint: "[--depth <n> — how many directory levels below here to search; the default is 4, and it only applies outside a repository]"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as `status` and `next`: this command
reports where things stand, and the models named anywhere in Waybill's output belong to the
bookings, not to this session.

`fleet` is `status` widened to the whole machine. `status` on the trunk lists this repository's
dockets one line each; `fleet` lists every open docket in every repository at or below the working
directory, with a progress bar, how long ago each was opened, how long it has sat untouched, which
sibling it was cut from, and — where tmux and ps can be read — which pane is sitting in its bay and
what is running there.

Both answers are a report and not a menu, and for the same reason: choosing what to advance is
`/waybill:next`'s job, and it asks for itself.

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next`, `bay` and `status`:
falling back to the operator's cwd points the command at `./src/cli.js` in *their* repository, where
it does not exist, and hands the model a raw node MODULE_NOT_FOUND dump in place of the block below.

The argument is passed only when there is one, the way `bay.md` and `next.md` route theirs: an empty
`"$ARGUMENTS"` would reach the CLI as a positional argument named nothing, which `fleet` rejects
with exit 2.

It is passed *unquoted*, which is the one place this command differs from those two. Their argument
is a single branch name, and quoting is what keeps a name with a space in it whole. This one is
`--depth 2` — a flag and its value, two words — and `"--depth 2"` would arrive as a single argument
the parser has never heard of. `fleet` accepts no positional argument at all, so there is no branch
name here for word-splitting to break apart.

`2>&1 || echo "waybill: exited $?"` for the same reason as the other four: Claude Code discards a
command file whose `!` line exits non-zero, and `fleet` exits 2 on stderr for a bad `--depth`.
Folded in here, the refusal reaches the session and the Task below still renders.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then if [ -z "$ARGUMENTS" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" fleet 2>&1 || echo "waybill: exited $?"; else node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" fleet $ARGUMENTS 2>&1 || echo "waybill: exited $?"; fi; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs, same spacing. Do not
summarise it, re-word it, re-order it, or add commentary of your own. It is already the whole
answer, and it is a table: every column is aligned to the character, and re-flowing it destroys the
one property that makes it readable. Show it inside a fenced code block so that alignment survives.

Do not re-sort the rows. They are ordered deliberately — repositories by their most-neglected
docket, and dockets within a repository most-idle first, with stacked branches nested under the one
they were cut from in dependency order rather than by age. Re-sorting throws away the answer.

Do not fill in a blank. A `–` means waybill looked and found nothing there. A column that is absent
entirely means tmux or `ps` could not be read at all, and guessing what might be running in a pane
nobody could see is exactly the false claim the missing column exists to avoid.

Then stop. Do not infer what any docket's next leg would be and do not offer to run it: `fleet`
answers "what is in flight", and `/waybill:next` is the command that answers "what now". Do not
single one docket out as the interesting one, and do not ask me to choose between them. Choosing is
`/waybill:next`'s job, and it asks for itself.

If the block ends with a line `waybill: exited N`, the CLI stopped without reporting a fleet and
that line only records its exit code. Show the block verbatim, as above, and stop — do not run a
command, and do not improvise the answer.

If the block reports `WARNINGS`, relay them as they are printed. Each line already names the
repository it came from, so there is nothing left for you to attribute.
