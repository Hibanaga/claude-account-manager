import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';
import { buildApp, cmdAdd, cmdStatus, cmdSwitch } from '../src/cli.js';
import { CamError } from '../src/core/errors.js';
import { makeRef } from '../src/credentials/backend.js';
import { makeProfile, tempCam } from './helpers.js';
function sentinelTarget(home) {
    return JSON.parse(readFileSync(`${home}/switch`, 'utf8')).target;
}
/** Capture everything written to process.stdout while `fn` runs. */
async function captureStdout(fn) {
    const original = process.stdout.write.bind(process.stdout);
    let out = '';
    process.stdout.write = ((chunk) => {
        out += chunk.toString();
        return true;
    });
    try {
        await fn();
    }
    finally {
        process.stdout.write = original;
    }
    return out;
}
describe('cmdAdd — drives claude setup-token', () => {
    let ctx;
    let env;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        env = { CAM_HOME: ctx.home };
    });
    after(() => ctx?.cleanup());
    test('launches setup-token, then stores the pasted token and sets active', async () => {
        const app = buildApp(env);
        const launched = [];
        await cmdAdd(app, env, ['work'], {
            isInteractive: () => true,
            promptLine: async () => 'oauth-tok-xyz',
            launchSetupToken: async (_bin, _dir, _e) => {
                launched.push(['setup-token']);
                return { code: 0, signal: null };
            },
        });
        assert.equal(launched.length, 1, 'setup-token should be launched once');
        assert.equal(app.registry.getActive()?.id, 'work');
        const cred = await app.backend.get(makeRef('file', 'work'));
        assert.equal(cred?.value, 'oauth-tok-xyz');
    });
    test('aborts (throws, no profile added) when setup-token exits non-zero', async () => {
        const app = buildApp(env);
        let prompted = false;
        await assert.rejects(cmdAdd(app, env, ['work'], {
            isInteractive: () => true,
            promptLine: async () => {
                prompted = true;
                return 'nope';
            },
            launchSetupToken: async () => ({ code: 1, signal: null }),
        }), CamError);
        assert.equal(prompted, false, 'must not prompt for a token after a failed login');
        assert.equal(app.registry.has('work'), false);
    });
});
describe('cmdSwitch — by name, number, and interactive picker', () => {
    let ctx;
    let env;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        env = { CAM_HOME: ctx.home };
    });
    after(() => ctx?.cleanup());
    function seedTwo() {
        const app = buildApp(env);
        app.registry.add(makeProfile('work'));
        app.registry.add(makeProfile('home'));
        app.registry.setActive('work');
        return app;
    }
    test('switch by 1-based number stages the nth account', async () => {
        const app = seedTwo();
        await cmdSwitch(app, ['2']);
        assert.equal(app.registry.getActive()?.id, 'home');
        assert.equal(sentinelTarget(ctx.home), 'home');
    });
    test('switch by name stages that account', async () => {
        const app = seedTwo();
        await cmdSwitch(app, ['work']);
        assert.equal(app.registry.getActive()?.id, 'work');
        assert.equal(sentinelTarget(ctx.home), 'work');
    });
    test('out-of-range number throws', async () => {
        const app = seedTwo();
        await assert.rejects(cmdSwitch(app, ['9']), CamError);
    });
    test('unknown name throws', async () => {
        const app = seedTwo();
        await assert.rejects(cmdSwitch(app, ['nope']), CamError);
    });
    test('interactive picker resolves the entered choice', async () => {
        const app = seedTwo();
        await cmdSwitch(app, [], {
            isInteractive: () => true,
            promptLine: async () => '2',
            inRunLoop: () => true,
        });
        assert.equal(app.registry.getActive()?.id, 'home');
        assert.equal(sentinelTarget(ctx.home), 'home');
    });
    test('interactive picker cancels on blank input, leaving active unchanged', async () => {
        const app = seedTwo();
        await cmdSwitch(app, [], {
            isInteractive: () => true,
            promptLine: async () => '',
            inRunLoop: () => true,
        });
        assert.equal(app.registry.getActive()?.id, 'work');
    });
    test('warns and still stages when not in a cam run session', async () => {
        const app = seedTwo();
        const out = await captureStdout(() => cmdSwitch(app, ['2'], {
            isInteractive: () => false,
            promptLine: async () => '',
            inRunLoop: () => false,
        }));
        assert.match(out, /won't take effect/);
        assert.equal(sentinelTarget(ctx.home), 'home', 'sentinel is still written');
    });
    test('no warning when in a cam run session', async () => {
        const app = seedTwo();
        const out = await captureStdout(() => cmdSwitch(app, ['2'], {
            isInteractive: () => false,
            promptLine: async () => '',
            inRunLoop: () => true,
        }));
        assert.doesNotMatch(out, /won't take effect/);
    });
});
describe('cmdStatus — reports active account and run-loop state', () => {
    let ctx;
    let env;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        env = { CAM_HOME: ctx.home };
    });
    after(() => ctx?.cleanup());
    test('in a cam run session', async () => {
        const app = buildApp(env);
        app.registry.add(makeProfile('work'));
        app.registry.setActive('work');
        const out = await captureStdout(() => cmdStatus(app, { CAM_RUN_LOOP: '1' }));
        assert.match(out, /Active: work/);
        assert.match(out, /✓ in a 'cam run' session/);
    });
    test('not in a cam run session', async () => {
        const app = buildApp(env);
        app.registry.add(makeProfile('work'));
        app.registry.setActive('work');
        const out = await captureStdout(() => cmdStatus(app, {}));
        assert.match(out, /✗ not in a 'cam run' session/);
        assert.match(out, /cam run/);
    });
    test('no active account', async () => {
        const app = buildApp(env);
        const out = await captureStdout(() => cmdStatus(app, {}));
        assert.match(out, /No active account/);
    });
});
