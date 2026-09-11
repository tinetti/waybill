---
description: "Waybill — begin an effort: the first leg's waybill, then run it"
model: opus
effort: high
allowed-tools: Bash(node:*), Bash(test:*), Bash(echo:*), SlashCommand, Skill
---

<!--
`model:` and `effort:` on purpose, and this is the one Waybill command that declares them. Every
other command refuses them because its waybill is for the *next* session, and declaring one here
would silently override the booking's choice with this session's. `new` is the opposite case: the
waybill below is for **this** session, which is about to run the command it names, and a session
cannot switch its own model part-way through. Declaring nothing would run the ideate leg at whatever
model happened to be in the chair.

The values are not free. `tests/commands.test.js` pins them against `bookings/ideation-ideate.md`,
so rebooking that leg to a different model reports that this file disagrees rather than quietly
running the leg at the wrong one.

`SlashCommand` and `Skill` are on the `allowed-tools` line for the same reason `next` needs
`AskUserQuestion` on its: the list is restrictive, and a tool left off it is not merely
unmentioned — it is unavailable, with no error to explain the silence. This command's whole job is
to invoke the one the waybill names, and a booking may name either a slash command or a skill.
-->

# Waybill: new

<!--
`${CLAUDE_PLUGIN_ROOT}` bare, in both clauses, and never `${CLAUDE_PLUGIN_ROOT:-}`. It is not an
environment variable: Claude Code rewrites the literal out of this line before bash is handed it,
and the rewrite matches `${CLAUDE_PLUGIN_ROOT}` or a bare `$CLAUDE_PLUGIN_ROOT` and nothing else.
Guarding the guard is what breaks it. `tests/commands.test.js` holds the spelling.

No `:-.` fallback either: falling back to the operator's cwd points the command at `./src/cli.js`
in *their* repository, where it does not exist, and hands the model a raw node MODULE_NOT_FOUND
dump in place of the block below.
-->

!`if [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.js" ]; then node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" new; else echo "waybill: CLAUDE_PLUGIN_ROOT is unset or does not point at the Waybill plugin directory — cannot locate src/cli.js"; fi`

## Task

Show the block above to me **verbatim** — same lines, same order, same glyphs. Do not summarise it,
re-word it, re-order it, or add commentary of your own.

Then, unlike every other Waybill command, **run the command the `NEXT:` block names**, in this
session, with whatever argument the block prints after it. This is the one place the tool asks you
to act rather than to hand off: the other commands stop because their waybill belongs to a session
that has not started yet, and this one is for the session already reading it.

The `NEXT:` block lists commands one per line. Run **only the last** of them — the leg command,
with whatever argument it carries — and never `/clear`, `/model` or `/effort`, whichever of them
the block lists above it. They are there because the ideate leg is booked like every other leg, and
because `waybill new` in a terminal prints this same block to an operator who *would* start a fresh
session. You are already that fresh session: there is no previous leg whose context needs clearing,
and clearing would throw away the instruction along with the block. This command's own frontmatter
already set the model and effort, and running `/model` would change my default for every session
after this one.

If the command cannot be resolved — the plugin that provides it is not installed in this session —
say so in one line, name the command, and leave the waybill on screen as the instruction. Do not
substitute a command you can resolve, and do not improvise the leg yourself: the booking is what
decides how this leg is run, and guessing at it is the failure this whole tool exists to prevent.

If the block reports `WARNINGS`, relay them before you run anything. A warning that new efforts
begin on the trunk is not a reason to stop — the ideate leg writes nothing to disk, so the wrong
directory costs nothing but confusion — but it is a reason to tell me where I am standing.

If the block reports `IGNORED BY GIT`, mention that those papers will not survive a commit, and
leave editing `.gitignore` to me.
