import { NotSupportedError } from '../core/errors.js';
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
export class KeychainBackend {
    // TODO(v0.2): implement via `security` CLI; requires macOS.
    fail() {
        throw new NotSupportedError('KeychainBackend is not implemented yet. Use the file backend (default) in v0.1.0.');
    }
    async get(_ref) {
        this.fail();
    }
    async set(_ref, _cred) {
        this.fail();
    }
    async delete(_ref) {
        this.fail();
    }
    async has(_ref) {
        this.fail();
    }
    async list() {
        this.fail();
    }
}
