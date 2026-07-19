import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, beforeEach, describe, test } from 'node:test';
import { tempCam } from './helpers.js';

// dist/test/integration.test.js -> repo root is two levels up.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAM = join(ROOT, 'bin', 'cam');
const STUB = join(ROOT, 'test', 'stub-claude.mjs');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCam(args: string[], env: NodeJS.ProcessEnv, input?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CAM, ...args], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

interface StubRecord {
  profile: string;
  configDir: string;
  hasOAuth: boolean;
  args: string[];
  inRunLoop: boolean;
}

function readRecords(outFile: string): StubRecord[] {
  return readFileSync(outFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('integration (stub claude, no real credentials)', () => {
  let ctx: ReturnType<typeof tempCam>;
  let baseEnv: NodeJS.ProcessEnv;
  let outFile: string;

  beforeEach(() => {
    ctx?.cleanup();
    ctx = tempCam();
    outFile = join(ctx.home, 'stub-out.jsonl');
    baseEnv = { CAM_HOME: ctx.home, CAM_CLAUDE_BIN: STUB, STUB_OUT: outFile };
  });
  after(() => ctx?.cleanup());

  test('add (oauth via stdin) then use launches with the isolated CLAUDE_CONFIG_DIR + token', async () => {
    const add = await runCam(['add', 'work', '--oauth-token-stdin'], baseEnv, 'oauth-tok-123\n');
    assert.equal(add.code, 0, add.stderr);

    const use = await runCam(['use', 'work', '--dangerously-skip-permissions'], baseEnv);
    assert.equal(use.code, 0, use.stderr);

    const records = readRecords(outFile);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.configDir, ctx.paths.profileConfigDir('work'));
    assert.equal(records[0]?.hasOAuth, true, 'CLAUDE_CODE_OAUTH_TOKEN should be injected');
    assert.equal(records[0]?.inRunLoop, false, 'cam use is one-shot; no run-loop marker');
  });

  test('use passes through extra args to claude', async () => {
    await runCam(['add', 'work', '--oauth-token-stdin'], baseEnv, 'tok\n');
    await runCam(['use', 'work', '-p', 'hello'], baseEnv);
    const rec = readRecords(outFile)[0];
    assert.deepEqual(rec?.args, ['-p', 'hello']);
  });

  test('run honors an in-session /switch: relaunches into the target config dir', async () => {
    await runCam(['add', 'work', '--oauth-token-stdin'], baseEnv, 'tok-w\n');
    await runCam(['add', 'home', '--oauth-token-stdin'], baseEnv, 'tok-h\n');
    // work is active (last added); stub stages a switch to home on the work launch.
    await runCam(['switch', 'work'], baseEnv);

    const run = await runCam(['run'], {
      ...baseEnv,
      CAM_RUN_MAX_ITERATIONS: '2',
      STUB_SENTINEL_WHEN: 'work',
      STUB_SENTINEL_TARGET: 'home',
    });
    assert.equal(run.code, 0, run.stderr);

    const records = readRecords(outFile);
    assert.deepEqual(
      records.map((r) => r.profile),
      ['work', 'home'],
    );
    assert.equal(records[1]?.configDir, ctx.paths.profileConfigDir('home'));
    assert.ok(
      records.every((r) => r.inRunLoop === true),
      'cam run marks every launched session with CAM_RUN_LOOP',
    );
  });

  test('remove deletes the profile and its key file', async () => {
    await runCam(['add', 'work', '--oauth-token-stdin'], baseEnv, 'tok\n');
    const rm = await runCam(['remove', 'work'], baseEnv);
    assert.equal(rm.code, 0, rm.stderr);
    const list = await runCam(['list'], baseEnv);
    assert.match(list.stdout, /No accounts/);
  });
});
