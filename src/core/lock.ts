import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { RunLockError } from './errors.js';
import { pathExists } from './fsx.js';
import type { CamPaths } from './paths.js';

/** True if a process with this pid is alive (and signalable by us). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (treat as alive).
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Acquire the single-writer `cam run` lock for a CAM_HOME. Fails if another
 * live loop holds it; reclaims a stale lock left by a dead process.
 */
export function acquireRunLock(paths: CamPaths, pid = process.pid): void {
  paths.ensureLayout();
  const write = (): void => writeFileSync(paths.lockFile, String(pid), { flag: 'wx', mode: 0o600 });
  try {
    write();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const holder = Number.parseInt(readFileSync(paths.lockFile, 'utf8').trim(), 10);
    if (Number.isFinite(holder) && isAlive(holder)) throw new RunLockError(holder);
    // Stale lock from a dead loop — reclaim it.
    rmSync(paths.lockFile, { force: true });
    write();
  }
}

export function releaseRunLock(paths: CamPaths): void {
  if (pathExists(paths.lockFile)) rmSync(paths.lockFile, { force: true });
}
