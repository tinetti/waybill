---
description: "Where this docket stands, or the whole fleet from the trunk"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as `next`: this command reports the last
stamp, and the models named anywhere in Waybill's output belong to the bookings, not to this
session.
-->

# Waybill: status

<!--
`status` is `next` minus the NEXT block. It exists for the case where the waybill is not the
question — checking where a docket stands mid-session, or after handing one off — so that reading
the last stamp does not also re-issue an instruction the operator has already acted on.

It has two answers, and which one it gives is decided by where the operator is standing rather than
by a flag: inside a bay, that bay's own position, unchanged; on the trunk, every effort in flight,
one line per docket under `DOCKETS:`. Neither carries a waybill, and that is what makes them the
same command rather than two — `status` reports, `next` hands off.

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next` and `bay`: falling back
to the operator's cwd points the command at `./src/cli.js` in *their* repository, where it does not
exist, and hands the model a raw node MODULE_NOT_FOUND dump in place of the block below.

`2>&1 || echo "waybill: exited $?"` for the same reason as `next`: Claude Code discards a command
file whose `!` line exits non-zero, and `status` exits 2 on stderr outside a repository. Folded in
here, the refusal reaches the session and the Task below still renders.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" status 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

That holds for either answer the block can be. Inside a bay it is one docket's position; on the
trunk it is the whole fleet under `DOCKETS:`, one line per effort in flight, or a single line
saying no dockets are open. A fleet listing is a report and not a menu: do not re-sort it, do not
condense it to a count, and do not single one docket out as the interesting one.

Then stop. Do not infer what the next leg's command would be and do not offer to run it: `status`
answers "where am I", and `/waybill:next` is the command that answers "what now". Guessing the
waybill here would bypass the booking that owns it. On the trunk that carries one step further —
do not offer to run `next` for a docket in the listing, and do not ask me to choose between them.
Choosing is `/waybill:next`'s job, and it asks for itself.

If the block ends with a line `waybill: exited N`, the CLI stopped without reporting a position and
that line only records its exit code. Show the block verbatim, as above, and stop — do not run a
command, and do not improvise the answer.

If the block reports `WARNINGS`, relay them as they are printed. On the trunk each line already
names the branch it came from, so there is nothing left for you to attribute — re-attributing them,
or guessing which working tree a warning belongs to, is how a warning ends up filed against the
wrong docket.

If the block reports `IGNORED BY GIT`, mention that those papers will not survive a commit, and
leave editing `.gitignore` to me.
