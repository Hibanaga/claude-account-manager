import { NotSupportedError } from '../core/errors.js';
import { ApiKeyProvider } from './api-key-provider.js';
import { SubscriptionProvider } from './subscription-provider.js';
/** Resolve the AuthProvider for a profile's auth kind. Extension point for Bedrock/Vertex. */
export function providerFor(kind, backend, paths) {
    switch (kind) {
        case 'subscription-oauth':
            return new SubscriptionProvider(backend);
        case 'api-key':
            return new ApiKeyProvider(backend, paths);
        case 'bedrock':
        case 'vertex':
            // TODO(v0.2): implement cloud-provider auth (sets CLAUDE_CODE_USE_BEDROCK/VERTEX + region env).
            throw new NotSupportedError(`Auth kind "${kind}" is not implemented in v0.1.0.`);
        default: {
            const _exhaustive = kind;
            throw new NotSupportedError(`Unknown auth kind "${String(_exhaustive)}".`);
        }
    }
}
