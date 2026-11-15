/**
 * The CLI: parse, load the config, dispatch. Returns the exit code; only `bin.ts` exits.
 */

import { dirname } from "node:path";

import { type Invocation, parseArgs } from "./args.ts";
import { BUILTINS } from "./builtins/catalog.ts";
import { resolveDeps } from "./builtins/resolve.ts";
import { checkCommand } from "./commands/check-command.ts";
import { envCommand } from "./commands/env-command.ts";
import { installCommand } from "./commands/install.ts";
import { listCommand } from "./commands/list-command.ts";
import { syncPmCommand } from "./commands/sync-pm-command.ts";
import { ConfigError } from "./config-error.ts";
import { findConfig, importConfig, type Result } from "./load.ts";
import { detectOsFromPlatform } from "./platform.ts";
import type { Context } from "./probe.ts";
import { nodeRuntime, type Runtime } from "./runtime.ts";

export const USAGE = `Usage: system <command> [args]

Commands:
  install              Install all deps (auto-detect OS)
  install <name>       Install single dep
  check                Check all deps
  check <name>         Check single dep
  env                  Setup environment variables
  sync-pm              Sync packageManager field in package.json
  list                 List built-in deps (give a version: go: "1.27.2")

Flags:
  --config <path>      Config file (default: system.config.ts in cwd)
  --os <target>        Force OS target (or set WORKERSTACK_SYSTEM_OS)
  --dry-run            Print install commands without running them
  --upgrade            Re-run install when the detected version does not match
  --here               check: use this process PATH instead of an interactive-shell snapshot
`;

const COMMANDS = ["check", "env", "install", "list", "sync-pm"] as const;

/** The CLI's commands. */
type Command = (typeof COMMANDS)[number];

/** Where a process's own arguments start in `process.argv`, past the runtime and the script. */
const ARGV_START = 2;

function isCommand(command: string): command is Command {
  return COMMANDS.some((known) => known === command);
}

/** Find, import and resolve the config, and detect the OS: what every command but `list` runs on. */
async function loadContext(args: Invocation, rt: Runtime): Promise<Result<Context>> {
  const found = findConfig(rt, args.config);

  if (!found.ok) return found;
  const loaded = await importConfig(rt, found.value);

  if (!loaded.ok) return loaded;
  const override = args.os ?? rt.env.WORKERSTACK_SYSTEM_OS;
  const os = detectOsFromPlatform(rt.platform, override, (command) => rt.which(command) !== null);

  return {
    ok: true,
    value: {
      configDir: dirname(found.value),
      deps: resolveDeps(loaded.value.deps, { arch: rt.arch, os }, BUILTINS),
      os,
      packageJsonPath: loaded.value.packageJsonPath ?? "package.json",
      rt,
    },
  };
}

/** Run the command `args` names on the loaded context. */
function dispatch(command: Exclude<Command, "list">, ctx: Context, args: Invocation): number {
  const commands: Readonly<Record<typeof command, () => number>> = {
    check: () => checkCommand(ctx, args.target, { here: args.here }),
    env: () => envCommand(ctx),
    install: () => installCommand(ctx, args.target, { dryRun: args.dryRun, upgrade: args.upgrade }),
    "sync-pm": () => syncPmCommand(ctx),
  };

  return commands[command]();
}

/** Run the CLI on `argv` (the arguments past the script): parse, load the config, dispatch. Returns the exit code. */
async function run(argv: readonly string[], rt: Runtime): Promise<number> {
  const parsed = parseArgs(argv);

  if (!parsed.ok) {
    rt.error(parsed.error);

    return 1;
  }

  const args = parsed.value;
  const { command } = args;

  if (command === undefined || !isCommand(command)) {
    rt.log(USAGE);

    if (command === undefined) return 0;
    rt.error(`Unknown command: ${command}`);

    return 1;
  }

  if (command === "list") return listCommand(rt, BUILTINS);
  const ctx = await loadContext(args, rt);

  if (!ctx.ok) {
    rt.error(ctx.error);

    return 1;
  }

  return dispatch(command, ctx.value, args);
}

/** `run`, with a `ConfigError` printed plainly and any other throw as a fatal error: exit 1 either way. */
export async function runCli(argv: readonly string[], rt: Runtime): Promise<number> {
  try {
    return await run(argv, rt);
  } catch (error) {
    if (error instanceof ConfigError) rt.error(error.message);
    else rt.error(`\nFatal error: ${error instanceof Error ? error.message : String(error)}`);

    return 1;
  }
}

/** The bin's whole job: run the CLI on this process's arguments and runtime, and exit with its code. */
export async function main(): Promise<void> {
  process.exit(await runCli(process.argv.slice(ARGV_START), nodeRuntime()));
}
