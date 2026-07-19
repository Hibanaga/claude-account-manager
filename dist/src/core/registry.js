import { assertValidProfileId } from './paths.js';
import { ProfileExistsError, ProfileNotFoundError } from './errors.js';
import { pathExists, readJson, writeJsonAtomic } from './fsx.js';
const EMPTY = { version: 1, activeProfileId: null, profiles: [] };
/**
 * Persistent store of profiles + the active-profile pointer, backed by
 * registry.json. Holds NO secrets. Every mutation writes atomically.
 */
export class Registry {
    paths;
    constructor(paths) {
        this.paths = paths;
    }
    read() {
        if (!pathExists(this.paths.registryFile))
            return structuredClone(EMPTY);
        const data = readJson(this.paths.registryFile);
        return { version: 1, activeProfileId: data.activeProfileId ?? null, profiles: data.profiles ?? [] };
    }
    write(data) {
        this.paths.ensureLayout();
        writeJsonAtomic(this.paths.registryFile, data, 0o600);
    }
    list() {
        return this.read().profiles;
    }
    get(id) {
        return this.read().profiles.find((p) => p.id === id);
    }
    getOrThrow(id) {
        const p = this.get(id);
        if (!p)
            throw new ProfileNotFoundError(id);
        return p;
    }
    has(id) {
        return this.get(id) !== undefined;
    }
    add(profile) {
        assertValidProfileId(profile.id);
        const data = this.read();
        if (data.profiles.some((p) => p.id === profile.id))
            throw new ProfileExistsError(profile.id);
        data.profiles.push(profile);
        this.write(data);
    }
    /** Apply a partial update to an existing profile (id is immutable). */
    update(id, patch) {
        const data = this.read();
        const p = data.profiles.find((x) => x.id === id);
        if (!p)
            throw new ProfileNotFoundError(id);
        Object.assign(p, patch);
        this.write(data);
        return p;
    }
    remove(id) {
        const data = this.read();
        const idx = data.profiles.findIndex((p) => p.id === id);
        if (idx === -1)
            throw new ProfileNotFoundError(id);
        data.profiles.splice(idx, 1);
        if (data.activeProfileId === id)
            data.activeProfileId = null;
        this.write(data);
    }
    setActive(id) {
        const data = this.read();
        if (!data.profiles.some((p) => p.id === id))
            throw new ProfileNotFoundError(id);
        data.activeProfileId = id;
        this.write(data);
    }
    getActive() {
        const data = this.read();
        if (!data.activeProfileId)
            return undefined;
        return data.profiles.find((p) => p.id === data.activeProfileId);
    }
}
