# Human Gate: Waybill Fleet — Run It Against Your Real Machine

**Contract**: ./contract.md
**Kind**: Human checkpoint — no code is written in this phase
**Prerequisite**: Phase 5 (live paint layer)

## Why this gate exists

Every prior phase is validated against fixtures: synthetic repos built by `createRepo`, a stubbed
`tmux`, a stubbed `ps`, an injected clock. That is the right way to test them and it is why the suite
is fast and deterministic. It is also why the suite cannot answer the questions that actually decide
whether this feature is good.

Four decisions in this contract were made from reasoning rather than observation, and each one is
cheap to correct now and annoying to correct later:

- **Scan depth 4** was chosen because `~/Projects/<org>/<repo>` is how this repo itself is laid out.
  Your real tree may be shallower, deeper, or uneven.
- **Dedup by main checkout** was designed against the `waybill.baydir=..` sibling-bay layout. Whether
  your machine actually produces the duplicate it prevents is unknown.
- **Staleness sort** assumes the most-idle docket is the one you want at the top. That is a claim
  about your attention, not about git.
- **Agent detection** uses a `KNOWN_AGENTS` list extrapolated from the denylist at
  `src/picker.js:70-75`. Whether it matches what you actually run is unverified.

## Checklist

Run from your real `~/Projects`, not a fixture.

```bash
node src/cli.js fleet
```

- [ ] **Repo count is right.** The `scanned N repos` footer matches roughly what you expect. If it is
      far too low, depth 4 is not reaching your layout. If it is far too high, the walk is descending
      into something it should skip.
- [ ] **No project is listed twice.** Especially any repo with a non-default bay directory. This is
      the dedup rule under real conditions.
- [ ] **Every open docket you know about is present**, and nothing you have already merged lingers.
- [ ] **The top row is the one you would actually pick up.** If the most-idle-first ordering
      consistently puts the wrong thing first, the sort is wrong — say so rather than adapting to it.
- [ ] **Ages look right.** Cross-check one docket's opened and idle against `git log`. Watch for
      timezone skew and for a rebased branch reporting the wrong idle time.
- [ ] **Stacked branches are correct.** If you have a genuine stack, confirm the parent is the nearest
      one, not the root. If you have none, create a throwaway stack to check it.
- [ ] **tmux panes match reality.** Open a bay in a tmux window and confirm that docket — and only
      that docket — shows the pane.
- [ ] **Agent detection matches what is running.** With a real Claude Code session in a bay, confirm
      it is named. With a plain shell, confirm it reports idle rather than a false agent. With a long
      `npm test`, confirm it reports busy.
- [ ] **Scanning does not run stamp commands.** Confirm no side effects appear in repositories you
      merely looked at — this is the `skipStampCmd` decision from Phase 1 under real conditions.
- [ ] **Live mode behaves.** Leave it running, commit in another window, confirm the row updates
      within ~2s without flicker.
- [ ] **The terminal comes back clean.** Press `q`, then Ctrl-C on a second run. Confirm echo works
      and the last frame is still in scrollback. This is the highest-consequence failure in the
      project.
- [ ] **Latency is acceptable.** If the first paint feels slow enough that you would hesitate to run
      it, say so — the fix is scheduling, not more features.

## Outcome

Record which boxes failed and what the real values were. Any failure here is a defect in the phase
that owns it, not a new feature request:

| Symptom                                | Owning phase |
| -------------------------------------- | ------------ |
| Wrong repo count, duplicates, missed repos | Phase 1   |
| Wrong ages, wrong stacked parent        | Phase 2      |
| Wrong or missing pane / agent detection | Phase 3      |
| Wrong ordering, bad layout, bad bar     | Phase 4      |
| Flicker, stale frame, terminal not restored | Phase 5  |

Do not call this project done until this checklist has been run against a real machine.
