import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { pathExists, readJson, writeFileAtomic, writeJsonAtomic } from '../core/fsx.js';
import { makeRef, parseRef } from './backend.js';
/**
 * File-based secret store under CAM_HOME/keys, one file per profile.
 *
 * The secret VALUE is written raw to `<id>.key` (0600) so the apiKeyHelper
 * script can `cat` it directly. Optional metadata (expiry, labels) goes in a
 * sidecar `<id>.key.meta.json`. Directory perms are enforced to 0700.
 */
export class FileBackend {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
    metaFile(id) {
        return `${this.paths.keyFile(id)}.meta.json`;
    }
    async get(ref) {
        const { id } = parseRef(ref);
        const keyFile = this.paths.keyFile(id);
        if (!pathExists(keyFile))
            return undefined;
        const value = readFileSync(keyFile, 'utf8');
        const metaPath = this.metaFile(id);
        if (pathExists(metaPath)) {
            const sidecar = readJson(metaPath);
            return { value, ...sidecar };
        }
        return { value };
    }
    async set(ref, cred) {
        const { id } = parseRef(ref);
        this.paths.ensureLayout();
        writeFileAtomic(this.paths.keyFile(id), cred.value, 0o600);
        if (cred.expiresAt !== undefined || cred.meta !== undefined) {
            const sidecar = {};
            if (cred.expiresAt !== undefined)
                sidecar.expiresAt = cred.expiresAt;
            if (cred.meta !== undefined)
                sidecar.meta = cred.meta;
            writeJsonAtomic(this.metaFile(id), sidecar, 0o600);
        }
    }
    async delete(ref) {
        const { id } = parseRef(ref);
        rmSync(this.paths.keyFile(id), { force: true });
        rmSync(this.metaFile(id), { force: true });
    }
    async has(ref) {
        const { id } = parseRef(ref);
        return pathExists(this.paths.keyFile(id));
    }
    async list() {
        if (!pathExists(this.paths.keysDir))
            return [];
        return readdirSync(this.paths.keysDir)
            .filter((f) => f.endsWith('.key'))
            .map((f) => makeRef('file', f.slice(0, -'.key'.length)));
    }
}
