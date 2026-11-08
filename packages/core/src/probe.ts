/**
 * What is installed: the check command's binary, where it resolves, and the version it reports.
 */

import { type OsTarget, resolveCheckCommand, type SystemDepConfig } from "./config.ts"
import type { Runtime } from "./runtime.ts"

/** Everything a command needs: the effects, the resolved deps, and where the config lives. */
export interface Context {
	configDir: string
	deps: Record<string, SystemDepConfig>
	os: OsTarget
	packageJsonPath: string
	rt: Runtime
}

/** First token of the check command: the binary whose presence and path are probed. */
export function checkBinary(name: string, config: SystemDepConfig): string {
	return resolveCheckCommand(name, config).split(/\s+/)[0] as string
}

export interface Installed {
	/** where the check binary resolves */
	path: string
	/** the first `N.N…` in the check output */
	version: string
}

/** The installed binary and the version it reports, or null when it is missing or reports none. */
export function probeInstalled(
	rt: Runtime,
	name: string,
	config: SystemDepConfig,
	searchPath?: string,
): Installed | null {
	const path = rt.which(checkBinary(name, config), searchPath)
	if (path === null) return null
	const result = rt.capture(resolveCheckCommand(name, config), searchPath)
	const version = result.ok ? result.stdout.match(/(\d+\.\d+[\w.-]*)/)?.[1] : undefined
	return version === undefined ? null : { path, version }
}
