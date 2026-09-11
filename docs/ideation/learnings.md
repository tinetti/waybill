# Ideation Learnings

Generalizable spec-gap and interview patterns captured from completed
ideation projects. Intake reads this file so recurring gaps inform future
questioning and spec generation. Each entry is dated and cites its
evidence; treat entries as hints, never as a substitute for gate evidence.

## 2026-09-10 — new, bay, and the fleet view

- **Pattern**: A contract whose phases all point at one shared spec file (here, a single
  OpenSpec `tasks.md`) breaks two engine mechanisms at once — the git skip pre-pass cannot
  tell the phases apart, so a cross-session resume falsely marks every phase complete once
  any one phase commits; and a task list has no File Changes table, so every phase gets
  `files: []` and loses same-wave file-overlap serialization.
  **Evidence**: All 6 phases of `new-bay-and-fleet` declared
  `specPath: openspec/changes/new-bay-and-fleet/tasks.md`; `workflows/execute-contract.mjs:558`
  requires that path verbatim in every phase commit body.
  **Spec/interview implication**: Emit per-phase spec files with their own File Changes
  tables, or make the contract record a distinct commit-grep anchor per phase.
