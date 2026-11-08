/**
 * Building blocks for built-in install commands. Unix installs land in `$HOME/.local/bin` (or a tool dir
 * under `$HOME/.local/share`) without sudo; Windows installs land in `%LOCALAPPDATA%\bin` (or a tool dir
 * under `%LOCALAPPDATA%\Programs`), which the command adds to the user PATH.
 */

import type { EnvVar, OsCommands, OsTarget } from "../config.ts"
import type { Arch } from "./types.ts"

export const LOCAL_BIN = "$HOME/.local/bin"
export const LOCAL_SHARE = "$HOME/.local/share"
export const WIN_BIN = "$env:LOCALAPPDATA\\bin"
export const WIN_PROGRAMS = "$env:LOCALAPPDATA\\Programs"

/** The same command on every Linux distro, and one for macOS. */
export function unix(linux: string, macos: string): OsCommands {
	return { "linux-apt": linux, "linux-dnf": linux, "linux-pacman": linux, macos }
}

/** The value for this CPU. */
export function pick<T>(arch: Arch, values: { arm64: T; x64: T }): T {
	return values[arch]
}

/** Download one executable into `$HOME/.local/bin/<name>`. */
export function binary(url: string, name: string): string {
	return `mkdir -p "${LOCAL_BIN}" && curl -fsSL "${url}" -o "${LOCAL_BIN}/${name}" && chmod +x "${LOCAL_BIN}/${name}"`
}

/** Unpack `$tmp/archive` into `$tmp/x`: unzip for .zip (GNU tar cannot), tar otherwise. */
function extract(url: string): string {
	if (url.endsWith(".zip")) return 'unzip -q "$tmp/archive" -d "$tmp/x"'
	const flag = /\.(tar\.gz|tgz)$/.test(url) ? "z" : url.endsWith(".tar.xz") ? "J" : ""
	return `tar -x${flag}f "$tmp/archive" -C "$tmp/x"`
}

function download(url: string): string[] {
	return ['tmp="$(mktemp -d)"', `curl -fsSL "${url}" -o "$tmp/archive"`, 'mkdir "$tmp/x"', extract(url)]
}

const CLEANUP = 'rm -rf "$tmp"'

/** Download an archive and install `member` (a path inside it) as `$HOME/.local/bin/<name>`. */
export function archive(url: string, member: string, name: string): string {
	return [
		...download(url),
		`mkdir -p "${LOCAL_BIN}"`,
		`install -m 755 "$tmp/x/${member}" "${LOCAL_BIN}/${name}"`,
		CLEANUP,
	].join(" && ")
}

/**
 * Unpack a whole archive into `dir` (replacing it), for tools that need their files next to the binary.
 * `nested`: the archive holds one top folder (`go/`, `node-v24.21.0-linux-x64/`), which becomes `dir`.
 * Each of `bins` (a path inside `dir`) is linked into `$HOME/.local/bin`.
 */
export function tree(url: string, dir: string, opts: { bins?: readonly string[]; nested?: boolean } = {}): string {
	const links = (opts.bins ?? []).map((bin) => `ln -sf "${dir}/${bin}" "${LOCAL_BIN}/${bin.split("/").pop()}"`)
	return [
		...download(url),
		`rm -rf "${dir}"`,
		`mkdir -p "$(dirname "${dir}")" "${LOCAL_BIN}"`,
		opts.nested ? `mv "$tmp"/x/* "${dir}"` : `mv "$tmp/x" "${dir}"`,
		...links,
		CLEANUP,
	].join(" && ")
}

/** Stop on the first error and skip the progress bar (it slows Invoke-WebRequest badly). */
const PS_PRELUDE = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'"

/** Make `dir` exist and be on the user PATH. */
export function winPathDir(dir: string): string {
	return [
		`$d = "${dir}"`,
		"New-Item -ItemType Directory -Force $d | Out-Null",
		'$u = [Environment]::GetEnvironmentVariable("Path", "User")',
		'if (-not (($u -split ";") -contains $d)) { [Environment]::SetEnvironmentVariable("Path", "$d;$u", "User") }',
	].join("; ")
}

/** Download one .exe into `%LOCALAPPDATA%\bin\<name>.exe`. */
export function winBinary(url: string, name: string): string {
	return [
		PS_PRELUDE,
		winPathDir(WIN_BIN),
		`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "${WIN_BIN}\\${name}.exe"`,
	].join("; ")
}

const WIN_TEMP = ["$t = Join-Path $env:TEMP ([guid]::NewGuid())", "New-Item -ItemType Directory $t | Out-Null"]

/** Download a zip and copy `member` (a path inside it) to `%LOCALAPPDATA%\bin\<name>.exe`. */
export function winArchive(url: string, member: string, name: string): string {
	return [
		PS_PRELUDE,
		winPathDir(WIN_BIN),
		...WIN_TEMP,
		`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "$t\\archive.zip"`,
		'Expand-Archive "$t\\archive.zip" "$t\\x"',
		`Copy-Item "$t\\x\\${member}" "${WIN_BIN}\\${name}.exe" -Force`,
		"Remove-Item -Recurse -Force $t",
	].join("; ")
}

/**
 * Unpack a whole zip into `dir` (replacing it) and put `dir\<bin>` on the user PATH.
 * `nested`: the zip holds one top folder, which becomes `dir`.
 */
export function winTree(url: string, dir: string, opts: { bin?: string; nested?: boolean } = {}): string {
	return [
		PS_PRELUDE,
		...WIN_TEMP,
		`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "$t\\archive.zip"`,
		'Expand-Archive "$t\\archive.zip" "$t\\x"',
		`if (Test-Path "${dir}") { Remove-Item -Recurse -Force "${dir}" }`,
		`New-Item -ItemType Directory -Force (Split-Path "${dir}") | Out-Null`,
		opts.nested
			? `Move-Item (Get-ChildItem "$t\\x" -Directory | Select-Object -First 1).FullName "${dir}"`
			: `Move-Item "$t\\x" "${dir}"`,
		"Remove-Item -Recurse -Force $t",
		winPathDir(opts.bin ? `${dir}\\${opts.bin}` : dir),
	].join("; ")
}

/** A Windows command run in PowerShell with the stop-on-error prelude. */
export function ps(...steps: string[]): string {
	return [PS_PRELUDE, ...steps].join("; ")
}

/** PATH entries for a tool in the per-user bin dirs: `$HOME/.local/bin` on unix, `%LOCALAPPDATA%\bin` on Windows. */
export function localBinEnv(os: OsTarget): EnvVar[] {
	return [{ path: os === "windows" ? WIN_BIN : LOCAL_BIN }]
}
