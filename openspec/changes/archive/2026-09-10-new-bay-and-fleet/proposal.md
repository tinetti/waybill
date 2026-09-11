## Why

`waybill next` answers two unrelated questions with one command and picks between them by reading
the checked-out branch: on a docket it issues the next leg's waybill, and on the trunk it issues
leg 1's — which is not "what comes next" but "how do I begin at all". At the same time a docket is
defined as the checked-out branch, so the trunk cannot see anything: with three bays open,
`waybill next` on the trunk reports `no docket open`, a statement that is true of the current
directory and false of the repository.

## What Changes

- **BREAKING**: `start` is renamed to `bay`, with no alias. The leg has always been called `bay`;
  only the command disagreed.
- New `new` verb — the trunk-side entry point that begins an effort. The CLI prints leg 1's waybill
  and stops; the slash command shows that block and then invokes the command it names.
- `status` on the trunk becomes a fleet view listing every docket in flight, with per-docket
  warnings attributed to the branch they came from.
- `next` gains a positional `<branch>` and a hard exit contract: exit 0 if and only if exactly one
  waybill was issued. Zero dockets and many dockets both exit 2.
- Docket enumeration is defined as the set of linked worktrees, excluding the main checkout,
  detached HEADs, a second checkout of the default branch, and prunable records.

## Capabilities

### New Capabilities
- `fleet`: what counts as a docket when seen from outside it, and how every effort in flight is
  enumerated from anywhere in the repository.
- `command-surface`: the four verbs (`new`, `bay`, `next`, `status`), what each does on the trunk
  versus inside a bay, the exit contract, and the shape of each rendered block.

### Modified Capabilities

<!-- None. This is the project's first OpenSpec change; openspec/specs/ is empty. -->

## Impact

- New: `src/fleet.js`, `commands/new.md`, `tests/fleet.test.js`, and four golden files
  (`fleet.txt`, `select.txt`, `trunk-one-docket.txt`, `fleet-empty.txt`).
- Renamed: `commands/start.md` → `commands/bay.md`.
- Modified: `src/cli.js`, `src/waybill.js`, `src/repo.js`, `bookings/waybill-bay.md`,
  `commands/next.md`, `commands/status.md`, `README.md`,
  `tests/{commands,cli,waybill,inference}.test.js`, `tests/helpers/repo-fixture.js`,
  `tests/golden/bay.txt`.
- Deliberately untouched: `src/inference.js`, `legs.js`, `bookings.js`, `frontmatter.js`,
  `inspection.js`, `progress.js`, `openspec.js`. `inference.js` staying untouched is the check on
  the approach — if implementation starts wanting to change it, the boundary was drawn wrong.
- `commands/next.md` gains `AskUserQuestion` in `allowed-tools`; the list is restrictive, so
  without it the docket prompt is silently unavailable.
- Anyone with `waybill start` in a script or muscle memory is broken by the rename.
- `tests/inference.test.js` is modified twice, and neither touches `src/inference.js`: line 146 pins
  `bookings/waybill-bay.md`'s `/waybill:start` literal, and lines 70-73 count `tests/fixtures/`.
  The boundary guards the module, not its suite.
