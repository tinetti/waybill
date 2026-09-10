## Context

The full technical design for this change was written, reviewed, and approved before this OpenSpec
change existed, and it remains the source of truth:

> `docs/superpowers/specs/2026-09-08-waybill-new-and-fleet-design.md`

That document carries the problem statement, six numbered decisions with their rejected
alternatives, the rendered output for every case, the file-by-file inventory, and the test plan.
This design deliberately does **not** restate it — a second copy would drift. What follows records
only what a reader of the approved design still needs in order to implement it from here.

See `proposal.md` — Why for motivation, and `specs/` for the behavior contract.

## Goals / Non-Goals

Goals and non-goals are stated in the approved design's *Out of scope* section. Repeated here only
because they bound the task list:

- **Non-goal**: cross-docket reasoning. The fleet view is a list; nothing compares dockets, orders
  them by staleness, or warns that two touch the same files.
- **Non-goal**: a machine-readable `status`. The ambiguous case of `next --json` already carries the
  fleet shape, and the rule against a second machine-readable surface stands.
- **Non-goal**: interactive selection in the CLI. The CLI prints and exits; the session prompts.

## Decisions

The six decisions are in the approved design (§Decisions) and are **not** reopened here. Two of them
constrain implementation tightly enough to restate as guardrails:

- **The inference layer is not touched.** Enumeration lives in a new module that maps each bay to an
  unchanged, existing single-docket resolution call. If implementation starts wanting to modify the
  inference layer, the boundary was drawn in the wrong place — stop and revisit rather than widen
  the diff. This is the check on the whole approach, not a style preference.
- **Rendering shares one findings builder.** The new fleet and selection renderers join the existing
  ones and reuse the shared helper, because two surfaces that build their own findings blocks will
  eventually disagree about the same repository.

### Decision: this change is proposed against work already committed

Enumeration and the shared worktree query are already implemented and committed as `24d7ed0` on
this branch, ahead of this OpenSpec change being written. The specs describe required behavior
regardless of when it was built, so they cover that work; `tasks.md` marks it complete rather than
pretending it is pending.

Alternative considered: reverting the commit so the change could be applied from a clean base. That
buys a tidier history at the cost of re-deriving 161 reviewed and tested lines, and the test suite
already pins the behavior.

## Risks / Trade-offs

- **The verbatim rule gains a branch.** A single unconditional rule is what stops a session
  paraphrasing a waybill; adding an exception is the main risk in this design. → The exception is
  keyed on an exact string match rather than a judgment call, and verbatim stays the default.
- **The rename has no alias.** Anyone with the old verb in a script or muscle memory breaks. →
  Accepted deliberately: at this version, with a plugin marketplace as the only distribution, an
  alias is a second name to document and keep in step forever.
- **The selection prompt needs a permission that is not currently declared.** The permission list is
  restrictive, so an undeclared prompt fails silently rather than loudly. → Declare it in the same
  task that adds the branch, and cover it in the command test.
- **Stdout versus stderr for the non-zero cases is asserted, not verified.** The approved design
  (§2) flags that the session invocation's stderr capture is unverified, and that an existing error
  path may already be invisible because of it. → Probed in a live session; the finding and the three
  probes behind it are recorded at `tasks.md` §7.2. What was observed is narrower than "stderr is
  captured": on a **non-zero** exit the harness surfaces the command's stderr in full inside its
  failure report, so `repoRoot`'s error is not invisible to a session. That is the exit code that
  error path actually takes, so the approved design's §2 worry is answered for it. It does **not**
  settle the `` ! `` *substitution*, which runs only on exit 0 — and the substitution is exactly what
  the "captures stdout only" reason at `specs/command-surface/spec.md:47-48`, `src/cli.js:115-116`
  and `README.md:142-143` describes. Whether that path carries stderr stays unmeasured, because no
  shipped command writes to stderr and exits 0; nothing here shows those three lines to be false.
  The requirement they justify is unaffected either way — stdout is still the right stream — so none
  of the three is edited here, and the pre-existing bug is still fixed separately rather than folded
  in.
- **A non-zero exit costs the session the whole command file, not just a stream.** The same probe
  found that when the `` ! `` line exits non-zero, Claude Code (2.1.267) reports a shell-command
  failure naming that line and never renders the file, so the `## Task` section — and with it the
  `SELECT A DOCKET:` branch this change adds — does not load. Both trunk cases that print and exit 2
  are affected. → Out of scope here: the exit contract is a requirement of this change's own spec,
  and revising it belongs to whichever change reopens it, not to the task that found the problem.
  Recorded in `tasks.md` §7.2 with the two measurements the shipped commands could not produce.

## Migration Plan

The rename is the only breaking step. `commands/start.md` is renamed rather than copied, the
declared-command list in the test suite is updated in the same task, and the README route table is
updated with it so the documented surface and the shipped surface cannot disagree. There is no
rollback beyond reverting the branch; nothing persists state across versions.

## Open Questions

None. The design was approved with its decisions settled; the one investigation it defers (stderr
capture, above) is recorded as a task output rather than a question, because its answer changes
neither the specs nor the approach. It did not: every requirement still stands, and what the probe
turned up about non-zero exits is filed as a risk for a later change rather than reopened here.
