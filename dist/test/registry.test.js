import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';
import { ProfileExistsError, ProfileNotFoundError } from '../src/core/errors.js';
import { Registry } from '../src/core/registry.js';
import { makeProfile, tempCam } from './helpers.js';
describe('Registry', () => {
    let ctx;
    let reg;
    beforeEach(() => {
        ctx?.cleanup();
        ctx = tempCam();
        reg = new Registry(ctx.paths);
    });
    after(() => ctx?.cleanup());
    test('empty registry lists nothing and has no active profile', () => {
        assert.deepEqual(reg.list(), []);
        assert.equal(reg.getActive(), undefined);
    });
    test('add then get round-trips and persists across instances', () => {
        reg.add(makeProfile('work', { name: 'Work' }));
        const fresh = new Registry(ctx.paths);
        assert.equal(fresh.getOrThrow('work').name, 'Work');
    });
    test('adding a duplicate id throws', () => {
        reg.add(makeProfile('work'));
        assert.throws(() => reg.add(makeProfile('work')), ProfileExistsError);
    });
    test('registry file is written with 0600 perms', () => {
        reg.add(makeProfile('work'));
        assert.equal(statSync(ctx.paths.registryFile).mode & 0o777, 0o600);
    });
    test('setActive requires an existing profile', () => {
        assert.throws(() => reg.setActive('ghost'), ProfileNotFoundError);
        reg.add(makeProfile('work'));
        reg.setActive('work');
        assert.equal(reg.getActive()?.id, 'work');
    });
    test('removing the active profile clears the active pointer', () => {
        reg.add(makeProfile('work'));
        reg.setActive('work');
        reg.remove('work');
        assert.equal(reg.getActive(), undefined);
        assert.throws(() => reg.remove('work'), ProfileNotFoundError);
    });
    test('update patches fields but keeps id', () => {
        reg.add(makeProfile('work', { name: 'Old' }));
        const p = reg.update('work', { name: 'New', lastUsedAt: '2026-07-19T00:00:00.000Z' });
        assert.equal(p.id, 'work');
        assert.equal(p.name, 'New');
        assert.equal(reg.getOrThrow('work').lastUsedAt, '2026-07-19T00:00:00.000Z');
    });
});
