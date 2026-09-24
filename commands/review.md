---
description: "Waybill — push the branch and open its pull or merge request for review"
allowed-tools: Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git remote:*), Bash(git log:*), Bash(git status:*), Bash(command:*), Bash(gh repo view:*), Bash(gh pr list:*), Bash(glab repo view:*), Bash(glab mr list:*)
---

<!--
No `model:` or `effort:` frontmatter, for the same reason as every other Waybill command: the
booking names the model this leg wants, and declaring one here would override that choice with
this session's.

`allowed-tools` pre-approves the questions and none of the answers. Reading the branch, the remote
and the forge's list of open requests cannot change anything; `git push`, `gh pr create` and
`glab mr create` reach outside this machine, so they are deliberately absent and will stop for
approval at the moment they are proposed. One prompt each is the right price for a step somebody
else will see.

This command depends on nothing Waybill does not ship. It names `gh` and `glab` because they are
the forge CLIs, and names them as optional: with neither usable it says so, names both fixes, and
offers the browser instead. It must not reach for a personal review skill — a machine that has one
rebooks this leg through `waybill.bookingsdir` rather than editing this file.

Every segment of the `!` line below ends in a fallback, so the whole line exits 0. Claude Code
discards a command file whose `!` line exits non-zero, and the Task section then never renders at
all — on a branch with no remote and no forge CLI, which is exactly when the guidance is needed
most.
-->

# Waybill: review

!`b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no branch)"); echo "--- branch: $b"; echo "--- default branch:"; git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo "(no origin/HEAD — fall back to main, then master)"; echo "--- origin:"; git remote get-url origin 2>/dev/null || echo "(no origin remote — there is nothing to push to)"; echo "--- commits not yet pushed:"; git log --oneline @{upstream}..HEAD 2>/dev/null || echo "(no upstream — this branch has never been pushed)"; echo "--- uncommitted:"; git status --porcelain 2>/dev/null || echo "(not inside a git repository)"; echo "--- gh:"; command -v gh 2>/dev/null && (gh repo view --json nameWithOwner 2>/dev/null || echo "(installed, but cannot answer for this repository — check auth and host)") || echo "(not installed)"; echo "--- glab:"; command -v glab 2>/dev/null && (glab repo view >/dev/null 2>&1 && echo "(can see this repository)" || echo "(installed, but cannot answer for this repository — check auth and host)") || echo "(not installed)"; echo "--- requests already open for this branch:"; gh pr list --head "$b" --state open 2>/dev/null || glab mr list --source-branch "$b" 2>/dev/null || echo "(no forge CLI could answer — whether one is open is unknown)"`

## Task

Push this docket's branch and open the pull or merge request that carries it to a reviewer. The
block above already asked git and the forge, so it is current. Read it rather than re-running those
queries.

Work these steps in order, and stop at the first one that does not hold.

**1. Is there anything uncommitted?** If the `uncommitted:` section lists files, stop and show me
what they are. A request opened over a dirty tree reviews something other than what is on the
branch, and the fix is mine to make: commit the work, or set it aside.

Stop here too if `branch:` is the default branch, or `(no branch)`. There is no docket to review —
on the trunk there is nothing to push, and a detached HEAD has no branch to open a request from.
Say which of the two it is and stop; never push the trunk.

**2. Which forge is this?** Decide from the `origin:` URL together with the `gh:` and `glab:`
sections — from what can actually answer for this repository, not from which binary happens to be
installed. A machine can easily carry both, with only one of them authenticated for this host.

If **neither** can answer, do not guess and do not proceed. Say so, and give me both remediations
plus the way round them:

```
gh auth login
glab auth login --hostname <the host in the origin URL>
```

Or open the request in the browser instead — push first, then use the compare URL the forge prints,
or the repository's own *new pull request* page. Waybill needs neither CLI to be installed; this
leg simply cannot be stamped until a request exists.

**3. Push the branch.**

```
git push -u origin <branch>
```

This is not pre-approved, so it will stop and ask. If `commits not yet pushed:` already reported
nothing and the branch has an upstream, say the branch is already pushed and go to step 4.

**4. Open the request.** If `requests already open for this branch:` listed one, do **not** open a
second — report the one that is there and go to step 5. Otherwise, whichever CLI answered in step 2:

```
gh pr create --fill --web
```

```
glab mr create --fill --web
```

`--fill` takes the title and body from the commits, and `--web` opens the draft in the browser so I
can read it before it is published. Both stop for approval.

**5. Hand it off.** Print the request's URL and stop.

`/waybill:review` opens the request; it does not review it, approve it or merge it. Reviewing is a
human's job — or a reviewer's, if this machine has one booked — and merging is what `/waybill:cleanup`
verifies has already happened. Once a request is open, `waybill next` stamps this leg and the route
moves on to `cleanup`.
