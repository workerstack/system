import {
	BUILTINS,
	defineConfig,
	detectOs,
	interpolate,
	resolveCheckCommand,
	resolveDeps,
	resolveOsCommand,
	sortByDependencies,
} from "@workerstack/system"
import config from "../system.config.ts"

/** Built-in entries expand into full deps for this machine before the library helpers take them. */
const os = detectOs()
const deps = resolveDeps(config.deps, { arch: process.arch, os }, BUILTINS)

export function bunInstallCommand(): string | null {
	return resolveOsCommand("bun", deps.bun!, os)
}

export function nodeCheckCommand(): string {
	return resolveCheckCommand("node", deps.node!)
}

export function installOrder(): string[] {
	return sortByDependencies(Object.entries(deps)).map(([name]) => name)
}

export function templated(): string {
	return interpolate("{{name}}-{{major}}", "node", deps.node!.version)
}

/* the config keeps each entry's own type: a built-in version string, a custom dep object */
export const bunPin: string = config.deps.bun
export const justVersion: string = config.deps.just.version

/* a key outside the catalog needs the full custom form */
// @ts-expect-error a version string alone is only for built-in names
defineConfig({ deps: { "my-tool": "1.0.0" } })

/* a built-in override only takes the documented fields */
// @ts-expect-error `verison` is not a field
defineConfig({ deps: { go: { verison: "1.27.2" } } })

/* custom deps still need description, os, required and version */
// @ts-expect-error missing os and required
defineConfig({ deps: { "my-tool": { description: "x", version: "1.0.0" } } })
