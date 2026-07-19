/** A stored secret plus optional non-secret metadata. */
export interface Credential {
  /** The raw secret value (OAuth token, API key, …). Never logged. */
  value: string;
  /** ISO timestamp when the credential expires, if known. */
  expiresAt?: string;
  /** Non-secret metadata (account label, region, …). */
  meta?: Record<string, string>;
}

/**
 * Pluggable secret store. Refs are backend-qualified handles like "file:work"
 * so a Profile can name where its secret lives without inlining it.
 *
 * MVP ships FileBackend. KeychainBackend is stubbed for a later release.
 */
export interface CredentialBackend {
  get(ref: string): Promise<Credential | undefined>;
  set(ref: string, cred: Credential): Promise<void>;
  delete(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export interface ParsedRef {
  scheme: 'file' | 'keychain';
  id: string;
}

/** Split "file:work" into {scheme:"file", id:"work"}. Bare ids default to file. */
export function parseRef(ref: string): ParsedRef {
  const idx = ref.indexOf(':');
  if (idx === -1) return { scheme: 'file', id: ref };
  const scheme = ref.slice(0, idx);
  const id = ref.slice(idx + 1);
  if (scheme !== 'file' && scheme !== 'keychain') {
    throw new Error(`Unknown credential backend "${scheme}" in ref "${ref}".`);
  }
  return { scheme, id };
}

export function makeRef(scheme: ParsedRef['scheme'], id: string): string {
  return `${scheme}:${id}`;
}
