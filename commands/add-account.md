---
description: Register a new Claude Code account with cam
argument-hint: <name>
---

The user wants to add a new cam account named `$ARGUMENTS`.

Adding a subscription account needs an interactive browser flow, which can't run
inside a slash command. Give the user these exact terminal steps:

**Subscription (Pro/Max/Team/Enterprise):**
```
claude setup-token                        # complete browser login; copy the printed token
cam add $ARGUMENTS --oauth-token-stdin    # paste the token, then press Ctrl-D
```

**API key (Console billing):**
```
cam add $ARGUMENTS --api-key-stdin        # paste the key, then press Ctrl-D
```

After adding, they can launch it with `cam use $ARGUMENTS` or switch with
`/claude-account-manager:switch $ARGUMENTS` inside a `cam run` session.
