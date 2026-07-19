import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { NotSupportedError } from '../src/core/errors.js';
import { SubscriptionProvider } from '../src/auth/subscription-provider.js';
import { FileBackend } from '../src/credentials/file-backend.js';
import { makeProfile, tempCam } from './helpers.js';
describe('SubscriptionProvider', () => {
    let ctx;
    let provider;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        provider = new SubscriptionProvider(new FileBackend(ctx.paths));
    });
    after(() => ctx?.cleanup());
    const profile = () => makeProfile('work', { authKind: 'subscription-oauth', credentialRef: 'file:work' });
    test('authenticate stores the token and applyTo injects CLAUDE_CODE_OAUTH_TOKEN', async () => {
        await provider.authenticate(profile(), { secret: '  oauth-tok-abc  ' });
        const lc = { env: {}, configDir: '/tmp/x', args: [] };
        await provider.applyTo(lc, profile());
        assert.equal(lc.env.CLAUDE_CODE_OAUTH_TOKEN, 'oauth-tok-abc');
    });
    test('authenticate rejects empty token', async () => {
        await assert.rejects(() => provider.authenticate(profile(), { secret: '   ' }));
    });
    test('applyTo before authenticate throws a helpful error', async () => {
        const lc = { env: {}, configDir: '/tmp/x', args: [] };
        await assert.rejects(() => provider.applyTo(lc, profile()), /Re-add it/);
    });
    test('refresh is not supported (guides to re-run setup-token)', async () => {
        await assert.rejects(() => provider.refresh(profile()), NotSupportedError);
    });
});
