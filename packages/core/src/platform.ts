/**
 * OS detection for system dependency installation
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { OS_TARGETS, type OsTarget } from "./config.ts"
import { pathEnv } from "./path.ts"

/** Run a shell command and return stdout; throws on a non-zero exit. Injected so lookups are testable. */
export type ShellExec = (command: string, env: NodeJS.ProcessEnv | undefined) => string

const shellExec: ShellExec = (command, env) =>
	execSync(command, { encoding: "utf-8", env, stdio: ["ignore", "pipe", "ignore"] })

/** Resolved path of the first token (`command -v`, or `where` on Windows). Null if missing. */
export function whichBinary(
	command: string,
	platform: NodeJS.Platform = process.platform,
	searchPath?: string,
	exec: ShellExec = shellExec,
): string | null {
	const token = command.replace(/^["']|["']$/g, "")
	if (!token) return null
	if (existsSync(token)) return token
	const lookup = platform === "win32" ? `where ${token}` : `command -v ${token}`
	try {
		const out = exec(lookup, searchPath === undefined ? undefined : pathEnv(searchPath))
		/* `where` lists every match, one per line; the first is what the shell runs */
		return out.trim().split(/\r?\n/)[0] || null
	} catch {
		return null
	}
}

export function commandExists(command: string, searchPath?: string): boolean {
	return whichBinary(command, process.platform, searchPath) !== null
}

export function parseOsTarget(value: string): OsTarget {
	if ((OS_TARGETS as readonly string[]).includes(value)) return value as OsTarget
	throw new Error(`Unknown OS target: ${value}. Expected one of: ${OS_TARGETS.join(", ")}`)
}

/** True when `command` resolves on PATH. Injected so detection is testable without the host's tools. */
export type CommandProbe = (command: string) => boolean

export function detectLinuxDistro(has: CommandProbe = commandExists): OsTarget {
	if (has("apt-get")) return "linux-apt"
	if (has("dnf")) return "linux-dnf"
	if (has("pacman")) return "linux-pacman"
	/* default to apt if nothing detected */
	return "linux-apt"
}

export function detectOsFromPlatform(
	platform: NodeJS.Platform,
	override: string | undefined = process.env.WORKERSTACK_SYSTEM_OS,
	has: CommandProbe = commandExists,
): OsTarget {
	if (override) return parseOsTarget(override)
	if (platform === "darwin") return "macos"
	if (platform === "win32") return "windows"
	return detectLinuxDistro(has)
}

/**
 * Detect the current OS target.
 * `override` (or `WORKERSTACK_SYSTEM_OS`) forces a target — used by tests and `--os`.
 */
export function detectOs(override: string | undefined = process.env.WORKERSTACK_SYSTEM_OS): OsTarget {
	return detectOsFromPlatform(process.platform, override)
}
