---
description: Stage a switch to another cam account (takes effect on relaunch)
argument-hint: <name>
allowed-tools: Bash(cam switch:*)
---

Stage a switch to the account `$ARGUMENTS`:

!`cam switch "$ARGUMENTS"`

Now tell the user: exit this session (Ctrl-D) to relaunch into `$ARGUMENTS`.
Claude Code binds authentication at startup, so the switch takes effect on the
next launch — this only relaunches automatically if the session was started with
`cam run`.
