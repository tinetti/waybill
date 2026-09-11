---
description: "Waybill — the route, the words, and the four verbs"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as `next` and `status`: the models the
page names belong to the bookings, not to this session.
-->

# Waybill: help

<!--
`help` is the reference page: the from-zero walkthrough, the route as the bookings in force define
it, the words, and the verbs. It reports configuration and never position, so there is no docket to
be about and no waybill to hand off — the page is the same on the trunk, in a bay, or outside any
repository.

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next`, `bay` and `status`:
falling back to the operator's cwd points the command at `./src/cli.js` in *their* repository, where
it does not exist, and hands the model a raw node MODULE_NOT_FOUND dump in place of the page below.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" help 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

Then stop.
