import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { NoActiveProfileError, RunLockError } from '../src/core/errors.js';
import { acquireRunLock } from '../src/core/lock.js';
import { runLoop } from '../src/core/run-loop.js';
import { Registry } from '../src/core/registry.js';
import { writeSentinel } from '../src/core/sentinel.js';
import { makeProfile, tempCam } from './helpers.js';
const clean = { code: 0, signal: null };
describe('runLoop', () => {
    let ctx;
    let reg;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        reg = new Registry(ctx.paths);
    });
    after(() => ctx?.cleanup());
    test('launches the active profile once when no switch is pending', async () => {
        reg.add(makeProfile('work'));
        reg.setActive('work');
        const launched = [];
        await runLoop({
            paths: ctx.paths,
            registry: reg,
            maxIterations: 3,
            launch: async (p) => {
                launched.push(p.id);
                return clean;
            },
        });
        assert.deepEqual(launched, ['work']);
    });
    test('consumes a switch sentinel and relaunches into the target', async () => {
        reg.add(makeProfile('work'));
        reg.add(makeProfile('home'));
        reg.setActive('work');
        const launched = [];
        await runLoop({
            paths: ctx.paths,
            registry: reg,
            maxIterations: 2,
            launch: async (p) => {
                launched.push(p.id);
                if (p.id === 'work')
                    writeSentinel(ctx.paths, 'home'); // simulate in-session /switch
                return clean;
            },
        });
        assert.deepEqual(launched, ['work', 'home']);
        assert.equal(reg.getActive()?.id, 'home');
    });
    test('stops when the child is killed by a signal', async () => {
        reg.add(makeProfile('work'));
        reg.setActive('work');
        const launched = [];
        await runLoop({
            paths: ctx.paths,
            registry: reg,
            maxIterations: 5,
            launch: async (p) => {
                launched.push(p.id);
                writeSentinel(ctx.paths, 'work'); // even with a pending switch...
                return { code: null, signal: 'SIGINT' }; // ...a signal stops the loop
            },
        });
        assert.deepEqual(launched, ['work']);
    });
    test('ignores a switch to an unknown profile and stops', async () => {
        reg.add(makeProfile('work'));
        reg.setActive('work');
        const launched = [];
        const logs = [];
        await runLoop({
            paths: ctx.paths,
            registry: reg,
            maxIterations: 5,
            log: (m) => logs.push(m),
            launch: async (p) => {
                launched.push(p.id);
                if (p.id === 'work')
                    writeSentinel(ctx.paths, 'ghost');
                return clean;
            },
        });
        assert.deepEqual(launched, ['work']);
        assert.ok(logs.some((l) => l.includes('unknown profile')));
    });
    test('throws when no active profile is set', async () => {
        await assert.rejects(() => runLoop({ paths: ctx.paths, registry: reg, launch: async () => clean }), NoActiveProfileError);
    });
    test('refuses to start when a live run lock is held', async () => {
        reg.add(makeProfile('work'));
        reg.setActive('work');
        acquireRunLock(ctx.paths, process.pid); // current pid is alive → held
        await assert.rejects(() => runLoop({ paths: ctx.paths, registry: reg, maxIterations: 1, launch: async () => clean }), RunLockError);
    });
});
