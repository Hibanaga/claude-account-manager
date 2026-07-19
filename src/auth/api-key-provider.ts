import { join } from 'node:path';
import { CamError, NotSupportedError } from '../core/errors.js';
import { pathExists, readJson, writeFileAtomic, writeJsonAtomic } from '../core/fsx.js';
import type { CamPaths } from '../core/paths.js';
import type { Profile } from '../core/registry.js';
import type { CredentialBackend } from '../credentials/backend.js';
import { parseRef } from '../credentials/backend.js';
import type { AuthInput, AuthProvider, LaunchContext } from './provider.js';

/**
 * Console/API-key auth. The key is stored 0600 and consumed at runtime through
 * Claude Code's `apiKeyHelper` setting — a shell command whose stdout becomes
 * the key. This keeps the secret out of argv AND out of cam's own environment:
 * only Claude Code reads it, lazily, from the helper.
 */
export class ApiKeyProvider implements AuthProvider {
  readonly kind = 'api-key' as const;

  constructor(
    private readonly backend: CredentialBackend,
    private readonly paths: CamPaths,
  ) {}

  private ref(profile: Profile): string {
    if (!profile.credentialRef) {
      throw new CamError(`Profile "${profile.id}" has no credentialRef.`);
    }
    return profile.credentialRef;
  }

  async authenticate(profile: Profile, input: AuthInput): Promise<void> {
    const key = input.secret?.trim();
    if (!key) throw new CamError('No API key provided (expected on stdin).');
    await this.backend.set(this.ref(profile), { value: key });
  }

  async refresh(_profile: Profile): Promise<void> {
    throw new NotSupportedError('API keys do not refresh. Re-add with `cam add <name> --api-key-stdin`.');
  }

  async applyTo(ctx: LaunchContext, profile: Profile): Promise<void> {
    const { id } = parseRef(this.ref(profile));
    const keyFile = this.paths.keyFile(id);
    if (!pathExists(keyFile)) {
      throw new CamError(`Missing API key for profile "${profile.id}". Re-add with \`cam add ${profile.id} --api-key-stdin\`.`);
    }

    // Helper script reads the 0600 key file at runtime — it never embeds the key.
    const helper = this.paths.helperScript(id);
    writeFileAtomic(helper, `#!/bin/sh\nexec cat ${JSON.stringify(keyFile)}\n`, 0o700);

    // Merge apiKeyHelper into the profile's isolated settings.json without
    // clobbering existing keys. Refuse rather than destroy on a parse error.
    const settingsPath = join(ctx.configDir, 'settings.json');
    let settings: Record<string, unknown> = {};
    if (pathExists(settingsPath)) {
      try {
        settings = readJson<Record<string, unknown>>(settingsPath);
      } catch {
        throw new CamError(
          `Refusing to overwrite unparseable settings.json at ${settingsPath}. Fix or remove it, then retry.`,
        );
      }
    }
    settings.apiKeyHelper = helper;
    writeJsonAtomic(settingsPath, settings, 0o600);
  }
}
