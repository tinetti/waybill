---
leg: cleanup
command: /mar
model: sonnet
effort: low
handover: through
argument: branch
stampCmd: false
---
Fold the branch back into the default branch and take its bay with it. Read the whole change one
last time first: the three-dot diff between the default branch and this one is exactly what is
about to land, and this is the last moment where reading it is cheap.

The diff is named rather than spelled out: this body is rendered verbatim, so a literal
`git diff <default>...<branch>` would reach you with both placeholders still in it.

This leg's `stampCmd` never succeeds on purpose, exactly as the bay leg's does not: Waybill takes
cleanup's stamp from repository state — the branch merged into the default branch, and no bay left
at the configured path — never from a booking. This one exists to supply the waybill: the command,
the model, and this text.

`/mar` is a personal dotfile command rather than something Waybill ships, and the README names what
it needs. Swap the `command` above for whatever finishes a branch here; `argument: branch` is what
hands it the branch name rather than the change id, because a branch is what is being finished.
