import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CamPaths } from '../src/core/paths.js';
import type { Profile } from '../src/core/registry.js';

/** Create an isolated CAM_HOME and return its CamPaths plus a cleanup fn. */
export function tempCam(): { paths: CamPaths; home: string; cleanup: () => void } {
  const home = mkdtempSync(join(tmpdir(), 'cam-test-'));
  const paths = new CamPaths({ CAM_HOME: home } as NodeJS.ProcessEnv);
  return { paths, home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

export function makeProfile(id: string, over: Partial<Profile> = {}): Profile {
  return {
    id,
    name: over.name ?? id,
    authKind: over.authKind ?? 'subscription-oauth',
    configDir: over.configDir ?? `/tmp/${id}`,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    ...over,
  };
}
