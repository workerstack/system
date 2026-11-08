/**
 * System dependencies configuration helpers
 *
 * Template variables available in `os` commands and `check.command`:
 *   {{name}}    — dep key (e.g. "node", "stripe-cli")
 *   {{version}} — full version string (e.g. "22.20.0")
 *   {{major}}   — major version number (e.g. "22")
 *   {{arch}}    — CPU architecture: "arm64" or "amd64" (auto-detected)
 */

export const OS_TARGETS = ["linux-apt", "linux-dnf", "linux-pacman", "macos", "windows"] as const

export type OsTarget = (typeof OS_TARGETS)[number]

/**
 * Per-OS install commands.
 * - Use specific OS keys for platform-specific commands
 * - Use "all" for commands identical across all platforms
 * - Per-OS keys override "all" when both are present
 * - Omit an OS key (without "all") = unavailable on that OS
 * - Set an OS key to `false` = explicitly unavailable on that OS (overrides "all")
 */
export type OsCommands = Partial<Record<OsTarget, string | false>> & { all?: string }

/**
 * One shell environment entry, written verbatim into the managed rc block (the shell expands `$HOME`).
 * - `{ path }` puts a directory first on PATH, so the pinned binary wins over one already installed.
 * - `{ key, value }` sets a variable.
 * - `{ key, detect, fallback? }` sets a variable to the first `detect` path that exists, else `fallback`.
 */
export type EnvVar =
	| { path: string }
	| { key: string; value: string }
	| { detect: string[]; fallback?: string; key: string }

export interface SystemDepConfig {
	description: string
	required: boolean
	version: string
	/** Per-OS install commands. Supports {{name}}, {{version}}, {{major}} templates. */
	os: OsCommands
	/**
	 * Version check command. Supports {{name}} template.
	 * Default: "{{name}} --version" — only declare when it differs.
	 */
	check?: {
		command: string
		/** Regex source whose first capture is the version. Default: the first `N.N…` in the output. */
		pattern?: string
	}
	/** Deps that must be installed before this one (by dep key name) */
	dependsOn?: string[]
	/** Env vars to configure after install */
	env?: EnvVar[]
}

export interface SystemConfig {
	/** Path to package.json for packageManager sync. Relative to config file directory. */
	packageJsonPath?: string
	deps: Record<string, SystemDepConfig>
}

/** `{{arch}}` value: "arm64" on arm64, "amd64" everywhere else. */
export function archLabel(arch: string = process.arch): "amd64" | "arm64" {
	return arch === "arm64" ? "arm64" : "amd64"
}

/** Replace {{name}}, {{version}}, {{major}} and {{arch}} in a template. */
export function interpolate(template: string, name: string, version: string, arch: string = process.arch): string {
	const major = version.split(".")[0] as string
	return template
		.replace(/\{\{name\}\}/g, name)
		.replace(/\{\{version\}\}/g, version)
		.replace(/\{\{major\}\}/g, major)
		.replace(/\{\{arch\}\}/g, archLabel(arch))
}

/**
 * Resolve the install command for a dep on a given OS target.
 * Returns the interpolated command, or null if unavailable.
 */
export function resolveOsCommand(name: string, config: SystemDepConfig, target: OsTarget): string | null {
	const specific = config.os[target]

	/* explicitly unavailable */
	if (specific === false) return null

	/* prefer specific OS command, fall back to "all" */
	const raw = specific ?? config.os.all
	if (!raw) return null

	return interpolate(raw, name, config.version)
}

/**
 * Resolve the version check command for a dep.
 * Default: "{name} --version"
 */
export function resolveCheckCommand(name: string, config: SystemDepConfig): string {
	const raw = config.check?.command ?? "{{name}} --version"
	return interpolate(raw, name, config.version)
}

/**
 * Helper to define system dependencies configuration with type safety
 */
export function defineConfig(options: {
	packageJsonPath?: string
	deps: Record<string, SystemDepConfig>
}): SystemConfig {
	return {
		deps: options.deps,
		packageJsonPath: options.packageJsonPath ?? "package.json",
	}
}
