import { type ChildProcess, spawn } from 'node:child_process';
import type { AuthProvider, LaunchContext } from './auth/provider.js';
import type { Profile } from './core/registry.js';

export interface LaunchResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** Auth-related env vars stripped from the inherited environment so each profile fully controls auth. */
const AUTH_ENV_KEYS = [
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
] as const;

/**
 * Assemble the launch environment for a profile: start from a sanitized copy of
 * the base env, point CLAUDE_CONFIG_DIR at the isolated config dir, apply the
 * profile's non-secret extras, then let the provider inject auth.
 */
export async function buildLaunchContext(
  profile: Profile,
  provider: AuthProvider,
  args: string[],
  baseEnv: NodeJS.ProcessEnv,
): Promise<LaunchContext> {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of AUTH_ENV_KEYS) delete env[key];
  env.CLAUDE_CONFIG_DIR = profile.configDir;
  if (profile.env) Object.assign(env, profile.env);

  const ctx: LaunchContext = { env, configDir: profile.configDir, args };
  await provider.applyTo(ctx, profile);
  return ctx;
}

export type SpawnFn = typeof spawn;

/**
 * Spawns `claude` with the profile's env and inherited stdio. Node has no true
 * execve; a spawn+wait is functionally equivalent for a CLI and lets the run
 * loop regain control when the child exits. While the child runs, the parent
 * ignores SIGINT/SIGTERM — the TTY delivers them to the child's process group
 * directly, and the parent must survive to reap the child and relaunch.
 */
export class Launcher {
  constructor(
    private readonly claudeBin: string,
    private readonly spawnFn: SpawnFn = spawn,
  ) {}

  launch(ctx: LaunchContext): Promise<LaunchResult> {
    const child: ChildProcess = this.spawnFn(this.claudeBin, ctx.args, {
      stdio: 'inherit',
      env: ctx.env,
    });

    const ignore = (): void => {};
    process.on('SIGINT', ignore);
    process.on('SIGTERM', ignore);

    return new Promise<LaunchResult>((resolve, reject) => {
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
