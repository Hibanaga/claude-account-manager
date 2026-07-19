---
description: Register a new Claude Code account with cam
argument-hint: <name>
---

The user wants to add a new cam account named `$ARGUMENTS`.

Adding needs a terminal (the browser login can't run inside a slash command).
Give the user these exact steps:

**Subscription (Pro/Max/Team/Enterprise):**
```
cam add $ARGUMENTS         # runs `claude setup-token` for you, then prompts for the token paste
```

**API key (Console billing):**
```
cam add $ARGUMENTS --api-key-stdin        # paste the key, then press Ctrl-D
```

After adding, they can launch it with `cam use $ARGUMENTS` or switch with
`/claude-account-manager:switch $ARGUMENTS` inside a `cam run` session.
