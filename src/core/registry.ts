import type { CamPaths } from './paths.js';
import { assertValidProfileId } from './paths.js';
import { ProfileExistsError, ProfileNotFoundError } from './errors.js';
import { pathExists, readJson, writeJsonAtomic } from './fsx.js';

/** How a profile authenticates to Claude Code. `bedrock`/`vertex` are reserved (not yet implemented). */
export type AuthKind = 'subscription-oauth' | 'api-key' | 'bedrock' | 'vertex';

export interface Profile {
  /** Stable slug; immutable; used to derive filesystem paths. */
  readonly id: string;
  /** User-facing label; renamable. */
  name: string;
  authKind: AuthKind;
  /** Absolute path used as CLAUDE_CONFIG_DIR for this profile. */
  configDir: string;
  /** Backend-qualified handle to the secret (e.g. "file:work"). Never the secret itself. */
  credentialRef?: string;
  /** Extra non-secret env vars applied at launch (e.g. ANTHROPIC_BASE_URL). */
  env?: Record<string, string>;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RegistryData {
  version: 1;
  activeProfileId: string | null;
  profiles: Profile[];
}

const EMPTY: RegistryData = { version: 1, activeProfileId: null, profiles: [] };

/**
 * Persistent store of profiles + the active-profile pointer, backed by
 * registry.json. Holds NO secrets. Every mutation writes atomically.
 */
export class Registry {
  constructor(private readonly paths: CamPaths) {}

  private read(): RegistryData {
    if (!pathExists(this.paths.registryFile)) return structuredClone(EMPTY);
    const data = readJson<RegistryData>(this.paths.registryFile);
    return { version: 1, activeProfileId: data.activeProfileId ?? null, profiles: data.profiles ?? [] };
  }

  private write(data: RegistryData): void {
    this.paths.ensureLayout();
    writeJsonAtomic(this.paths.registryFile, data, 0o600);
  }

  list(): Profile[] {
    return this.read().profiles;
  }

  get(id: string): Profile | undefined {
    return this.read().profiles.find((p) => p.id === id);
  }

  getOrThrow(id: string): Profile {
    const p = this.get(id);
    if (!p) throw new ProfileNotFoundError(id);
    return p;
  }

  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  add(profile: Profile): void {
    assertValidProfileId(profile.id);
    const data = this.read();
    if (data.profiles.some((p) => p.id === profile.id)) throw new ProfileExistsError(profile.id);
    data.profiles.push(profile);
    this.write(data);
  }

  /** Apply a partial update to an existing profile (id is immutable). */
  update(id: string, patch: Partial<Omit<Profile, 'id'>>): Profile {
    const data = this.read();
    const p = data.profiles.find((x) => x.id === id);
    if (!p) throw new ProfileNotFoundError(id);
    Object.assign(p, patch);
    this.write(data);
    return p;
  }

  remove(id: string): void {
    const data = this.read();
    const idx = data.profiles.findIndex((p) => p.id === id);
    if (idx === -1) throw new ProfileNotFoundError(id);
    data.profiles.splice(idx, 1);
    if (data.activeProfileId === id) data.activeProfileId = null;
    this.write(data);
  }

  setActive(id: string): void {
    const data = this.read();
    if (!data.profiles.some((p) => p.id === id)) throw new ProfileNotFoundError(id);
    data.activeProfileId = id;
    this.write(data);
  }

  getActive(): Profile | undefined {
    const data = this.read();
    if (!data.activeProfileId) return undefined;
    return data.profiles.find((p) => p.id === data.activeProfileId);
  }
}
