import { join } from 'node:path';
import { CamError, NotSupportedError } from '../core/errors.js';
import { pathExists, readJson, writeFileAtomic, writeJsonAtomic } from '../core/fsx.js';
import { parseRef } from '../credentials/backend.js';
/**
 * Console/API-key auth. The key is stored 0600 and consumed at runtime through
 * Claude Code's `apiKeyHelper` setting — a shell command whose stdout becomes
 * the key. This keeps the secret out of argv AND out of cam's own environment:
 * only Claude Code reads it, lazily, from the helper.
 */
export class ApiKeyProvider {
    backend;
    paths;
    kind = 'api-key';
    constructor(backend, paths) {
        this.backend = backend;
        this.paths = paths;
    }
    ref(profile) {
        if (!profile.credentialRef) {
            throw new CamError(`Profile "${profile.id}" has no credentialRef.`);
        }
        return profile.credentialRef;
    }
    async authenticate(profile, input) {
        const key = input.secret?.trim();
        if (!key)
            throw new CamError('No API key provided (expected on stdin).');
        await this.backend.set(this.ref(profile), { value: key });
    }
    async refresh(_profile) {
        throw new NotSupportedError('API keys do not refresh. Re-add with `cam add <name> --api-key-stdin`.');
    }
    async applyTo(ctx, profile) {
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
        let settings = {};
        if (pathExists(settingsPath)) {
            try {
                settings = readJson(settingsPath);
            }
            catch {
                throw new CamError(`Refusing to overwrite unparseable settings.json at ${settingsPath}. Fix or remove it, then retry.`);
            }
        }
        settings.apiKeyHelper = helper;
        writeJsonAtomic(settingsPath, settings, 0o600);
    }
}
