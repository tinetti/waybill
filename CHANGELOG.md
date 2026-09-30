# Changelog

Release notes for the next release, written as they land. Versions are not named here: `main`
releases independently and the release PR owns the version number, so this file's top section is
whatever has not shipped yet.

## Unreleased

### BREAKING: a machine-local bookings overlay binding a retired leg id stops every command

The route is now six legs — `bay`, `ideate`, `specify`, `execute`, `review`, `cleanup` — and
`refine`, `contract` and `specs` are no longer leg ids. `ideate` now means the ideation interview
and its contract; the brainstorm that used to be leg 1 is off the route entirely and runs from
`/waybill:new`.

A booking is rejected at load time when it names a leg that does not exist, so an overlay file
still carrying `leg: refine`, `leg: contract` or `leg: specs` makes **every** `/waybill:*` command,
and every `waybill` verb but `doctor`, fail identically on that machine, from the first invocation
after the upgrade. Nothing in this repository's tests can catch it: the overlay lives on your
machine, not in the repo.

`ideate` is the quiet one. It is still a leg id, so an overlay binding it still loads — but it no
longer means the brainstorm, and an overlay written to rebook that carrier now rebooks the
interview-and-contract leg instead, with no error and no warning to discover. Move such a file to
`leg: brainstorm`, the off-route id the brainstorm carries now.

**`waybill doctor` is the one command that still runs.** It degrades the same failure to a warning
rather than dying with it, and names the offending file and the leg it binds. Run it first; it
tells you exactly which file to edit.

The overlay is wherever you pointed it, and there are only two ways to point:

- `WAYBILL_BOOKINGS_DIR` in the environment
- `git config waybill.bookingsdir` — typically `~/.waybill/bookings` or
  `~/.config/waybill/bookings` set with `--global`

An absolute setting is one directory for every repository. A **relative** one — `.waybill/bookings`
is the common spelling — resolves against the checkout you are standing in, so each bay has its own
copy and each has to be fixed separately.

Edit the `leg:` line in each offending file to a surviving id, or delete the file to fall back to
the shipped booking. The next release PR ships this change.
