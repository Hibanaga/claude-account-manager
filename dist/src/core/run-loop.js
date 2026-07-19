import { NoActiveProfileError } from './errors.js';
import { acquireRunLock, releaseRunLock } from './lock.js';
import { claimSentinel, clearSentinel } from './sentinel.js';
/**
 * The switch orchestrator. Launches the active profile; when `claude` exits
 * cleanly, consumes a pending switch sentinel and relaunches into the target —
 * making an in-session `/switch` feel mid-session (it is a relaunch, not a
 * hot-swap). A child killed by a signal (e.g. Ctrl-C) ends the loop.
 */
export async function runLoop(deps) {
    const { paths, registry } = deps;
    const max = deps.maxIterations ?? Number.POSITIVE_INFINITY;
    const log = deps.log ?? (() => { });
    acquireRunLock(paths);
    try {
        clearSentinel(paths); // discard anything left by a previous crash
        for (let i = 0; i < max; i++) {
            const active = registry.getActive();
            if (!active)
                throw new NoActiveProfileError();
            log(`launching "${active.id}"`);
            const result = await deps.launch(active);
            if (result.signal !== null) {
                log(`claude terminated by ${result.signal}; stopping.`);
                break;
            }
            const target = claimSentinel(paths);
            if (!target)
                break; // clean exit, no switch requested
            if (!registry.has(target)) {
                log(`ignoring switch to unknown profile "${target}".`);
                break;
            }
            registry.setActive(target);
            log(`switching to "${target}".`);
        }
    }
    finally {
        releaseRunLock(paths);
    }
}
