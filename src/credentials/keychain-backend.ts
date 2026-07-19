import { NotSupportedError } from '../core/errors.js';
import type { Credential, CredentialBackend } from './backend.js';

/**
 * STUB — deferred past v0.1.0.
 *
 * A future macOS backend storing secrets in the login Keychain via the
 * `security` CLI (`add-generic-password` / `find-generic-password`), keyed by
 * an account derived from the profile id. This would let subscription profiles
 * live in the OS credential store instead of a 0600 file.
 *
 * Not wired into the CLI yet; every method throws NotSupportedError.
 */
export class KeychainBackend implements CredentialBackend {
  // TODO(v0.2): implement via `security` CLI; requires macOS.
  private fail(): never {
    throw new NotSupportedError(
      'KeychainBackend is not implemented yet. Use the file backend (default) in v0.1.0.',
    );
  }

  async get(_ref: string): Promise<Credential | undefined> {
    this.fail();
  }
  async set(_ref: string, _cred: Credential): Promise<void> {
    this.fail();
  }
  async delete(_ref: string): Promise<void> {
    this.fail();
  }
  async has(_ref: string): Promise<boolean> {
    this.fail();
  }
  async list(): Promise<string[]> {
    this.fail();
  }
}
