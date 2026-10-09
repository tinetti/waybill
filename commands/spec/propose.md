---
description: "OpenSpec propose — scaffold proposal/specs/design/tasks (Opus, high effort)"
model: opus
effort: high
allowed-tools: Bash(openspec:*)
---

Invoke the `opsx:propose` skill and follow it exactly.

If this project has no `openspec/` directory, stop and tell me to run `openspec init` first.

If `opsx:propose` cannot be resolved in this session, say so in one line and stop — do not substitute a similarly named skill. If `.opencode/skills/openspec-*` exists, add that OpenSpec was set up for OpenCode only; either way, tell me to run `openspec init --tools claude` in this project.

Planning only — do not write project code in this turn, even if the request below is phrased as "build" or "fix". When the artifacts are complete, stop and let me review `tasks.md` and `specs/` before anything is implemented.

The change I want proposed: $ARGUMENTS
