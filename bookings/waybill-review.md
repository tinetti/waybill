---
leg: review
command: /waybill:review
model: sonnet
effort: low
handover: through
argument: none
stampCmd: b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null); case "$b" in ''|HEAD) exit 1;; esac; f=; for c in gh glab; do command -v "$c" >/dev/null 2>&1 || continue; f=1; if [ "$c" = gh ]; then o=$(gh pr list --head "$b" --state open --json number 2>/dev/null) || continue; else o=$(glab mr list --source-branch "$b" --output json 2>/dev/null) || continue; fi; case "$o" in *'"number"'*|*'"iid"'*) exit 0;; esac; exit 1; done; if [ -n "$f" ]; then echo "a forge CLI is installed but could not answer for this repository — check auth and host"; else echo "no forge CLI on PATH: install gh or glab, or rebook the review leg"; fi; exit 125
---
Push the branch and open its pull or merge request, then hand it to a reviewer. Every box in the
tasks list is ticked, so the work is done; what is left is getting somebody else's eyes on it before
`cleanup` folds it back in.

This is the one stock leg whose stamp asks something **outside** the repository. Every other stamp
reads a file, a branch or a worktree; this one asks the forge whether a request is open for this
branch, because that is the only place the fact lives. It needs `gh` **or** `glab`, and neither is
mandatory — the stamp tries `gh` first, falls through to `glab` when `gh` cannot answer, and takes
whichever one speaks for this repository. That order is "first one that answers", not "first one
installed": a machine carrying a working `gh` and a `glab` pointed at some other host still stamps
correctly on a GitHub repository.

There are three verdicts, and they are worth telling apart:

- **A request is open.** The leg is stamped and the route moves on to `cleanup`.
- **A CLI answered, and there is none open.** The leg stays current, silently. That is honest work
  remaining, not a fault, so nothing is printed beside it.
- **No CLI could answer** — none installed, or one installed that is unauthenticated or pointed at
  the wrong host. The leg stays current *and* says why, under `WARNINGS:`. Without that line a 401
  would read exactly like "no request yet" and the docket would sit here forever with nothing on
  screen to explain it.

A draft request counts as open. A draft *is* an open request, filtering them out would need a
second parse, and the operator who opened a draft knows they did.

`/waybill:review` is the carrier Waybill ships, and it is deliberately the modest one: it reports
what git and the forge CLIs can see, pushes the branch, opens the request, and stops. It never
reviews, approves or merges — reviewing is a human's or a reviewer's job, and merging is what
`cleanup` verifies has already happened.

If your machine has its own review skill, rebook this leg rather than editing this file: point
`waybill.bookingsdir` at a directory of your own and drop a booking for `review` into it. A booking
is replaced whole, stamp included, so an overlay is free to ask the forge a different question — or
no question at all. See *Swapping a carrier* in the README.
