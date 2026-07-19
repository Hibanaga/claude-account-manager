/** Split "file:work" into {scheme:"file", id:"work"}. Bare ids default to file. */
export function parseRef(ref) {
    const idx = ref.indexOf(':');
    if (idx === -1)
        return { scheme: 'file', id: ref };
    const scheme = ref.slice(0, idx);
    const id = ref.slice(idx + 1);
    if (scheme !== 'file' && scheme !== 'keychain') {
        throw new Error(`Unknown credential backend "${scheme}" in ref "${ref}".`);
    }
    return { scheme, id };
}
export function makeRef(scheme, id) {
    return `${scheme}:${id}`;
}
