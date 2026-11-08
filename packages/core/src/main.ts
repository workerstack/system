/**
 * The CLI: parse, load the config, dispatch. Returns the exit code; only `bin.ts` exits.
 */

import { dirname } from "node:path"
import { parseArgs } from "./args.ts"
import { BUILTINS } from "./builtins/index.ts"
import { resolveDeps } from "./builtins/resolve.ts"
import { checkCommand } from "./commands/check.ts"
import { envCommand } from "./commands/env.ts"
import { installCommand } from "./commands/install.ts"
import { listCommand } from "./commands/list.ts"
import { syncPmCommand } from "./commands/sync-pm.ts"
import { ConfigError } from "./errors.ts"
import { findConfig, importConfig } from "./load.ts"
import { detectOsFromPlatform } from "./platform.ts"
import type { Context } from "./probe.ts"
import type { Runtime } from "./runtime.ts"

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
`

const COMMANDS = ["check", "env", "install", "list", "sync-pm"] as const

async function run(argv: readonly string[], rt: Runtime): Promise<number> {
	const parsed = parseArgs(argv)
	if (!parsed.ok) {
		rt.error(parsed.error)
		return 1
	}
	const args = parsed.value

	if (args.command === undefined || !(COMMANDS as readonly string[]).includes(args.command)) {
		rt.log(USAGE)
		if (args.command === undefined) return 0
		rt.error(`Unknown command: ${args.command}`)
		return 1
	}

	if (args.command === "list") return listCommand(rt, BUILTINS)

	const found = findConfig(rt, args.config)
	if (!found.ok) {
		rt.error(found.error)
		return 1
	}
	const loaded = await importConfig(rt, found.value)
	if (!loaded.ok) {
		rt.error(loaded.error)
		return 1
	}

	const override = args.os ?? rt.env.WORKERSTACK_SYSTEM_OS
	const os = detectOsFromPlatform(rt.platform, override, (command) => rt.which(command) !== null)
	const ctx: Context = {
		configDir: dirname(found.value),
		deps: resolveDeps(loaded.value.deps, { arch: rt.arch, os }, BUILTINS),
		os,
		packageJsonPath: loaded.value.packageJsonPath ?? "package.json",
		rt,
	}

	switch (args.command) {
		case "check":
			return checkCommand(ctx, args.target, args.here)
		case "env":
			return envCommand(ctx)
		case "install":
			return installCommand(ctx, args.target, { dryRun: args.dryRun, upgrade: args.upgrade })
		default:
			return syncPmCommand(ctx)
	}
}

export async function main(argv: readonly string[], rt: Runtime): Promise<number> {
	try {
		return await run(argv, rt)
	} catch (error) {
		if (error instanceof ConfigError) rt.error(error.message)
		else rt.error(`\nFatal error: ${error instanceof Error ? error.message : String(error)}`)
		return 1
	}
}
