```text
feat/thing · leg 7 of 7 (cleanup)
  ✓ ideate  ✓ bay  ✓ refine  ✓ contract  ✓ specs  ✓ execute
  ▶ cleanup
```

**NEXT** — paste each block on its own, in order:

```
/model sonnet
```

```
/effort low
```

```
/waybill:cleanup feat/thing
```

Fold the branch back into the default branch and take its bay with it. Read the whole change one
last time first: the three-dot diff between the default branch and this one is exactly what is
about to land, and this is the last moment where reading it is cheap.

The diff is named rather than spelled out: this body is rendered verbatim, so a literal
`git diff <default>...<branch>` would reach you with both placeholders still in it.

This leg's `stampCmd` never succeeds on purpose, exactly as the bay leg's does not: Waybill takes
cleanup's stamp from repository state — the branch merged into the default branch, and no bay left
at the configured path — never from a booking. This one exists to supply the waybill: the command,
the model, and this text.

`/waybill:cleanup` is the carrier Waybill ships, and it is deliberately the modest one: it assumes
the pull or merge request is already merged on the forge — by a reviewer, or by CI — verifies that
with plain git, and then retires the bay and the branch. It never merges anything itself and never
calls `gh` or `glab`, so it needs no auth and behaves the same on any remote. If the branch is not
merged yet it stops and says so rather than deleting work.

If you want a carrier that merges the request for you as well, rebook this leg rather than editing
this file: point `waybill.bookingsdir` at a directory of your own and drop a booking for `cleanup`
into it. `examples/mar-cleanup.md` is a worked one. See *Swapping a carrier* in the README.
