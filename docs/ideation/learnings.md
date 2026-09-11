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

## 2026-09-10 — next-from-anywhere

- **Pattern**: Waybill describes its behavior in prose in many places outside `src/`
  (`bookings/*.md` bodies, `commands/*.md`, README, the help card), and specs' File Changes
  tables miss them.
  **Evidence**: Phase 1 notes — the scout found four stale `cd` descriptions
  (`bookings/waybill-bay.md:10`, `commands/bay.md:80`, README:160-163, a cd-fence test)
  outside the spec's File Changes.
  **Spec/interview implication**: Any behavior-changing spec greps those prose surfaces for
  the old behavior and lists every hit in File Changes.

## 2026-09-10 — bang-line-exit-guard

- **Pattern**: A spec that names its release version goes stale, because main releases
  independently and release PRs own versioning in this repo.
  **Evidence**: Phase 1 notes — the spec said 0.4.1, main shipped 0.4.1 (edec6c8) first, and
  the change landed as 0.4.2.
  **Spec/interview implication**: Specs say "the next release PR ships it", never a version
  number.
- **Pattern**: A guard criterion that forbids any diff to a file blocks incidental
  correctness fixes in that file, leaving known-stale text behind.
  **Evidence**: Phase 1 notes — a stale assertion message at `tests/cli.test.js:188` was
  left in place because the contract's GUARD forbade touching the file.
  **Spec/interview implication**: Guards assert the protected behavior (a named test, an
  exit code), not byte-identity of a whole file.
