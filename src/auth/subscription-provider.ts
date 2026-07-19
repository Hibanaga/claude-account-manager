import { CamError, NotSupportedError } from '../core/errors.js';
import type { Profile } from '../core/registry.js';
import type { CredentialBackend } from '../credentials/backend.js';
import type { AuthInput, AuthProvider, LaunchContext } from './provider.js';

/**
 * Subscription (Pro/Max/Team/Enterprise) auth via a long-lived OAuth token.
 *
 * The user runs `claude setup-token` once (browser flow); it PRINTS a ~1-year
 * token and does not persist it anywhere. We capture that token via stdin,
 * store it 0600, and inject it as CLAUDE_CODE_OAUTH_TOKEN at every launch.
 * This is portable and Keychain-free, so it isolates accounts on macOS too
 * (where CLAUDE_CONFIG_DIR does NOT relocate the shared Keychain credential).
 */
export class SubscriptionProvider implements AuthProvider {
  readonly kind = 'subscription-oauth' as const;

  constructor(private readonly backend: CredentialBackend) {}

  private ref(profile: Profile): string {
    if (!profile.credentialRef) {
      throw new CamError(`Profile "${profile.id}" has no credentialRef.`);
    }
    return profile.credentialRef;
  }

  async authenticate(profile: Profile, input: AuthInput): Promise<void> {
    const token = input.secret?.trim();
    if (!token) {
      throw new CamError(
        'No OAuth token provided. Run `claude setup-token`, then paste the printed token.',
      );
    }
    await this.backend.set(this.ref(profile), { value: token });
  }

  async refresh(_profile: Profile): Promise<void> {
    // setup-token yields a static ~1-year token with no exposed refresh flow.
    throw new NotSupportedError(
      'Renew a subscription token by re-running `claude setup-token` and `cam add <name> --oauth-token-stdin`.',
    );
  }

  async applyTo(ctx: LaunchContext, profile: Profile): Promise<void> {
    const cred = await this.backend.get(this.ref(profile));
    if (!cred) {
      throw new CamError(
        `Missing OAuth token for profile "${profile.id}". Re-add it with \`cam add ${profile.id} --oauth-token-stdin\`.`,
      );
    }
    ctx.env.CLAUDE_CODE_OAUTH_TOKEN = cred.value;
  }
}
