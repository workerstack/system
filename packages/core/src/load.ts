/**
 * Config discovery and import. Returns a result, never exits.
 */

import { resolve } from "node:path"
import type { SystemConfig } from "./config.ts"
import type { Runtime } from "./runtime.ts"
import { validateConfig } from "./validate.ts"
import { BUILTIN_NAMES } from "./builtins/index.ts"

export const CONFIG_NAMES = ["system.config.ts", "system.config.js", "system.config.mjs"] as const

export type Result<T> = { ok: true; value: T } | { error: string; ok: false }

/** `--config <path>` relative to cwd, else the first convention name in cwd. */
export function findConfig(rt: Runtime, explicit: string | undefined): Result<string> {
	if (explicit !== undefined) {
		const path = resolve(rt.cwd, explicit)
		return rt.exists(path) ? { ok: true, value: path } : { error: `Config file not found: ${path}`, ok: false }
	}
	for (const name of CONFIG_NAMES) {
		const path = resolve(rt.cwd, name)
		if (rt.exists(path)) return { ok: true, value: path }
	}
	return { error: `No system config found. Create one of: ${CONFIG_NAMES.join(", ")}`, ok: false }
}

function hasDeps(value: unknown): value is { deps: unknown } {
	return typeof value === "object" && value !== null && "deps" in value
}

/**
 * `export default defineConfig(...)`, else the first named export holding `deps`, validated.
 * Throws `ConfigError` listing every problem in the config's shape.
 */
export async function importConfig(rt: Runtime, path: string): Promise<Result<SystemConfig>> {
	const mod = await rt.importModule(path)
	const config = hasDeps(mod.default) ? mod.default : Object.values(mod).find(hasDeps)
	if (config === undefined) {
		return { error: "Config file must export an object with a `deps` field (use defineConfig)", ok: false }
	}
	return { ok: true, value: validateConfig(config, BUILTIN_NAMES) }
}
