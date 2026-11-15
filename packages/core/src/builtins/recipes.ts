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

const CLEANUP = 'rm -rf "$tmp"'

/** The same command on every Linux distro, and one for macOS. */
export function unix(linux: string, macos: string): OsCommands {
	return { "linux-apt": linux, "linux-dnf": linux, "linux-pacman": linux, macos }
}

/**
 * A global JS CLI through bun, the only package manager. On unix bun derives its global bin dir from
 * XDG_CACHE_HOME when set, so the dir bun's env block puts on PATH is named explicitly.
 */
export function bunGlobal(pkg: string, version: string): OsCommands {
	const command = `bun i -g ${pkg}@${version}`
	const pinned = `BUN_INSTALL_BIN="$HOME/.bun/bin" ${command}`
	return { ...unix(pinned, pinned), windows: command }
}

/** The value for this CPU. */
export function pick<T>(arch: Arch, values: { arm64: T; x64: T }): T {
	return values[arch]
}

/** Download one executable into `$HOME/.local/bin/<name>`. */
export function binary(url: string, name: string): string {
	return `mkdir -p "${LOCAL_BIN}" && curl -fsSL "${url}" -o "${LOCAL_BIN}/${name}" && chmod +x "${LOCAL_BIN}/${name}"`
}

/**
 * A `$HOME/.local/bin/<name>` script that runs `target` (expanded at install time). For app executables
 * that look up their bundle beside themselves, so a symlink would break them.
 */
export function launcher(name: string, target: string): string {
	const file = `${LOCAL_BIN}/${name}`
	return `mkdir -p "${LOCAL_BIN}" && printf '#!/bin/sh\\nexec "%s" "$@"\\n' "${target}" > "${file}" && chmod +x "${file}"`
}

/** Download a vendor package and install it with its dependencies: `.deb` through apt, `.rpm` through dnf. */
export function linuxPackage(url: string, kind: "deb" | "rpm"): string {
	const install = kind === "deb" ? "sudo apt-get install -y" : "sudo dnf install -y"
	return `tmp="$(mktemp -d)" && curl -fsSL "${url}" -o "$tmp/package.${kind}" && ${install} "$tmp/package.${kind}" && ${CLEANUP}`
}

/** Build and install an AUR package. makepkg refuses root, so this runs as a normal user with sudo. */
export function aur(pkg: string): string {
	return [
		"sudo pacman -S --needed --noconfirm base-devel git",
		'tmp="$(mktemp -d)"',
		`git clone --depth 1 "https://aur.archlinux.org/${pkg}.git" "$tmp/${pkg}"`,
		`(cd "$tmp/${pkg}" && makepkg -si --noconfirm)`,
		CLEANUP,
	].join(" && ")
}

/** Download a macOS app zip and put its one `.app` into `$HOME/Applications` (replacing it). ditto keeps the bundle's symlinks. */
export function macApp(url: string, app: string): string {
	return [
		'tmp="$(mktemp -d)"',
		`curl -fsSL "${url}" -o "$tmp/app.zip"`,
		'ditto -x -k "$tmp/app.zip" "$tmp/x"',
		`rm -rf "$HOME/Applications/${app}"`,
		'mkdir -p "$HOME/Applications"',
		`mv "$(find "$tmp/x" -maxdepth 2 -name "*.app" | head -n 1)" "$HOME/Applications/${app}"`,
		CLEANUP,
	].join(" && ")
}

/**
 * A Windows check that prints a file or registry value through PowerShell. It runs from cmd.exe, which
 * expands `%VAR%`; the single quotes keep paths with spaces whole.
 */
export function winVersionCheck(expression: string): { command: string } {
	return { command: `powershell -NoProfile -Command "${expression}"` }
}

/** The product version of an installed .exe, for GUI apps whose `--version` prints nothing on Windows. */
export function winExeVersion(path: string): { command: string } {
	return winVersionCheck(`(Get-Item '${path}').VersionInfo.ProductVersion`)
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
 * Download `url` and unpack it into `$t\x`: Expand-Archive for .zip (it rejects any other extension), the
 * system tar.exe (bsdtar: gzip, bzip2, xz) otherwise. Named by path, since Git's GNU tar can shadow it on PATH.
 */
function winExtract(url: string): string[] {
	if (url.endsWith(".zip")) {
		return [
			`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "$t\\archive.zip"`,
			'Expand-Archive "$t\\archive.zip" "$t\\x"',
		]
	}
	return [
		`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "$t\\archive"`,
		'New-Item -ItemType Directory "$t\\x" | Out-Null',
		'& "$env:SystemRoot\\System32\\tar.exe" -xf "$t\\archive" -C "$t\\x"',
	]
}

/**
 * Unpack a whole zip or tarball into `dir` (replacing it) and put `dir\<bin>` on the user PATH.
 * `nested`: the archive holds one top folder, which becomes `dir`.
 */
export function winTree(url: string, dir: string, opts: { bin?: string; nested?: boolean } = {}): string {
	return [
		PS_PRELUDE,
		...WIN_TEMP,
		...winExtract(url),
		`if (Test-Path "${dir}") { Remove-Item -Recurse -Force "${dir}" }`,
		`New-Item -ItemType Directory -Force (Split-Path "${dir}") | Out-Null`,
		opts.nested
			? `Move-Item (Get-ChildItem "$t\\x" -Directory | Select-Object -First 1).FullName "${dir}"`
			: `Move-Item "$t\\x" "${dir}"`,
		"Remove-Item -Recurse -Force $t",
		winPathDir(opts.bin ? `${dir}\\${opts.bin}` : dir),
	].join("; ")
}

/** Download a Windows installer and run it with `args` (its silent switches); fail on a non-zero exit. */
export function winInstaller(url: string, args: readonly string[]): string {
	return [
		PS_PRELUDE,
		...WIN_TEMP,
		`Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "$t\\setup.exe"`,
		`$p = Start-Process -Wait -PassThru -FilePath "$t\\setup.exe" -ArgumentList ${args.map((arg) => `'${arg}'`).join(",")}`,
		'if ($p.ExitCode -ne 0) { throw "installer exited with $($p.ExitCode)" }',
		"Remove-Item -Recurse -Force $t",
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
