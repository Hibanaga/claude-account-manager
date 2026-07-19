# DESIGN — claude-account-manager (`cam`)

## Problem
Claude Code binds authentication at **process startup**. You cannot rebind the
identity of a running process. So "switch accounts" cannot mean in-process
hot-swap. What *is* achievable — and what this tool does — is: authenticate each
account **once**, persist its credential, and **reuse** it on every later launch
with zero re-login. Silent token refresh from a stored refresh token (where the
platform supports it) is not re-login.

## Phase-0 findings — verified vs assumed
Source: `code.claude.com/docs` (the `docs.anthropic.com/en/docs/claude-code/*`
URLs now 301-redirect there). Checked on 2026-07-19.

### VERIFIED
- **plugin.json** lives at `.claude-plugin/plugin.json`. Required: `name`.
  Optional: `description`, `version` (omit → git commit SHA is the version),
  `author`, `homepage`, `repository`, `license`, `keywords`. Component dirs
  (`commands/`, `skills/`, …) live at the **plugin root**, never inside
  `.claude-plugin/`.
- **marketplace.json** lives at `.claude-plugin/marketplace.json`. Required:
  `name` (kebab-case, not a reserved name), `owner {name}`, `plugins[]`. Each
  plugin entry needs `name` + `source`; a same-repo plugin uses a relative
  `source` string starting `./` resolved from the marketplace root.
- **Install flow:** `/plugin marketplace add <owner/repo | ./path>` then
  `/plugin install <plugin>@<marketplace>`. Validate with `claude plugin validate .`
  (this repo passes).
- **Credential storage** (the decisive facts):
  - macOS → encrypted **Keychain** (not a file).
  - Linux → `~/.claude/.credentials.json`, mode `0600`.
  - Windows → `%USERPROFILE%\.claude\.credentials.json`.
  - `CLAUDE_CONFIG_DIR` relocates `.credentials.json` **only on Linux/Windows**.
    → On macOS, per-config-dir OAuth isolation does **not** hold; the Keychain is
    shared across config dirs. This is the core macOS caveat.
- **Auth precedence** (high→low): Bedrock/Vertex/Foundry → `ANTHROPIC_AUTH_TOKEN`
  → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` →
  subscription OAuth from `/login`.
- **`claude setup-token`**: one browser flow; **prints a ~1-year OAuth token to the
  terminal and does not persist it anywhere** — you copy it and set
  `CLAUDE_CODE_OAUTH_TOKEN`. Requires a Pro/Max/Team/Enterprise plan; the token can
  only make model requests.
- **`apiKeyHelper`**: a settings.json key naming a shell command whose stdout is
  used as the API key. Keeps the secret out of argv and out of the parent env.

### ASSUMED / TODO
- Exact `commands/*.md` frontmatter fields (`description`, `argument-hint`,
  `allowed-tools`) and the `` !`cmd` `` bash-exec syntax follow documented
  conventions; `claude plugin validate .` passes at the marketplace level. Full
  runtime load of the commands was not exercised in CI (no auth in the test env).
- The printed-token format of `setup-token` may vary across CLI versions, so we
  **never parse it** — capture is via stdin paste (`--oauth-token-stdin`), the
  stable contract.
- A macOS file-based credential fallback is claimed by third-party blogs but is
  **not** in the official docs; we do not rely on it.

## Key decision — subscription auth mechanism
Because `CLAUDE_CONFIG_DIR` does not isolate the macOS Keychain, running `/login`
per config dir would make macOS subscription profiles collide. Instead, the
primary mechanism is **`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`**:

1. User runs `claude setup-token` once per account (browser); copies the token.
2. `cam` stores it in a `0600` file it owns.
3. At launch, `cam` injects it as `CLAUDE_CODE_OAUTH_TOKEN` for the child only.

This is portable (works identically on macOS/Linux/Windows), Keychain-free, and
sits above subscription-`/login` in the precedence order, so it deterministically
selects the intended account. The isolated-`/login` `.credentials.json` route
(with real refresh-token silent refresh) remains a documented Linux/Windows
alternative.

## Architecture
Three layers, interface-driven so new providers/backends are added as adapters.

- **Core** (`src/core/`): `registry.ts` (profiles + active pointer, atomic writes,
  no secrets), `run-loop.ts` + `sentinel.ts` + `lock.ts` (the switch orchestrator),
  `paths.ts` (CAM_HOME layout + id validation), `fsx.ts` (atomic file helpers).
- **Adapters**:
  - `AuthProvider { authenticate, refresh, applyTo(LaunchContext) }` —
    `SubscriptionProvider` (OAuth token) and `ApiKeyProvider` (apiKeyHelper).
    `applyTo` *mutates* a `LaunchContext {env, configDir, args}`, so Bedrock/Vertex
    can later set several env vars + touch the config dir without changing callers.
  - `CredentialBackend { get, set, delete, has, list }` — `FileBackend` (0600
    files under `~/.cam/keys`). `KeychainBackend` is a stub. Refs are
    backend-qualified (`file:<id>` / `keychain:<id>`).
  - `Launcher` — spawns `claude` with inherited stdio (Node has no real `execve`),
    ignores SIGINT/SIGTERM in the parent so the TTY delivers them to the child.
- **CLI** (`src/cli.ts`): `add`, `list`, `use`, `switch`, `remove`, `current`,
  `run`. Fully usable without the plugin.
- **Plugin**: `commands/*.md` that shell out to `cam`. No business logic.

### Switch orchestrator
`cam run` is a bounded, dependency-injected loop guarded by a per-`CAM_HOME`
lockfile (with dead-PID reclaim). It launches the active profile; when `claude`
exits **cleanly**, it atomically claims a switch sentinel (`rename`-to-claim so a
late write is never lost), validates the target, sets it active, and relaunches.
A child killed by a signal ends the loop. `cam switch <name>` (invoked by the
`/switch` command) writes that sentinel and updates the active pointer.

## Data model
- `~/.cam/registry.json` — metadata + active pointer, **no secrets**.
- `~/.cam/profiles/<id>/` — the profile's `CLAUDE_CONFIG_DIR`.
- `~/.cam/keys/<id>.key` (+ `-helper.sh`, `.meta.json`) — secrets, `0600` / dir `0700`.
- `id` is validated `^[a-z0-9][a-z0-9_-]{0,63}$`; filesystem paths derive from `id`,
  never from the user-facing `name` (traversal guard).

## Security
- Secrets never in argv; the OAuth token rides only in the spawned child's `env`,
  never in cam's own `process.env`. Inherited auth env vars are stripped before a
  launch so the profile fully controls auth. Directory `0700`, key files `0600`.
  Atomic writes everywhere. Errors/logs print ids, never secret values.

## Deferred (interface stubs + TODOs only)
- `KeychainBackend` (macOS `security` CLI).
- Near-live no-relaunch switching.
- Bedrock/Vertex providers (`AuthKind` reserved; factory throws `NotSupportedError`).
