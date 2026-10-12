---
description: "OpenSpec propose — scaffold proposal/specs/design/tasks (Opus, high effort)"
model: opus
effort: high
allowed-tools: Bash(openspec:*)
---

Invoke the `opsx:propose` skill and follow it exactly.

If this project has no `openspec/` directory, stop and tell me to run `openspec init` first.

Planning only — do not write project code in this turn, even if the request below is phrased as "build" or "fix". When the artifacts are complete, stop and let me review `tasks.md` and `specs/` before anything is implemented.

The change I want proposed: $ARGUMENTS

When this runs from a waybill, the arguments are context fields joined by ` · `, not a description. If they carry `Brief: <path>`, read that brief first. If they carry `ideation <dir>`, read that directory's `contract.md` and its `spec.md` or `spec-phase-*.md` (whichever exist): they describe the change to propose, and the brief says which phase this change covers. Any free text in the arguments counts as description too. Stop and ask what to propose only when there is no description, no brief and no ideation directory.
