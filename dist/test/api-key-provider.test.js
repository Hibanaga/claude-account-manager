import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import { ApiKeyProvider } from '../src/auth/api-key-provider.js';
import { FileBackend } from '../src/credentials/file-backend.js';
import { ensureDir, readJson } from '../src/core/fsx.js';
import { makeProfile, tempCam } from './helpers.js';
describe('ApiKeyProvider', () => {
    let ctx;
    let provider;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        provider = new ApiKeyProvider(new FileBackend(ctx.paths), ctx.paths);
    });
    after(() => ctx?.cleanup());
    const profile = () => {
        const configDir = ctx.paths.profileConfigDir('work');
        return makeProfile('work', { authKind: 'api-key', credentialRef: 'file:work', configDir });
    };
    const launchCtx = (configDir) => ({ env: {}, configDir, args: [] });
    test('applyTo writes a 0700 helper that cats the key file — and no secret in env', async () => {
        const p = profile();
        ensureDir(p.configDir, 0o700);
        await provider.authenticate(p, { secret: 'sk-ant-xyz' });
        const lc = launchCtx(p.configDir);
        await provider.applyTo(lc, p);
        const helper = ctx.paths.helperScript('work');
        assert.equal(statSync(helper).mode & 0o777, 0o700);
        const body = readFileSync(helper, 'utf8');
        assert.match(body, /exec cat /);
        assert.doesNotMatch(body, /sk-ant-xyz/); // helper reads the file, never embeds the key
        assert.equal(lc.env.ANTHROPIC_API_KEY, undefined);
        assert.equal(lc.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    });
    test('settings.json gets apiKeyHelper pointing at the helper script', async () => {
        const p = profile();
        ensureDir(p.configDir, 0o700);
        await provider.authenticate(p, { secret: 'sk-ant-xyz' });
        await provider.applyTo(launchCtx(p.configDir), p);
        const settings = readJson(join(p.configDir, 'settings.json'));
        assert.equal(settings.apiKeyHelper, ctx.paths.helperScript('work'));
    });
    test('merging preserves pre-existing settings keys', async () => {
        const p = profile();
        ensureDir(p.configDir, 0o700);
        writeFileSync(join(p.configDir, 'settings.json'), JSON.stringify({ model: 'opus', theme: 'dark' }));
        await provider.authenticate(p, { secret: 'sk-ant-xyz' });
        await provider.applyTo(launchCtx(p.configDir), p);
        const settings = readJson(join(p.configDir, 'settings.json'));
        assert.equal(settings.model, 'opus');
        assert.equal(settings.theme, 'dark');
        assert.ok(typeof settings.apiKeyHelper === 'string');
    });
    test('refuses to clobber an unparseable settings.json', async () => {
        const p = profile();
        ensureDir(p.configDir, 0o700);
        writeFileSync(join(p.configDir, 'settings.json'), '{ this is not json');
        await provider.authenticate(p, { secret: 'sk-ant-xyz' });
        await assert.rejects(() => provider.applyTo(launchCtx(p.configDir), p), /Refusing to overwrite/);
    });
});
