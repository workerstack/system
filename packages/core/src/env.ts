/**
 * Shell rc blocks: which file each shell reads, and the managed block written into it.
 */

import { basename, resolve } from "node:path"

export type ShellKind = "fish" | "posix" | "powershell"

/** One rendered line: a directory put first on PATH, or a variable set to a value. */
export type EnvLine = { path: string } | { key: string; value: string }

/** PowerShell on Windows; fish when `SHELL` is fish; posix (bash/zsh) otherwise. */
export function shellKind(platform: NodeJS.Platform, shell = ""): ShellKind {
	if (platform === "win32") return "powershell"
	return basename(shell) === "fish" ? "fish" : "posix"
}

export function shellConfigPath(home: string, kind: ShellKind, shell = "", env: NodeJS.ProcessEnv = {}): string {
	if (kind === "powershell") return resolve(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
	if (kind === "fish") {
		return resolve(env.XDG_CONFIG_HOME ?? resolve(home, ".config"), "fish", "conf.d", "workerstack-system.fish")
	}
	return resolve(home, shell.includes("zsh") ? ".zshrc" : ".bashrc")
}

/**
 * Expand `$VAR`, `${VAR}` and `%VAR%`. `HOME` and `USERPROFILE` are `home`; every other name comes from
 * `env`. Names `env` does not define stay literal, so a later shell can still expand them.
 */
export function expandPath(path: string, home: string, env: NodeJS.ProcessEnv = process.env): string {
	const lookup = (name: string): string | undefined => (/^(home|userprofile)$/i.test(name) ? home : env[name])
	return path.replace(
		/\$\{(\w+)\}|\$(\w+)|%(\w+)%/g,
		(token, braced?: string, bare?: string, percent?: string) => lookup((braced ?? bare ?? percent) as string) ?? token,
	)
}

export const MARKER_OWNER = "@workerstack/system"

/** Owner tag written before the rename; blocks carrying it are replaced, never duplicated. */
export const LEGACY_MARKER_OWNER = "crossdeps"

export function envMarkers(tool: string, owner: string = MARKER_OWNER): { end: string; start: string } {
	return {
		end: `# end ${tool} environment`,
		start: `# ${tool} environment (managed by ${owner})`,
	}
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripBlock(existing: string, tool: string, owner: string): string {
	const { end, start } = envMarkers(tool, owner)
	if (!existing.includes(start)) return existing
	return existing.replace(new RegExp(`\\r?\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\r?\\n?`, "g"), "")
}

function renderLine(line: EnvLine, kind: ShellKind): string {
	if ("path" in line) {
		if (kind === "powershell") return `$env:Path = "${line.path};" + $env:Path`
		if (kind === "fish") return `set -gx PATH "${line.path}" $PATH`
		return `export PATH="${line.path}:$PATH"`
	}
	if (kind === "powershell") return `$env:${line.key} = "${line.value}"`
	if (kind === "fish") return `set -gx ${line.key} "${line.value}"`
	return `export ${line.key}="${line.value}"`
}

/** The managed block for `tool`. PATH entries go first on PATH so a pinned toolchain wins. */
export function renderEnvBlock(tool: string, lines: readonly EnvLine[], kind: ShellKind): string {
	const { end, start } = envMarkers(tool)
	const nl = kind === "powershell" ? "\r\n" : "\n"
	return ["", start, ...lines.map((line) => renderLine(line, kind)), end, ""].join(nl)
}

/** Replace `tool`'s block (current or legacy marker) with `block`; other content is kept. */
export function applyEnvBlock(existing: string, block: string, tool: string): string {
	const withoutLegacy = stripBlock(existing, tool, LEGACY_MARKER_OWNER)
	return stripBlock(withoutLegacy, tool, MARKER_OWNER) + block
}

/** True when the rc already holds a block for `tool`, current or legacy. */
export function hasEnvBlock(existing: string, tool: string): boolean {
	return existing.includes(envMarkers(tool).start) || existing.includes(envMarkers(tool, LEGACY_MARKER_OWNER).start)
}

export function reloadHint(kind: ShellKind, configPath: string): string {
	if (kind === "powershell") return "Restart PowerShell or run: . $PROFILE"
	if (kind === "fish") return `Run: source ${configPath}   (or restart fish)`
	return `Run: source ~/${basename(configPath)}   (or restart terminal)`
}
