---
leg: brainstorm
command: /ideation:brainstorm
model: opus
effort: high
handover: transfer
stampCmd: false
---
Talk the idea through before committing to it. Name the problem, argue for the smallest version
that could work, and surface the assumptions you have not tested yet. Nothing is written to disk
here by design — the output is a decision to build, or a decision not to.

This booking is **not a leg**: the brainstorm happens before the route starts, and a conversation
that writes nothing has no stamp to be judged by. It stays a booking so the carrier, model and
effort are yours to swap like any other; `/waybill:new` resolves it by name rather than by
position. Its `stampCmd` never succeeds on purpose, and nothing ever asks it to — the route begins
at `bay`.
