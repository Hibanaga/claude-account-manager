import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { RunLockError } from './errors.js';
import { pathExists } from './fsx.js';
/** True if a process with this pid is alive (and signalable by us). */
function isAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        // ESRCH = no such process; EPERM = exists but not ours (treat as alive).
        return err.code === 'EPERM';
    }
}
/**
 * Acquire the single-writer `cam run` lock for a CAM_HOME. Fails if another
 * live loop holds it; reclaims a stale lock left by a dead process.
 */
export function acquireRunLock(paths, pid = process.pid) {
    paths.ensureLayout();
    const write = () => writeFileSync(paths.lockFile, String(pid), { flag: 'wx', mode: 0o600 });
    try {
        write();
    }
    catch (err) {
        if (err.code !== 'EEXIST')
            throw err;
        const holder = Number.parseInt(readFileSync(paths.lockFile, 'utf8').trim(), 10);
        if (Number.isFinite(holder) && isAlive(holder))
            throw new RunLockError(holder);
        // Stale lock from a dead loop — reclaim it.
        rmSync(paths.lockFile, { force: true });
        write();
    }
}
export function releaseRunLock(paths) {
    if (pathExists(paths.lockFile))
        rmSync(paths.lockFile, { force: true });
}
