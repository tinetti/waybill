```text
feat/thing · leg 2 of 7 (bay)
  ✓ ideate
  ▶ bay
```

**NEXT** — paste each block on its own, in order:

```
/model haiku
```

```
/effort low
```

```
/waybill:bay
```

Cut the feature branch and its isolated bay, then move into it — every leg after this one happens
in the new bay. Pass the branch name as the argument (`feat/<short-name>`). In a session, the
handover it prints ends in `/waybill:next <branch>/<leg>`, which moves the next session into the bay
after `/clear`; in a terminal, read the `cd` line it prints instead.

This leg's `stampCmd` never succeeds on purpose, exactly as the ideate leg's does not: Waybill takes
the bay's stamp from repository state — `git worktree list` and the configured bay path — never from a
booking. This one exists to supply the waybill: the command, the model, and this text.
