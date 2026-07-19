import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { after, beforeEach, describe, test } from 'node:test';
import { FileBackend } from '../src/credentials/file-backend.js';
import { tempCam } from './helpers.js';

describe('FileBackend', () => {
  let ctx: ReturnType<typeof tempCam>;
  let backend: FileBackend;

  beforeEach(() => {
    ctx?.cleanup();
    ctx = tempCam();
    backend = new FileBackend(ctx.paths);
  });
  after(() => ctx?.cleanup());

  test('get on missing ref returns undefined', async () => {
    assert.equal(await backend.get('file:work'), undefined);
    assert.equal(await backend.has('file:work'), false);
  });

  test('set then get round-trips the raw value', async () => {
    await backend.set('file:work', { value: 'sk-secret-123' });
    assert.deepEqual(await backend.get('file:work'), { value: 'sk-secret-123' });
    assert.equal(await backend.has('file:work'), true);
  });

  test('key file is stored raw with 0600 perms (helper can cat it)', async () => {
    await backend.set('file:work', { value: 'raw-token' });
    const keyFile = ctx.paths.keyFile('work');
    assert.equal(statSync(keyFile).mode & 0o777, 0o600);
  });

  test('metadata is persisted via sidecar', async () => {
    await backend.set('file:work', {
      value: 'tok',
      expiresAt: '2027-01-01T00:00:00.000Z',
      meta: { account: 'Max' },
    });
    const cred = await backend.get('file:work');
    assert.equal(cred?.expiresAt, '2027-01-01T00:00:00.000Z');
    assert.equal(cred?.meta?.account, 'Max');
  });

  test('bare ref (no scheme) defaults to file backend', async () => {
    await backend.set('work', { value: 'v' });
    assert.equal((await backend.get('file:work'))?.value, 'v');
  });

  test('delete removes value and metadata', async () => {
    await backend.set('file:work', { value: 'v', meta: { a: 'b' } });
    await backend.delete('file:work');
    assert.equal(await backend.has('file:work'), false);
    assert.equal(await backend.get('file:work'), undefined);
  });

  test('list returns file-qualified refs', async () => {
    await backend.set('file:work', { value: 'a' });
    await backend.set('file:home', { value: 'b' });
    assert.deepEqual((await backend.list()).sort(), ['file:home', 'file:work']);
  });
});
