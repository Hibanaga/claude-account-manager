# claude-account-manager (`cam`)

Register **multiple Claude Code accounts**, authenticate each **once**, and switch
between them across sessions with **zero re-login**. Ships as a standalone CLI and
as an installable Claude Code plugin.

> **Honest scope.** Claude Code binds authentication at **process startup**, so
> there is no true in-process hot-swap — you cannot rebind a running session's
> identity. What `cam` does: authenticate each account once, persist the
> credential, and reuse it on every launch. `/switch` stages the next account and a
> launcher loop relaunches into it, which *feels* mid-session but is a relaunch.

## How it works
- Each account is an isolated Claude Code config via `CLAUDE_CONFIG_DIR`
  (`~/.cam/profiles/<name>/`).
- **Subscription** accounts use a long-lived OAuth token from `claude setup-token`,
  stored `0600` and injected as `CLAUDE_CODE_OAUTH_TOKEN` at launch. This is
  portable and works on macOS (see the caveat below).
- **API-key** accounts store the key `0600` and expose it through Claude Code's
  `apiKeyHelper` — the secret never touches argv or `cam`'s own environment.

## Install

```bash
git clone <this-repo> claude-account-manager
cd claude-account-manager
npm install
npm run build
npm link            # puts `cam` on your PATH (or: npm install -g .)
cam --help
```

Requires Node ≥ 18.3 and the `claude` CLI on your PATH.

## Usage

### Add accounts (authenticate once)

Subscription (Pro/Max/Team/Enterprise):
```bash
claude setup-token                      # browser login once; copy the printed token
cam add work --oauth-token-stdin        # paste the token, then Ctrl-D
# or just: cam add work   (interactive — it walks you through the same steps)
```

API key (Console billing):
```bash
cam add ci --api-key-stdin              # paste the key, then Ctrl-D
```

Secrets are read from **stdin only** — never passed as command-line arguments.

### Everyday commands
```bash
cam list                 # show accounts (active marked with *)
cam current              # show the active account
cam status               # active account + whether /switch will relaunch
cam use work -p "hi"     # launch claude as `work`, passing args through
cam switch home          # stage `home` as the next account
cam remove ci            # delete an account and its stored credentials
```

### Mid-session-style switching
Switching only takes effect inside a launcher-loop session, so make every session
one:
```bash
alias claude='cam run'   # add to ~/.zshrc / ~/.bashrc
```
Now `claude` starts the loop. Inside that session, staging a switch (via
`cam switch <name>` or the `/claude-account-manager:switch` command) and then
exiting `claude` (Ctrl-D) makes `cam run` relaunch into the new account
automatically. `cam status` tells you whether the current session is switch-capable
(and `/accounts` shows the same guard).

> Capturing the native `/login` result into `cam` is **not supported**: on macOS
> those credentials live in the Keychain (not relocatable per profile) and are
> refresh-token-based, not portable via a single env var. `claude setup-token` is
> the same browser flow made portable — that's why first-time add is a one-time
> terminal step.

## Use as a Claude Code plugin
This repo doubles as a plugin marketplace.

```
/plugin marketplace add ./path/to/claude-account-manager     # or <owner/repo> once hosted
/plugin install claude-account-manager@cam-marketplace
```

Commands (the CLI must be installed and on PATH — the plugin only shells out to it):
- `/claude-account-manager:accounts` — list accounts + switch-capable status (`cam list` + `cam status`)
- `/claude-account-manager:switch <name>` — stage a switch
- `/claude-account-manager:add-account <name>` — guided add instructions

## Caveats (read these)

- **No true hot-swap.** Switching relaunches `claude`; a running session's auth
  cannot be rebound. This is a Claude Code design constraint, not a `cam` bug.
- **macOS Keychain isolation.** On macOS, Claude Code stores subscription OAuth
  credentials in the shared login **Keychain**, and `CLAUDE_CONFIG_DIR` does *not*
  relocate them (that only works on Linux/Windows). `cam` sidesteps this by using
  `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`, which is per-process and
  Keychain-free. If you instead log in with `/login` inside a profile on macOS,
  accounts will collide in the Keychain — use the token flow.
- **Terms of Service.** Stacking multiple Claude subscription accounts may be
  restricted by Anthropic's Terms of Service and your plan's usage policies. You
  are responsible for ensuring your use complies. This tool does not bypass any
  authentication or rate limit; it only reuses credentials you legitimately
  obtained via the normal login flow.

## Development
```bash
npm test        # builds, then runs unit + integration tests (node:test)
```
Tests use a **stub `claude` binary** and require no real Anthropic credentials.
Zero runtime dependencies. See [DESIGN.md](./DESIGN.md) for architecture and the
verified-vs-assumed Phase-0 findings.

## License
MIT
