import { rmSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { providerFor } from './auth/factory.js';
import { CamError } from './core/errors.js';
import { ensureDir, pathExists } from './core/fsx.js';
import { isInteractive, promptLine, readStdinAll } from './core/io.js';
import { CamPaths, assertValidProfileId } from './core/paths.js';
import { Registry } from './core/registry.js';
import { runLoop } from './core/run-loop.js';
import { writeSentinel } from './core/sentinel.js';
import { makeRef, parseRef } from './credentials/backend.js';
import { FileBackend } from './credentials/file-backend.js';
import { Launcher, buildLaunchContext, launchClaudeTool } from './launcher.js';
export function buildApp(env) {
    const paths = new CamPaths(env);
    return { paths, registry: new Registry(paths), backend: new FileBackend(paths) };
}
function claudeBin(env) {
    return env.CAM_CLAUDE_BIN?.trim() || 'claude';
}
const HELP = `cam — Claude Account Manager

Register multiple Claude Code accounts, authenticate each once, and switch
between them across sessions with zero re-login.

USAGE
  cam add <name> [--api-key-stdin | --oauth-token-stdin]
                          Register an account. Default = subscription (OAuth):
                          runs 'claude setup-token' for you, then prompts for paste.
  cam list                List registered accounts (numbered; active marked *).
  cam current             Show the active account.
  cam use <name> [args…]  Launch claude as <name> (isolated config); passes args through.
  cam run                 Launch the active account in a loop; honors /switch (relaunches).
  cam switch [name|number]
                          Stage an account as the next one (used by the /switch command).
                          No argument in a terminal → interactive picker.
  cam remove <name>       Delete an account and its stored credentials.
  cam help                Show this help.

ENV
  CAM_HOME                Base dir for cam state (default ~/.cam).
  CAM_CLAUDE_BIN          Path to the claude binary (default: claude).

Note: switching relaunches claude — Claude Code binds auth at startup, so there
is no true in-process hot-swap.`;
export async function cmdAdd(app, env, rest, deps = {
    isInteractive,
    promptLine,
    launchSetupToken: (bin, configDir, e) => launchClaudeTool(bin, ['setup-token'], configDir, e),
}) {
    const { values, positionals } = parseArgs({
        args: rest,
        options: {
            'api-key-stdin': { type: 'boolean', default: false },
            'oauth-token-stdin': { type: 'boolean', default: false },
        },
        allowPositionals: true,
    });
    const name = positionals[0];
    if (!name)
        throw new CamError('Usage: cam add <name> [--api-key-stdin | --oauth-token-stdin]');
    assertValidProfileId(name);
    const id = name;
    if (app.registry.has(id))
        throw new CamError(`Profile "${id}" already exists.`);
    const authKind = values['api-key-stdin'] ? 'api-key' : 'subscription-oauth';
    const configDir = app.paths.profileConfigDir(id);
    ensureDir(configDir, 0o700);
    let secret;
    if (authKind === 'api-key') {
        secret = (await readStdinAll()).trim();
    }
    else if (values['oauth-token-stdin']) {
        secret = (await readStdinAll()).trim();
    }
    else if (deps.isInteractive()) {
        process.stderr.write('Subscription login — launching `claude setup-token`…\n');
        const res = await deps.launchSetupToken(claudeBin(env), configDir, env);
        if (res.code !== 0)
            throw new CamError('claude setup-token failed; aborting add.');
        secret = (await deps.promptLine('Paste the token printed above here: ')).trim();
    }
    else {
        throw new CamError('No token on stdin. Use --oauth-token-stdin, or run interactively.');
    }
    if (!secret)
        throw new CamError('No credential provided.');
    const profile = {
        id,
        name,
        authKind,
        configDir,
        credentialRef: makeRef('file', id),
        createdAt: new Date().toISOString(),
    };
    const provider = providerFor(authKind, app.backend, app.paths);
    await provider.authenticate(profile, { secret });
    app.registry.add(profile);
    app.registry.setActive(id);
    process.stdout.write(`Added "${id}" (${authKind}) and set active. Launch it with: cam use ${id}\n`);
}
function printList(app) {
    const profiles = app.registry.list();
    const active = app.registry.getActive()?.id;
    profiles.forEach((p, i) => {
        const marker = p.id === active ? '*' : ' ';
        process.stdout.write(`${i + 1}) ${marker} ${p.id.padEnd(20)} ${p.authKind}\n`);
    });
}
function cmdList(app) {
    if (app.registry.list().length === 0) {
        process.stdout.write('No accounts. Add one with: cam add <name>\n');
        return;
    }
    printList(app);
}
/** Resolve a switch target from a name or a 1-based index into the account list. */
function resolveTarget(app, token) {
    if (/^\d+$/.test(token)) {
        const profile = app.registry.list()[Number.parseInt(token, 10) - 1];
        if (!profile)
            throw new CamError(`No account at number ${token}. Run "cam list".`);
        return profile;
    }
    return app.registry.getOrThrow(token);
}
function cmdCurrent(app) {
    const active = app.registry.getActive();
    process.stdout.write(active ? `${active.id} (${active.authKind})\n` : 'No active account.\n');
}
async function cmdUse(app, env, rest) {
    const name = rest[0];
    if (!name)
        throw new CamError('Usage: cam use <name> [args…]');
    const profile = app.registry.getOrThrow(name);
    const passthrough = rest.slice(1);
    const provider = providerFor(profile.authKind, app.backend, app.paths);
    const ctx = await buildLaunchContext(profile, provider, passthrough, env);
    app.registry.setActive(profile.id);
    app.registry.update(profile.id, { lastUsedAt: new Date().toISOString() });
    const result = await new Launcher(claudeBin(env)).launch(ctx);
    process.exit(result.code ?? 0);
}
async function cmdRun(app, env) {
    const maxRaw = env.CAM_RUN_MAX_ITERATIONS;
    const max = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;
    const bin = claudeBin(env);
    await runLoop({
        paths: app.paths,
        registry: app.registry,
        ...(max !== undefined ? { maxIterations: max } : {}),
        log: (m) => process.stderr.write(`cam: ${m}\n`),
        launch: async (profile) => {
            const provider = providerFor(profile.authKind, app.backend, app.paths);
            const ctx = await buildLaunchContext(profile, provider, [], env);
            app.registry.update(profile.id, { lastUsedAt: new Date().toISOString() });
            return new Launcher(bin).launch(ctx);
        },
    });
}
export async function cmdSwitch(app, rest, deps = { isInteractive, promptLine }) {
    let token = rest[0];
    if (!token) {
        if (!deps.isInteractive())
            throw new CamError('Usage: cam switch <name|number>');
        if (app.registry.list().length === 0)
            throw new CamError('No accounts to switch to.');
        printList(app);
        token = (await deps.promptLine('Switch to (number/name, blank = cancel): ')).trim();
        if (!token) {
            process.stdout.write('Cancelled.\n');
            return;
        }
    }
    const profile = resolveTarget(app, token);
    app.registry.setActive(profile.id);
    writeSentinel(app.paths, profile.id);
    process.stdout.write(`Staged switch to "${profile.id}". Exit claude to relaunch into it.\n`);
}
function cmdRemove(app, rest) {
    const name = rest[0];
    if (!name)
        throw new CamError('Usage: cam remove <name>');
    const profile = app.registry.getOrThrow(name);
    app.registry.remove(profile.id);
    if (profile.credentialRef) {
        const { id } = parseRef(profile.credentialRef);
        rmSync(app.paths.keyFile(id), { force: true });
        rmSync(`${app.paths.keyFile(id)}.meta.json`, { force: true });
        rmSync(app.paths.helperScript(id), { force: true });
    }
    if (pathExists(profile.configDir))
        rmSync(profile.configDir, { recursive: true, force: true });
    process.stdout.write(`Removed "${profile.id}".\n`);
}
export async function main(argv, env = process.env) {
    const [command, ...rest] = argv;
    const app = buildApp(env);
    try {
        switch (command) {
            case undefined:
            case 'help':
            case '--help':
            case '-h':
                process.stdout.write(`${HELP}\n`);
                return;
            case 'add':
                return await cmdAdd(app, env, rest);
            case 'list':
                return cmdList(app);
            case 'current':
                return cmdCurrent(app);
            case 'use':
                await cmdUse(app, env, rest);
                return;
            case 'run':
                return await cmdRun(app, env);
            case 'switch':
                return await cmdSwitch(app, rest);
            case 'remove':
                return cmdRemove(app, rest);
            default:
                throw new CamError(`Unknown command "${command}". Run "cam help".`);
        }
    }
    catch (err) {
        if (err instanceof CamError) {
            process.stderr.write(`cam: ${err.message}\n`);
            process.exitCode = 1;
            return;
        }
        throw err;
    }
}
