import { resolve } from "node:path"

export type ShellKind = "posix" | "powershell"

export function shellKind(platform: NodeJS.Platform): ShellKind {
	return platform === "win32" ? "powershell" : "posix"
}

export function shellConfigPath(home: string, kind: ShellKind, shell = ""): string {
	if (kind === "powershell") {
		return resolve(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
	}
	if (shell.includes("zsh")) return resolve(home, ".zshrc")
	return resolve(home, ".bashrc")
}

export function expandPath(path: string, home: string, env: NodeJS.ProcessEnv = process.env): string {
	return path
		.replace(/\$HOME/g, home)
		.replace(/%USERPROFILE%/gi, home)
		.replace(/%HOME%/gi, home)
		.replace(/\$ANDROID_HOME/g, env.ANDROID_HOME || "")
		.replace(/%ANDROID_HOME%/gi, env.ANDROID_HOME || "")
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

export function renderEnvBlock(
	tool: string,
	envs: Array<{ appendToPath?: boolean; key: string; value: string }>,
	kind: ShellKind,
): string {
	const { end, start } = envMarkers(tool)
	const nl = kind === "powershell" ? "\r\n" : "\n"
	const lines = ["", start]
	for (const env of envs) {
		if (env.appendToPath) {
			lines.push(kind === "powershell" ? `$env:Path += ";${env.value}"` : `export PATH="$PATH:${env.value}"`)
		} else {
			lines.push(kind === "powershell" ? `$env:${env.key} = "${env.value}"` : `export ${env.key}="${env.value}"`)
		}
	}
	lines.push(end, "")
	return lines.join(nl)
}

export function applyEnvBlock(existing: string, block: string, tool: string): string {
	const withoutLegacy = stripBlock(existing, tool, LEGACY_MARKER_OWNER)
	return stripBlock(withoutLegacy, tool, MARKER_OWNER) + block
}

/** True when the rc already holds a block for `tool`, current or legacy. */
export function hasEnvBlock(existing: string, tool: string): boolean {
	return existing.includes(envMarkers(tool).start) || existing.includes(envMarkers(tool, LEGACY_MARKER_OWNER).start)
}

export function reloadHint(kind: ShellKind, configName: string): string {
	if (kind === "powershell") return "Restart PowerShell or run: . $PROFILE"
	return `Run: source ~/${configName}   (or restart terminal)`
}
