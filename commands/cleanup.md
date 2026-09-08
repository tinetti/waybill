---
description: "Waybill — retire a merged branch and its bay, with plain git"
argument-hint: <branch — the branch to finish, e.g. feat/thing>
allowed-tools: Bash(git fetch:*), Bash(git worktree list:*), Bash(git symbolic-ref:*), Bash(git branch --merged:*), Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git rev-parse:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as every other Waybill command: the
booking names the model this leg wants, and declaring one here would override that choice with
this session's.

`allowed-tools` pre-approves the questions and none of the answers. Fetching and listing cannot
lose work; `git worktree remove`, `git branch -d`, `git checkout` and `git pull` can, so they are
deliberately absent and will stop for approval at the moment they are proposed. This is the leg
where giving up leaves debris, and it is also the leg where a wrong branch name is unrecoverable —
one approval prompt per destructive step is the right price.

This command assumes the pull request or merge request is *already merged* on the forge, by a
reviewer or by CI. It never merges, and it never talks to `gh` or `glab`, so it needs no auth and
works the same on GitHub, GitLab, and a bare remote on a server. If you want the merge performed
for you as well, that is a different carrier — see `examples/mar-cleanup.md`.
-->

# Waybill: cleanup

!`git fetch --quiet origin 2>&1 | tail -3; echo "--- worktrees:"; git worktree list; echo "--- default branch:"; git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo "(no origin/HEAD — fall back to main, then master)"; echo "--- merged into it:"; git branch --merged "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)" --format='%(refname:short)' 2>/dev/null || echo "(could not compute)"`

## Task

Retire the branch named in my arguments — **$ARGUMENTS** — and the bay that carries it. The block
above already fetched, so it is current. Read it rather than re-running those queries.

Work these steps in order, and stop at the first one that does not hold.

**1. Am I standing in the bay?** In the `worktrees:` listing, the first entry is the main checkout
and the rest are bays. If my current directory is inside the bay for this branch, stop and tell me
to move first:

```
cd <main checkout>
```

Then ask me to run `/waybill:cleanup $ARGUMENTS` again. Do not try to `cd` for me — a tool-invoked
shell cannot move my session, which is why the path is printed rather than acted on. Git also
refuses to remove a worktree you are standing in, so continuing here would fail anyway, halfway
through.

**2. Is the branch merged?** Look for the branch in the `merged into it:` list. If it is there, the
default branch already contains every one of its commits — go to step 3.

If it is **not** there, do not delete anything yet, and do not tell me the work is unmerged. That
list is built by `git branch --merged`, which only recognises a true merge commit. A forge set to
**squash** or **rebase** rewrites the commits as it merges, so a branch whose work landed safely an
hour ago is legitimately absent from it. Tell the two cases apart before saying anything:

```
git log --oneline origin/<default>..<branch>
git diff --stat origin/<default>..<branch>
```

- **The diff is empty.** The default branch already has this content under different commit hashes —
  that is exactly what a squash merge looks like from here. Say so, show me the log line count, and
  ask me to confirm before continuing to step 3.
- **The diff shows real work.** The branch genuinely has changes the default branch does not.
  Stop, show me the stat, and offer the two ways forward: merge the request on the forge and run
  this command again, or use a carrier that merges for you, such as `/mar`, if this machine has one.

Deleting an unmerged branch loses work that exists nowhere else. Never pass `-D`, and never
`--force` a worktree removal, to get past this step — and when the automatic check is inconclusive,
the confirmation is mine to give, not yours to infer.

**3. Remove the bay.** Take the path from the `worktrees:` listing rather than guessing it — bays go
wherever `waybill.baydir` puts them, and the default is not the only answer:

```
git worktree remove <bay path>
```

If the bay holds uncommitted changes, git will refuse. That refusal is information: show it to me
and stop. Those changes are not in the merge that was just verified.

If the branch has no bay in the listing, it was already removed — say so and carry on to step 4.

**4. Delete the branch.**

```
git branch -d <branch>
```

`-d` and never `-D`: git's own merged check is the last backstop under step 2, and it should be
allowed to do its job.

**5. Return me to the default branch.**

```
git checkout <default branch> && git pull
```

Then report what was removed — the bay path, the branch, and the branch I am now on — in a few
lines. If a step was skipped because it was already done, say which.
