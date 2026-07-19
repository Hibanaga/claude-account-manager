import type { AuthKind, Profile } from '../core/registry.js';

/** Env + config-dir + args assembled just before spawning `claude`. Providers mutate it. */
export interface LaunchContext {
  env: NodeJS.ProcessEnv;
  configDir: string;
  args: string[];
}

/** Secret material gathered by the I/O boundary (CLI) and handed to a provider. */
export interface AuthInput {
  /** Raw secret (OAuth token or API key), read from stdin — never from argv. */
  secret?: string;
}

/**
 * Strategy for authenticating one profile. Implementations persist the secret
 * once (`authenticate`) and inject it at every launch (`applyTo`). New auth
 * backends (Bedrock, Vertex) are added as new implementations without changing
 * callers.
 */
export interface AuthProvider {
  readonly kind: AuthKind;
  /** Persist the credential. Called once per account. */
  authenticate(profile: Profile, input: AuthInput): Promise<void>;
  /** Renew a credential without a full re-login. May throw NotSupportedError. */
  refresh(profile: Profile): Promise<void>;
  /** Mutate the launch context to apply this profile's auth (env vars, helper, …). */
  applyTo(ctx: LaunchContext, profile: Profile): Promise<void>;
}
