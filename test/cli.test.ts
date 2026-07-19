import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';
import { buildApp, cmdAdd, cmdSwitch } from '../src/cli.js';
import { CamError } from '../src/core/errors.js';
import { makeRef } from '../src/credentials/backend.js';
import type { LaunchResult } from '../src/launcher.js';
import { makeProfile, tempCam } from './helpers.js';

function sentinelTarget(home: string): string {
  return JSON.parse(readFileSync(`${home}/switch`, 'utf8')).target;
}

describe('cmdAdd — drives claude setup-token', () => {
  let ctx: ReturnType<typeof tempCam>;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    ctx?.cleanup();
    ctx = tempCam();
    env = { CAM_HOME: ctx.home };
  });
  after(() => ctx?.cleanup());

  test('launches setup-token, then stores the pasted token and sets active', async () => {
    const app = buildApp(env);
    const launched: string[][] = [];
    await cmdAdd(app, env, ['work'], {
      isInteractive: () => true,
      promptLine: async () => 'oauth-tok-xyz',
      launchSetupToken: async (_bin, _dir, _e): Promise<LaunchResult> => {
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
    await assert.rejects(
      cmdAdd(app, env, ['work'], {
        isInteractive: () => true,
        promptLine: async () => {
          prompted = true;
          return 'nope';
        },
        launchSetupToken: async (): Promise<LaunchResult> => ({ code: 1, signal: null }),
      }),
      CamError,
    );
    assert.equal(prompted, false, 'must not prompt for a token after a failed login');
    assert.equal(app.registry.has('work'), false);
  });
});

describe('cmdSwitch — by name, number, and interactive picker', () => {
  let ctx: ReturnType<typeof tempCam>;
  let env: NodeJS.ProcessEnv;

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
    await cmdSwitch(app, [], { isInteractive: () => true, promptLine: async () => '2' });
    assert.equal(app.registry.getActive()?.id, 'home');
    assert.equal(sentinelTarget(ctx.home), 'home');
  });

  test('interactive picker cancels on blank input, leaving active unchanged', async () => {
    const app = seedTwo();
    await cmdSwitch(app, [], { isInteractive: () => true, promptLine: async () => '' });
    assert.equal(app.registry.getActive()?.id, 'work');
  });
});
