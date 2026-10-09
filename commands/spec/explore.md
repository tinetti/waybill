---
description: "OpenSpec explore — think through an idea before committing (Opus, high effort)"
model: opus
effort: high
allowed-tools: Bash(openspec:*)
---

Invoke the `opsx:explore` skill and follow it exactly.

If this project has no `openspec/` directory, stop and tell me to run `openspec init` first.

If `opsx:explore` cannot be resolved in this session, say so in one line and stop — do not substitute a similarly named skill. If `.opencode/skills/openspec-*` exists, add that OpenSpec was set up for OpenCode only; either way, tell me to run `openspec init --tools claude` in this project.

What I want to explore: $ARGUMENTS
