## Context

See proposal.md (Why) for the motivation. The full rationale is in the approved contract,
`docs/ideation/waybill-help/contract.md`, and the implementation spec,
`docs/ideation/waybill-help/spec.md`. This design does not repeat that material. It records how the
spec maps onto the code as it stands today, after new-bay-and-fleet landed and the branch was rebased
onto `main`, and it records the gap decisions made while drafting.

Facts about the current code that shape the approach:

- `src/cli.js`
  - `USAGE` is a module-private constant, and its Commands block has four rows (lines 12-28).
  - `COMMANDS` is a `Map` of four handlers.
  - `run` answers `--help` and `-h` anywhere in argv before dispatching, so a handler never sees
    either flag.
  - Every handler that rejects arguments writes `waybill: …\n${USAGE}\n` to stderr and returns 2.
- `src/legs.js`
  - `LEGS` entries carry only `{id, owner, progress?}`.
  - `bay` and `cleanup` are `owner: 'wrapper'`; `execute` has `progress: true`.
- `src/bookings.js`
  - `resolveBookings(cwd, { knownLegs })` returns `Map<leg, Booking>`.
  - It throws on a malformed booking in either the built-ins or the overlay.
  - Outside a repository it does not throw: `configPath` returns `null`, and `checkoutRoot(cwd) ?? cwd`
    anchors the overlay.
  - Built-in `stampPath` values: `refine` has `docs/ideation/*/contract-data.json`, `contract` has
    `docs/ideation/*/contract.md`, and `specs` has `openspec/changes/*/tasks.md`.
  - `ideate`, `bay` and `cleanup` have `stampCmd: false`; `execute` has a multi-line `stampCmd`.
- Test harness
  - `tests/waybill.test.js:41-48` holds the only `assertGolden`.
  - `tests/bookings-overlay.test.js` neutralises the environment with
    `withEnv({GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_SYSTEM:'/dev/null', WAYBILL_BOOKINGS_DIR: undefined})`.
  - `tests/index.js` registers suites by explicit import.
- `tests/commands.test.js`
  - `DECLARED` is asserted in both directions.
  - A test asserts that every non-`new`, non-`spec/` command declares no `model` or `effort`, so
    `help.md` is covered automatically once it is in `DECLARED`.
  - "criterion 7" asserts zero dependencies and no build script, but does not pin the scripts map.

## Goals / Non-Goals

**Goals:**

- Meet every requirement in `specs/help-card/spec.md` and the `command-surface` delta.
- Tie every test name the contract's success criteria grep for to a real assertion.

**Non-Goals:** everything the contract rules out of scope:

- topic arguments;
- awareness of repository context;
- a pointer to `help` from the no-docket render;
- a per-leg prose gloss;
- generating the commands section from `USAGE`;
- the prerequisites table, the overlay mechanism, and bay-location precedence.

## Decisions

### D1 — A pure renderer in its own module: `src/help.js` exports `renderHelp(cwd)` and `MAX_LINES`

This matches `src/waybill.js`, where a pure function returns a string and a golden file tests it.
It keeps `cli.js` a thin dispatcher and lets tests call the renderer directly.

- One argument: `cwd` is used only to resolve bookings.
- No options object.
- `MAX_LINES = 45` is exported so the test asserts against the same constant, not a second literal.

*Alternative rejected:* inlining the page in `cli.js`. The golden test would have to go through
`run`, and the page would share a file with the stateful handlers.

### D2 — Route rows: the leg id, the carrier from the booking verbatim, and a four-rule stamp column

These rules come from the implementation spec's Component 1 and are restated in the `help-card`
spec. The route is `LEGS.map(...)`; bookings are never iterated. That way a leg with no booking still
gets its row, and a booking for an unknown leg cannot appear (`knownLegs` already rejects one).

*Alternative rejected:* a `label` field on `LEGS`, or a gloss table inside `help.js`. Both are a
second source of truth, which the zero-drift goal forbids.

### D3 — A bookings failure degrades the route instead of aborting (gap decision)

The implementation spec says "never throw", but `resolveBookings` fails for the whole map at once, so
per-leg degradation alone cannot cover a malformed overlay.

`renderHelp` wraps `resolveBookings` in `try/catch`. When it throws:

- it renders with an empty map, so every row shows `—` / `—`;
- it adds one line under the route: `bookings could not be read: <first line of error.message>`.

That is one extra line, and the draft below leaves room for it under the cap.

*Alternatives rejected:*

- Falling back to the built-ins alone. This silently shows carriers the operator's overlay replaced,
  which is exactly the lie the rebooked-carrier requirement exists to prevent.
- Letting it throw, as `next` and `status` do. Those commands have nothing to show without bookings.
  The help page still has three-quarters of its content.

A leg missing from a successfully resolved map is not reachable with shipped data, because overlays
replace legs and never delete them. It is still handled by the same `—` path, so the renderer has
exactly one fallback shape.

### D4 — The commands section is hand-written, and a test checks it against `--help`

The contract made this call; this design only fills in the mechanics. The `covers every subcommand`
test runs `run(['--help'], { out })` and takes the first token of each non-blank line between
`Commands:` and `Options:`. It asserts that each token except `help` appears in the page's COMMANDS
section.

`help` is excluded on purpose. The page teaches the four verbs, and a line saying `waybill help`
prints this page would spend budget telling the reader what they are already looking at. Without the
exclusion the contract's own "four command lines" would contradict its own coverage test. The
`command-surface` delta records the same distinction.

### D5 — `command-surface`: four verbs plus one reference command, not five verbs (needs review)

The living spec says the surface is *exactly* four verbs. The two ways to reconcile that:

| Option | Effect |
| --- | --- |
| **(a) chosen:** `help` is a *reference command*, and the requirement becomes "exactly four verbs plus exactly one reference command" | Keeps the contract's language: the page and its usage row both say "the four verbs". Keeps the invariant meaningful, because a future stateful command still has to change the requirement. |
| (b) "exactly five verbs" | Simpler wording, but the page would then describe "the four verbs" while the spec says five. |

This decision changes an existing living requirement, so it is flagged for explicit review rather
than decided silently.

### D6 — The `help` handler follows the house style of `cli.js`

```js
function help(cwd, args, io) {
  if (args.length > 0) {
    io.err(`waybill: \`help\` takes no arguments\n${USAGE}\n`);
    return 2;
  }
  io.out(renderHelp(cwd));
  return 0;
}
```

- It calls no `repoRoot`, so there is no exit 2 outside a repository.
- The `${USAGE}` suffix matches `status` and `new`. The implementation spec's sketch omitted it, and
  consistency with the file wins.

The new row goes last in `USAGE`, keeping the existing comment's route order for the four verbs:

```
  help            This page: the route, the words, and the four verbs
```

It is padded to the existing column 18, and the `COMMANDS` entry `['help', help]` also goes last.

### D7 — Promote `assertGolden` to `tests/helpers/repo-fixture.js`

This resolves the implementation spec's one open item. Promoting it avoids the two divergent copies
the spec forbids, and the body moves unchanged apart from the directory, which becomes a parameter.

- `tests/waybill.test.js` switches to importing it.
- `tests/cli.test.js:84,158` read goldens by hand. Migrating them is out of scope and is left as-is,
  to keep the diff surgical.

### D8 — The golden is rendered from a temporary directory outside any repository, under the neutralised environment

The golden's inputs are:

- `cwd`: a `tempRoot()` directory, so no repository-local `waybill.bookingsdir` can apply;
- `WAYBILL_BOOKINGS_DIR`: unset;
- `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM`: `/dev/null`.

That makes the output a function of the shipped bookings alone. No PATH stripping is needed, because
`loadBookings` never executes `stampCmd`.

### D9 — README: the table row plus the installed-commands sentence

The implementation spec said "touch only the row" because the prerequisite design owned the
surrounding README edits. That design has since landed, so the reason no longer holds.

- `README.md:67` lists the installed commands, and would now be incomplete. It gains `/waybill:help`.
- `README.md:151`, "All four warn…", is about the four docket verbs and stays accurate.

### Draft page (illustrative, not binding)

This is here so the 45-line budget can be reviewed as real text before the golden is blessed. The
route rows are what the shipped bookings produce; the prose is a first draft for the implementer to
tune. 38 lines and at most 80 columns, which leaves room for D3's error line.

```
waybill — the route, the words, and the four verbs

FROM ZERO
  1. On the trunk:        waybill new         leg 1's waybill; run what it names
  2. Once the idea holds: waybill bay feat/x  cut the branch and its bay
  3. Move in:             cd <the path bay printed>
  4. Every new session:   waybill next        the waybill for the next leg
  5. Run what it names, /clear, and ask again — until cleanup retires the bay.

ROUTE
  1  ideate    /ideation:brainstorm  repo state
  2  bay       /waybill:bay          bay exists
  3  refine    /ideation:ideation    contract-data.json
  4  contract  /ideation:ideation    contract.md
  5  specs     /spec:propose         tasks.md
  6  execute   /spec:apply           all tasks ticked
  7  cleanup   /waybill:cleanup      merged, bay gone

WORDS
  trunk    the default branch; efforts begin here, and no docket is open on it
  docket   the branch; open whenever anything but the trunk is checked out
  bay      the docket's own worktree, so the main checkout is never touched
  leg      one stage of the route, run in one session
  stamp    the mark a leg leaves in the repo; how waybill knows it is done
  booking  which carrier, model and effort run a leg; swappable per machine
  carrier  the command a booking names for its leg
  waybill  the instruction for exactly one leg, issued fresh every session

COMMANDS
  waybill new              begin an effort: leg 1's waybill, and nothing else
  waybill bay <branch>     cut the branch and its bay, then hand off
  waybill next [<branch>]  where this docket stands, and the next leg's waybill
  waybill status           where it stands, or the whole fleet on the trunk

Why: nothing is tracked — every leg is judged by its stamp, read off the repo.
     One waybill per session: the map is yours, the waybill is the handler's.

Ride-along, glossary and reference: docs/guide/ in the waybill repo
```

## Risks / Trade-offs

- **A test passes without testing anything.** `--test-name-pattern` skips non-matching tests and still
  exits 0. → Every test name in the contract is paired with a grep, and tasks.md uses the verbatim
  names.
- **The suite is never registered.** An unregistered suite is silently skipped on Node 26. → An
  explicit task, plus the contract criterion that greps `tests/index.js`.
- **The golden encodes a developer's overlay.** → D8.
- **The prose goes stale while the route stays correct.** The written half cannot be generated. →
  `names all four sections` and `covers every subcommand` catch structural drift. Wording drift
  surfaces as a golden diff whenever someone touches `USAGE` or the verbs.
- **Lines wider than the terminal.** A wrapped line breaks the one-screen promise as surely as a
  long page does. → An 80-column cap, asserted inside `fits one screen` against the rendered page.
  The route's widths are computed from its rows, so an unusually long overlay carrier can push that
  row past 80 and fail the test. That failure is intended: it is visible and names the row.
- **The 45-line cap squeezes future content.** → Intended. The README remains the long form, and the
  last line points at it.
- **The `bay` step in the walkthrough could mislead.** In practice leg 2 runs through
  `/waybill:bay`, which leg 1's waybill names, rather than being typed by hand. → Both routes end in
  the same `bay` command. The walkthrough teaches the CLI verb because the page is the CLI's
  reference.

## Migration Plan

None. The change is purely additive. Rolling back means deleting the four new files and reverting
the small edits to `src/cli.js`, the three test files, and `README.md`.
