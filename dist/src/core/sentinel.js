import { randomBytes } from 'node:crypto';
import { readFileSync, renameSync, rmSync } from 'node:fs';
import { pathExists, writeJsonAtomic } from './fsx.js';
/**
 * Stage the next profile to switch to. Written atomically so a reader never
 * sees a partial payload. `cam switch` calls this from inside a live session;
 * the surrounding `cam run` loop consumes it after `claude` exits.
 */
export function writeSentinel(paths, target) {
    paths.ensureLayout();
    const payload = { target, nonce: randomBytes(8).toString('hex') };
    writeJsonAtomic(paths.sentinelFile, payload, 0o600);
}
/**
 * Atomically claim the sentinel: rename it aside (so a late concurrent write
 * lands in a fresh sentinel for the next iteration rather than being lost),
 * read the target, delete the claimed copy. Returns undefined if none pending.
 */
export function claimSentinel(paths) {
    if (!pathExists(paths.sentinelFile))
        return undefined;
    const claimed = `${paths.sentinelFile}.claimed`;
    try {
        renameSync(paths.sentinelFile, claimed);
    }
    catch {
        return undefined; // vanished between the check and the claim
    }
    try {
        const payload = JSON.parse(readFileSync(claimed, 'utf8'));
        return payload.target;
    }
    catch {
        return undefined;
    }
    finally {
        rmSync(claimed, { force: true });
    }
}
/** Remove any stale sentinel (crash recovery at loop start). */
export function clearSentinel(paths) {
    rmSync(paths.sentinelFile, { force: true });
    rmSync(`${paths.sentinelFile}.claimed`, { force: true });
}
