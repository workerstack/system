import type { EnvVar, OsCommands, OsTarget, SystemDepConfig } from "../config.ts"

/** CPU architectures built-ins ship recipes for. */
export type Arch = "arm64" | "x64"

export interface RecipeContext {
	arch: Arch
	version: string
}

/** A tool workerstack supports by name: the config gives a version, the catalog gives the rest. */
export interface BuiltinDep {
	/**
	 * `check` runs this; default `<name> --version`. A function gives the check for the OS the config resolves on,
	 * for apps whose version lives in a bundle or file, not on stdout.
	 */
	check?: SystemDepConfig["check"] | ((os: OsTarget) => SystemDepConfig["check"])
	/** Other deps installed first. A `latest`-only built-in missing from the config is added; any other is an error. */
	dependsOn?: readonly string[]
	description: string
	/** Shell env entries for the OS the config resolves on (PATH dirs differ between unix and Windows). */
	env?: (os: OsTarget) => readonly EnvVar[]
	/** Per-OS install commands for this version and CPU. */
	os: (ctx: RecipeContext) => OsCommands
	/**
	 * `pinned`: needs an exact version, rejects `"latest"`. `latest`: only `"latest"` (the source cannot pin).
	 * `any`: a pin or `"latest"`.
	 */
	versions: "any" | "latest" | "pinned"
}

/** The object form of a built-in entry: a version plus anything to override. `os` merges per key. */
export interface BuiltinOverride {
	check?: SystemDepConfig["check"]
	dependsOn?: readonly string[]
	description?: string
	env?: readonly EnvVar[]
	os?: OsCommands
	required?: boolean
	version: string
}
