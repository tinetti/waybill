---
description: "OpenSpec apply — implement tasks.md (session model, normally Opus)"
model: inherit
allowed-tools: Bash(openspec:*)
---

Invoke the `opsx:apply` skill and follow it exactly.

If this project has no `openspec/` directory, stop and tell me to run `openspec init` first.

If `opsx:apply` cannot be resolved in this session, say so in one line and stop — do not substitute a similarly named skill. If `.opencode/skills/openspec-*` exists, add that OpenSpec was set up for OpenCode only; either way, tell me to run `openspec init --tools claude` in this project.

Context hygiene: if this session still holds the planning conversation that produced the change, say so and recommend I `/clear` before implementing — the change folder is the design, and carrying the planning transcript forward only dilutes it.

Change to apply: $ARGUMENTS
