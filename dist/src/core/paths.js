import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { InvalidProfileIdError } from './errors.js';
import { ensureDir } from './fsx.js';
const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Validate a profile id used to derive filesystem paths (guards traversal). */
export function assertValidProfileId(id) {
    if (!PROFILE_ID_RE.test(id))
        throw new InvalidProfileIdError(id);
}
export function isValidProfileId(id) {
    return PROFILE_ID_RE.test(id);
}
/**
 * All cam paths, rooted at CAM_HOME (default ~/.cam). Injectable via the
 * CAM_HOME env var, which makes the whole tool testable in isolation.
 */
export class CamPaths {
    home;
    constructor(env = process.env) {
        const raw = env.CAM_HOME?.trim();
        this.home = raw && raw.length > 0 ? raw : join(homedir(), '.cam');
        if (!isAbsolute(this.home)) {
            throw new Error(`CAM_HOME must be an absolute path, got "${this.home}".`);
        }
    }
    get registryFile() {
        return join(this.home, 'registry.json');
    }
    get keysDir() {
        return join(this.home, 'keys');
    }
    get profilesDir() {
        return join(this.home, 'profiles');
    }
    get lockFile() {
        return join(this.home, 'run.lock');
    }
    get sentinelFile() {
        return join(this.home, 'switch');
    }
    /** The isolated CLAUDE_CONFIG_DIR for a profile. */
    profileConfigDir(id) {
        assertValidProfileId(id);
        return join(this.profilesDir, id);
    }
    keyFile(id) {
        assertValidProfileId(id);
        return join(this.keysDir, `${id}.key`);
    }
    helperScript(id) {
        assertValidProfileId(id);
        return join(this.keysDir, `${id}-helper.sh`);
    }
    /** Create the base directory layout with locked-down permissions. */
    ensureLayout() {
        ensureDir(this.home, 0o700);
        ensureDir(this.keysDir, 0o700);
        ensureDir(this.profilesDir, 0o700);
    }
}
