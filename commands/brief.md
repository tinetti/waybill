---
description: "Waybill — write the brief the next leg's session will read"
argument-hint: "[branch — the docket to brief, e.g. feat/thing; omit it inside its bay]"
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), Write
---

<!--
No `model:` or `effort:` frontmatter on purpose. The brief is written by whichever session still
holds the conversation it summarises — switching model here would be switching away from the one
thing that knows what was said.

`Write` is on the `allowed-tools` line, and it has to be on the line rather than mentioned here: the
list is restrictive, so a tool left off it is not merely unmentioned but unavailable. Undeclared,
the CLI would name a path and nothing would ever be written to it, with no error to explain why.
Nothing else is declared, because nothing else is needed: the CLI decides where the brief goes and
makes the directory ready, and this session only authors the page.
-->

# Waybill: brief

<!--
`${CLAUDE_PLUGIN_ROOT}` bare, in both clauses, and never `${CLAUDE_PLUGIN_ROOT:-}`, for the reason
`next.md` records: Claude Code rewrites the literal out of this line before bash sees it, and a
`:-` default is the one spelling the rewrite passes over.

`2>&1 || echo "waybill: exited $?"` because Claude Code discards a command file whose `!` line exits
non-zero, and `brief` exits 2 when it cannot tell which docket is meant. `NOTHING TO BRIEF:` exits
0 — it is an ordinary answer, not a refusal — so it never carries the marker.
`tests/bang-lines.test.js` runs this line.

The argument is quoted and passed only when there is one, the way `next.md` routes its own: an empty
`"$ARGUMENTS"` would reach the CLI as a branch named nothing.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then if [ -z "$ARGUMENTS" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" brief 2>&1 || echo "waybill: exited $?"; else node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" brief "$ARGUMENTS" 2>&1 || echo "waybill: exited $?"; fi; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

The block above is the CLI's answer to one question: where does the brief for this docket's next
leg go, and what should it say. Act on exactly one of the three cases below, keyed on the literal
at the start of a line — never on your own reading of whether a brief is due.

**If the block ends with a line `waybill: exited N`**, the CLI could not tell which docket was
meant. Show the block verbatim and stop. Write nothing.

**If the block begins `NOTHING TO BRIEF:`**, the next leg takes no brief, or there is no next leg.
Relay that one line and stop. Write nothing. This is an ordinary answer, not a failure.

**If the block carries `WRITE TO: <path>`**, write the brief:

1. Use `Write` to create one file at exactly `<path>` — the path as printed, nothing derived from
   it. The directory already exists. A brief already at that path is replaced: I asked for a new
   one.
2. Make it a single self-contained HTML page: a `<title>`, a short heading naming the leg from the
   `BRIEF FOR:` line, and plain sections. No external stylesheet, script, font or image — the next
   session reads the file, it does not render a site.
3. Let the `GUIDANCE:` line decide what the sections are. It says what the next leg's command needs
   to know.
4. Draw **only on this conversation**. The session that reads the brief starts after a `/clear`
   and cannot ask what was meant, so quote decisions as they were made and give each rejected
   alternative the reason it was actually rejected for.
5. **Leave out any section with nothing behind it.** Do not fill one in to make the page look
   complete: the reader cannot tell an invented section from a real one, and will build on it. If
   the guidance asks for something this conversation never settled, say so in one line under a
   closing "Not covered" heading, with the reason — it was not discussed.
6. Do not restate what Waybill already knows — the branch, the bay, the leg after this one. The
   next session is handed those beside the brief's path.

Then confirm in one line: that the brief was written, for which leg, and where. Stop there. Do not
run the next leg, and do not show a waybill — whichever command invoked this one does that.
