---
description: "OpenSpec archive — fold completed deltas into the living spec (Sonnet, low effort)"
model: sonnet
effort: low
allowed-tools: Bash(openspec:*)
---

Invoke the `opsx:archive` skill and follow it exactly.

If this project has no `openspec/` directory, stop and tell me to run `openspec init` first.

If `opsx:archive` cannot be resolved in this session, say so in one line and stop — do not substitute a similarly named skill. If `.opencode/skills/openspec-*` exists, add that OpenSpec was set up for OpenCode only; either way, tell me to run `openspec init --tools claude` in this project.

Change to archive: $ARGUMENTS
