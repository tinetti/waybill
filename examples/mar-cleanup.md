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

`/mar` merges the request as well as cleaning up after it, which is the half `/waybill:cleanup`
deliberately leaves to the forge. It is a personal dotfile command rather than something Waybill
ships — `tinetti_dev_tools`, `files/home/.claude/skills/merge-and-reset/` plus a `commands/mar.md`
symlink — and it needs `gh` or `glab`, `jq`, and the `ExitWorktree` tool. Waybill never runs it;
this booking only names it.

This leg's `stampCmd` never succeeds on purpose: Waybill takes cleanup's stamp from repository
state — the branch merged into the default branch, and no bay left at the configured path — never
from a booking.
