import { spawn } from 'node:child_process';
/** Auth-related env vars stripped from the inherited environment so each profile fully controls auth. */
const AUTH_ENV_KEYS = [
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
];
/**
 * Assemble the launch environment for a profile: start from a sanitized copy of
 * the base env, point CLAUDE_CONFIG_DIR at the isolated config dir, apply the
 * profile's non-secret extras, then let the provider inject auth.
 */
export async function buildLaunchContext(profile, provider, args, baseEnv) {
    const env = { ...baseEnv };
    for (const key of AUTH_ENV_KEYS)
        delete env[key];
    env.CLAUDE_CONFIG_DIR = profile.configDir;
    if (profile.env)
        Object.assign(env, profile.env);
    const ctx = { env, configDir: profile.configDir, args };
    await provider.applyTo(ctx, profile);
    return ctx;
}
/**
 * Run a one-shot `claude` subcommand (e.g. `setup-token`) with inherited stdio so
 * its browser flow gets the TTY. Auth env is stripped and CLAUDE_CONFIG_DIR is
 * pointed at the profile dir so a stray parent token can't short-circuit login.
 * No provider is applied — this runs before any credential exists.
 */
export function launchClaudeTool(bin, args, configDir, baseEnv) {
    const env = { ...baseEnv };
    for (const key of AUTH_ENV_KEYS)
        delete env[key];
    env.CLAUDE_CONFIG_DIR = configDir;
    return new Launcher(bin).launch({ env, configDir, args });
}
/**
 * Spawns `claude` with the profile's env and inherited stdio. Node has no true
 * execve; a spawn+wait is functionally equivalent for a CLI and lets the run
 * loop regain control when the child exits. While the child runs, the parent
 * ignores SIGINT/SIGTERM — the TTY delivers them to the child's process group
 * directly, and the parent must survive to reap the child and relaunch.
 */
export class Launcher {
    claudeBin;
    spawnFn;
    constructor(claudeBin, spawnFn = spawn) {
        this.claudeBin = claudeBin;
        this.spawnFn = spawnFn;
    }
    launch(ctx) {
        const child = this.spawnFn(this.claudeBin, ctx.args, {
            stdio: 'inherit',
            env: ctx.env,
        });
        const ignore = () => { };
        process.on('SIGINT', ignore);
        process.on('SIGTERM', ignore);
        return new Promise((resolve, reject) => {
            child.on('error', (err) => {
                process.off('SIGINT', ignore);
                process.off('SIGTERM', ignore);
                reject(err);
            });
            child.on('close', (code, signal) => {
                process.off('SIGINT', ignore);
                process.off('SIGTERM', ignore);
                resolve({ code, signal });
            });
        });
    }
}
