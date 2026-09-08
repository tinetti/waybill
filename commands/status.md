---
description: "Where this docket stands, without the waybill"
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

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next` and `start`: falling back
to the operator's cwd points the command at `./src/cli.js` in *their* repository, where it does not
exist, and hands the model a raw node MODULE_NOT_FOUND dump in place of the block below.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" status; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

Then stop. Do not infer what the next leg's command would be and do not offer to run it: `status`
answers "where am I", and `/waybill:next` is the command that answers "what now". Guessing the
waybill here would bypass the booking that owns it.

If the block reports `IGNORED BY GIT`, mention that those papers will not survive a commit, and
leave editing `.gitignore` to me.
