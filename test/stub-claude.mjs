#!/usr/bin/env node
// Stand-in for the real `claude` binary used by integration tests.
// Records how it was launched, optionally stages a switch, then exits.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

// `claude setup-token`: print a fake token and exit (never persists anything).
if (process.argv[2] === 'setup-token') {
  process.stdout.write('sk-ant-oat01-STUB-TOKEN\n');
  process.exit(0);
}

const configDir = process.env.CLAUDE_CONFIG_DIR ?? '';
const record = {
  configDir,
  profile: basename(configDir),
  args: process.argv.slice(2),
  hasOAuth: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN),
  hasApiKeyEnv: Boolean(process.env.ANTHROPIC_API_KEY),
};

const out = process.env.STUB_OUT;
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  appendFileSync(out, `${JSON.stringify(record)}\n`);
}

// Simulate an in-session `/switch`: when launched as STUB_SENTINEL_WHEN, stage
// a switch to STUB_SENTINEL_TARGET. The next launch (the target) won't match, so
// the loop terminates naturally.
const target = process.env.STUB_SENTINEL_TARGET;
const when = process.env.STUB_SENTINEL_WHEN;
const home = process.env.CAM_HOME;
if (target && home && basename(configDir) === when) {
  writeFileSync(
    join(home, 'switch'),
    `${JSON.stringify({ target, nonce: randomBytes(4).toString('hex') })}\n`,
  );
}

process.exit(Number(process.env.STUB_EXIT ?? '0'));
