import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
/**
 * Write a file atomically: write to a uniquely-named temp file in the SAME
 * directory (so rename is atomic on the same filesystem), chmod, then rename
 * over the target. A concurrent reader sees either the old file or the new one,
 * never a partial write.
 */
export function writeFileAtomic(path, data, mode = 0o600) {
    const tmp = join(dirname(path), `.tmp-${randomBytes(6).toString('hex')}`);
    writeFileSync(tmp, data, { mode });
    // writeFileSync only applies `mode` when creating; chmod guarantees it.
    chmodSync(tmp, mode);
    renameSync(tmp, path);
}
export function writeJsonAtomic(path, value, mode = 0o600) {
    writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}
export function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
export function pathExists(path) {
    try {
        statSync(path);
        return true;
    }
    catch {
        return false;
    }
}
/** Create a directory (recursive) and enforce its mode. */
export function ensureDir(path, mode = 0o700) {
    mkdirSync(path, { recursive: true, mode });
    chmodSync(path, mode);
}
