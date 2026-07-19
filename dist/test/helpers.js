import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CamPaths } from '../src/core/paths.js';
/** Create an isolated CAM_HOME and return its CamPaths plus a cleanup fn. */
export function tempCam() {
    const home = mkdtempSync(join(tmpdir(), 'cam-test-'));
    const paths = new CamPaths({ CAM_HOME: home });
    return { paths, home, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
export function makeProfile(id, over = {}) {
    return {
        id,
        name: over.name ?? id,
        authKind: over.authKind ?? 'subscription-oauth',
        configDir: over.configDir ?? `/tmp/${id}`,
        createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
        ...over,
    };
}
