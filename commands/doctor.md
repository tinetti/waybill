---
description: "Can this machine run the route: every prerequisite, with its fix"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as `status` and `help`: this command
reports the machine, and the models named anywhere in Waybill's output belong to the bookings, not
to this session.
-->

# Waybill: doctor

<!--
`doctor` answers a question none of the other verbs do: not "where does this docket stand" but "can
this machine run the route at all". It calls no `repoRoot`, like `help` — it reports configuration
rather than position, and must answer on a machine with no checkout in sight.

It is a report, never a repair. It writes no file, creates no directory, and runs no mutating
subprocess; every subprocess it spawns is a version or status query. It reads *exit codes* from the
forge CLIs and never relays their output, so no token can reach the terminal.

No `:-.` fallback on `CLAUDE_PLUGIN_ROOT`, for the same reason as `next`, `bay`, `status` and
`help`: falling back to the operator's cwd points the command at `./src/cli.js` in *their*
repository, where it does not exist, and hands the model a raw node MODULE_NOT_FOUND dump in place
of the report below.

`2>&1 || echo "waybill: exited $?"` is load-bearing here more than anywhere else. Claude Code
discards a command file whose `!` line exits non-zero, and `doctor` exits 1 precisely when it has
something to say — without the wrapper the command would be silent in exactly the case it exists
for.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" doctor 2>&1 || echo "waybill: exited $?"; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own. It is already the whole answer.

Do not run any `fix:` line, and do not offer to. Doctor is a diagnosis; I run the fix. Several of
the remediations mutate state outside any repository — a plugin update, an `npm link`, a global git
config, symlinks into `~/.claude` — which is why there is no `--fix` and never will be.

Do not edit `~/.claude`, `~/.waybill`, or any configuration file on my behalf, whether or not a row
above names one.

If the block ends with a line `waybill: exited N`, that line records the exit code and nothing
more. Show it and stop — do not run a command, and do not improvise the answer.

`info` rows are not problems. An absent bookings overlay in particular is a healthy steady state on
a personal machine — do not offer to create one.
