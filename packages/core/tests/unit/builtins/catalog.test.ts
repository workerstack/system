import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTINS as NARROW } from "../../../src/builtins/index.ts"
import { launcher, winTree } from "../../../src/builtins/recipes.ts"
import { resolveDeps } from "../../../src/builtins/resolve.ts"
import type { Arch, BuiltinDep } from "../../../src/builtins/types.ts"
import { OS_TARGETS, type OsTarget } from "../../../src/config.ts"
import { ConfigError } from "../../../src/errors.ts"
import { needsPowerShell } from "../../../src/exec.ts"
import { validateConfig } from "../../../src/validate.ts"

/* widened, so every entry reads as a BuiltinDep */
const BUILTINS: Readonly<Record<string, BuiltinDep>> = NARROW
const ARCHES: Arch[] = ["x64", "arm64"]
const sample = (name: string) => (BUILTINS[name]?.versions === "latest" ? "latest" : "1.2.3")

/** `name` and every pinned prerequisite it needs, at sample versions */
function withPrerequisites(name: string): Record<string, string> {
	const deps: Record<string, string> = {}
	const add = (dep: string) => {
		deps[dep] = sample(dep)
		for (const need of BUILTINS[dep]?.dependsOn ?? []) {
			if (BUILTINS[need]?.versions !== "latest") add(need)
		}
	}
	add(name)
	return deps
}

function command(name: string, os: OsTarget, arch: Arch = "x64", version = sample(name)) {
	const cmds = (BUILTINS[name] as BuiltinDep).os({ arch, version })
	const cmd = cmds[os] ?? cmds.all
	return cmd === false ? undefined : cmd
}

describe("built-in catalog", () => {
	it("has no name in two groups", () => {
		const total = Object.values(BUILTIN_GROUPS).reduce((sum, group) => sum + Object.keys(group).length, 0)
		expect(BUILTIN_NAMES.size).toBe(total)
		expect(BUILTIN_NAMES.size).toBe(43)
	})

	it("names only catalog deps as prerequisites, and every prerequisite is installable somewhere", () => {
		for (const [name, builtin] of Object.entries(BUILTINS)) {
			for (const need of builtin.dependsOn ?? []) expect(BUILTIN_NAMES.has(need), `${name} → ${need}`).toBe(true)
			expect(builtin.description.length, name).toBeGreaterThan(10)
		}
	})

	for (const name of Object.keys(BUILTINS)) {
		it(`${name}: resolves on every OS and CPU to a clean command or explicit unavailability`, () => {
			let available = 0
			for (const os of OS_TARGETS) {
				for (const arch of ARCHES) {
					const raw = (BUILTINS[name] as BuiltinDep).os({ arch, version: sample(name) })
					const value = raw[os] ?? raw.all
					expect(value, `${name} on ${os} must be a command or false`).not.toBeUndefined()
					if (value === false || value === undefined) continue
					available++
					expect(value).not.toMatch(/\{\{|undefined|\[object/)
					if (os === "windows") {
						if (needsPowerShell(value)) expect(value).toContain("$ErrorActionPreference = 'Stop'")
					} else {
						expect(value, `${name} on ${os}`).not.toContain("$env:")
					}
				}
				const config = resolveDeps(withPrerequisites(name), { arch: "x64", os }, BUILTINS)
				/* the resolved config, with auto-added bootstraps, is itself a valid custom config */
				expect(() => validateConfig({ deps: config })).not.toThrow()
			}
			expect(available, `${name} installs nowhere`).toBeGreaterThan(0)
		})
	}

	it("is documented: the package README has a table row for every built-in", () => {
		const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf-8")
		/* oxfmt pads table cells, so match the first cell loosely */
		for (const name of BUILTIN_NAMES) expect(readme, name).toMatch(new RegExp(`^\\| \`${name}\` +\\|`, "m"))
	})

	it("writes unix paths on unix and Windows paths on Windows", () => {
		for (const [name, builtin] of Object.entries(BUILTINS)) {
			for (const os of OS_TARGETS) {
				for (const entry of builtin.env?.(os) ?? []) {
					const value = "path" in entry ? entry.path : "value" in entry ? entry.value : ""
					if (os === "windows") expect(value, `${name} ${os}`).not.toContain("/")
					else expect(value, `${name} ${os}`).not.toMatch(/\\|\$env:/)
				}
			}
		}
	})
})

/** The check a built-in resolves to on `os`. */
function check(name: string, os: OsTarget) {
	return resolveDeps(withPrerequisites(name), { arch: "x64", os }, BUILTINS)[name]?.check
}

describe("unix commands", () => {
	it("all parse in bash", () => {
		for (const name of Object.keys(BUILTINS)) {
			for (const os of OS_TARGETS.filter((target) => target !== "windows")) {
				for (const arch of ARCHES) {
					const cmd = command(name, os, arch)
					if (cmd === undefined) continue
					const result = spawnSync("bash", ["-n", "-c", cmd])
					expect(result.status, `${name} on ${os} ${arch}: ${result.stderr}`).toBe(0)
				}
			}
		}
	})

	it("launcher writes a script that runs its target with every argument", () => {
		const home = mkdtempSync(join(tmpdir(), "launcher-"))
		try {
			const run = (cmd: string) =>
				spawnSync("bash", ["-c", cmd], { encoding: "utf-8", env: { ...process.env, HOME: home } })
			expect(run(launcher("hello", "/bin/echo")).status).toBe(0)
			expect(readFileSync(join(home, ".local/bin/hello"), "utf-8")).toBe('#!/bin/sh\nexec "/bin/echo" "$@"\n')
			expect(run('"$HOME/.local/bin/hello" a "b c"').stdout).toBe("a b c\n")
		} finally {
			rmSync(home, { force: true, recursive: true })
		}
	})
})

describe("winTree", () => {
	it("unpacks tarballs with the system tar.exe and zips with Expand-Archive", () => {
		const tarball = winTree("https://example.com/tool.tar.bz2", "$env:LOCALAPPDATA\\Programs\\tool", { nested: true })
		expect(tarball).toContain(
			'Invoke-WebRequest -UseBasicParsing "https://example.com/tool.tar.bz2" -OutFile "$t\\archive"',
		)
		expect(tarball).toContain('& "$env:SystemRoot\\System32\\tar.exe" -xf "$t\\archive" -C "$t\\x"')
		expect(tarball).not.toContain("Expand-Archive")
		const zip = winTree("https://example.com/tool.zip", "$env:LOCALAPPDATA\\Programs\\tool")
		expect(zip).toContain('-OutFile "$t\\archive.zip"; Expand-Archive "$t\\archive.zip" "$t\\x"')
		expect(zip).not.toContain("tar.exe")
	})
})

describe("verified recipes", () => {
	it("gh picks the release asset for each platform", () => {
		expect(command("gh", "linux-apt", "x64", "2.102.0")).toContain(
			"https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_amd64.tar.gz",
		)
		expect(command("gh", "macos", "arm64", "2.102.0")).toContain("gh_2.102.0_macOS_arm64.zip")
		expect(command("gh", "windows", "x64", "2.102.0")).toContain("gh_2.102.0_windows_amd64.zip")
	})

	it("rtk uses the static musl build on x64 Linux and glibc on arm64", () => {
		expect(command("rtk", "linux-dnf", "x64", "0.51.0")).toContain("rtk-x86_64-unknown-linux-musl.tar.gz")
		expect(command("rtk", "linux-dnf", "arm64", "0.51.0")).toContain("rtk-aarch64-unknown-linux-gnu.tar.gz")
	})

	it("sherpa-onnx unpacks the shared CPU build per platform and puts its bin dir on PATH", () => {
		const base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-v2.0.1"
		expect(command("sherpa-onnx", "linux-apt", "x64", "2.0.1")).toContain(`${base}-linux-x64-shared.tar.bz2`)
		expect(command("sherpa-onnx", "linux-pacman", "arm64", "2.0.1")).toContain(
			`${base}-linux-aarch64-shared-cpu.tar.bz2`,
		)
		expect(command("sherpa-onnx", "macos", "arm64", "2.0.1")).toContain(`${base}-osx-arm64-shared.tar.bz2`)
		expect(command("sherpa-onnx", "macos", "x64", "2.0.1")).toContain(`${base}-osx-x64-shared.tar.bz2`)
		expect(command("sherpa-onnx", "windows", "x64", "2.0.1")).toContain(`${base}-win-x64-shared-MT-Release.tar.bz2`)
		expect(command("sherpa-onnx", "windows", "arm64", "2.0.1")).toContain(`${base}-win-arm64-shared-MT-Release.tar.bz2`)
		const sherpa = BUILTINS["sherpa-onnx"] as BuiltinDep
		expect(sherpa.check).toEqual({ command: "sherpa-onnx-version" })
		expect(sherpa.env?.("linux-apt")).toEqual([{ path: "$HOME/.local/share/sherpa-onnx/bin" }])
		expect(sherpa.env?.("windows")).toEqual([{ path: "$env:LOCALAPPDATA\\Programs\\sherpa-onnx\\bin" }])
	})

	it("stripe picks the release asset, with the x64 zip on Windows arm64", () => {
		const base = "https://github.com/stripe/stripe-cli/releases/download/v1.55.10/stripe_1.55.10"
		expect(command("stripe", "linux-dnf", "arm64", "1.55.10")).toContain(`${base}_linux_arm64.tar.gz`)
		expect(command("stripe", "linux-apt", "x64", "1.55.10")).toContain(`${base}_linux_x86_64.tar.gz`)
		expect(command("stripe", "macos", "x64", "1.55.10")).toContain(`${base}_mac-os_x86_64.tar.gz`)
		expect(command("stripe", "windows", "arm64", "1.55.10")).toContain(`${base}_windows_x86_64.zip`)
	})

	it("java takes a feature major or an exact, URL-encoded release", () => {
		expect(command("java", "linux-apt", "x64", "21")).toContain(
			"https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse",
		)
		expect(command("java", "macos", "arm64", "21.0.13+9")).toContain(
			"https://api.adoptium.net/v3/binary/version/jdk-21.0.13%2B9/mac/aarch64/jdk/hotspot/normal/eclipse",
		)
	})

	it("google-java-format falls back to the jar on x64 macOS only", () => {
		expect(command("google-java-format", "macos", "x64", "1.37.0")).toContain("google-java-format-1.37.0-all-deps.jar")
		expect(command("google-java-format", "macos", "arm64", "1.37.0")).toContain("google-java-format_darwin-arm64")
		expect(command("google-java-format", "linux-apt", "arm64", "1.37.0")).toContain("google-java-format_linux-arm64")
	})

	it("pins uv's bin dirs to the PATH entry it writes, whatever XDG_* says", () => {
		expect(command("ruff", "linux-apt", "x64", "0.17.1")).toBe(
			'UV_TOOL_BIN_DIR="$HOME/.local/bin" uv tool install --force ruff==0.17.1',
		)
		expect(command("mypy", "macos", "x64", "2.4.0")).toContain('UV_TOOL_BIN_DIR="$HOME/.local/bin" uv tool install')
		expect(command("python", "linux-pacman", "x64", "3.14.8")).toBe(
			'UV_PYTHON_BIN_DIR="$HOME/.local/bin" uv python install 3.14.8 --default',
		)
		expect(command("ruff", "windows", "x64", "0.17.1")).toBe("uv tool install --force ruff==0.17.1")
	})

	it("installs global JS CLIs with bun, never npm", () => {
		/* bun's global bin follows XDG_CACHE_HOME unless pinned; the launchers are node scripts */
		expect(command("cf", "linux-apt", "x64", "1.0.0-beta.12")).toBe(
			'BUN_INSTALL_BIN="$HOME/.bun/bin" bun i -g cf@1.0.0-beta.12',
		)
		expect(command("codex", "windows", "x64", "0.160.0")).toBe("bun i -g @openai/codex@0.160.0")
		expect(BUILTINS.cf?.dependsOn).toEqual(["bun", "node"])
		expect(BUILTINS.codex?.dependsOn).toEqual(["bun", "node"])
		for (const name of Object.keys(BUILTINS)) {
			for (const os of OS_TARGETS) expect(command(name, os) ?? "").not.toMatch(/\bnpm (i|install)\b|\bpnpm\b|\byarn\b/)
		}
	})

	it("passes the version to self-updating installers only when pinned", () => {
		expect(command("claude", "linux-apt", "x64", "2.1.89")).toBe(
			"curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89",
		)
		expect(command("claude", "linux-apt", "x64", "latest")).toBe("curl -fsSL https://claude.ai/install.sh | bash -s")
		expect(command("grok", "windows", "x64", "1.0.77")).toContain("-Version 1.0.77")
	})

	it("chromium uses the distro on Linux and the official snapshot for the CPU elsewhere", () => {
		const snapshots = "https://storage.googleapis.com/chromium-browser-snapshots"
		expect(command("chromium", "macos", "arm64")).toContain(`rev="$(curl -fsSL "${snapshots}/Mac_Arm/LAST_CHANGE")"`)
		expect(command("chromium", "macos", "arm64")).toContain(`${snapshots}/Mac_Arm/$rev/chrome-mac.zip`)
		expect(command("chromium", "macos", "x64")).toContain(`${snapshots}/Mac/$rev/chrome-mac.zip`)
		expect(command("chromium", "macos", "x64")).toContain('"$HOME/Applications/Chromium.app/Contents/MacOS/Chromium"')
		expect(command("chromium", "windows", "x64")).toContain(
			`"${snapshots}/Win_x64/$(Invoke-RestMethod '${snapshots}/Win_x64/LAST_CHANGE')/chrome-win.zip"`,
		)
		expect(command("chromium", "windows", "arm64")).toContain(`${snapshots}/Win_Arm64/`)
		expect(command("chromium", "linux-pacman")).toBe("sudo pacman -S --noconfirm chromium")
		expect(check("chromium", "windows")).toEqual({
			command: `powershell -NoProfile -Command "(Get-Item '%LOCALAPPDATA%\\Programs\\chromium\\chrome.exe').VersionInfo.ProductVersion"`,
		})
		expect(check("chromium", "macos")).toBeUndefined()
	})

	it("google-chrome installs Google's package for the CPU, the AUR build on Arch, and a PATH launcher on macOS", () => {
		const direct = "https://dl.google.com/linux/direct/google-chrome-stable_current"
		expect(command("google-chrome", "linux-apt", "x64")).toContain(`${direct}_amd64.deb`)
		expect(command("google-chrome", "linux-apt", "arm64")).toContain(`${direct}_arm64.deb`)
		expect(command("google-chrome", "linux-apt", "x64")).toContain('sudo apt-get install -y "$tmp/package.deb"')
		expect(command("google-chrome", "linux-dnf", "x64")).toContain(`${direct}_x86_64.rpm`)
		expect(command("google-chrome", "linux-dnf", "arm64")).toContain(`${direct}_aarch64.rpm`)
		expect(command("google-chrome", "linux-pacman")).toContain(
			'git clone --depth 1 "https://aur.archlinux.org/google-chrome.git" "$tmp/google-chrome" && (cd "$tmp/google-chrome" && makepkg -si --noconfirm)',
		)
		expect(command("google-chrome", "macos")).toContain("brew install --cask google-chrome && ")
		expect(command("google-chrome", "macos")).toContain(
			'"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"',
		)
		expect(command("google-chrome", "windows")).toBe("choco install googlechrome -y")
		expect(check("google-chrome", "windows")?.command).toContain(
			"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
		)
	})

	it("firefox comes from Mozilla's APT repo, pinned over Ubuntu's snap package", () => {
		const apt = command("firefox", "linux-apt") ?? ""
		expect(apt).toContain("https://packages.mozilla.org/apt/repo-signing-key.gpg")
		expect(apt).toContain("https://packages.mozilla.org/apt mozilla main")
		expect(apt).toContain("Pin-Priority: 1000")
		expect(apt).toMatch(/sudo apt-get update && sudo apt-get install -y firefox$/)
		expect(command("firefox", "macos")).toBe("brew install --cask firefox")
		expect(command("firefox", "windows")).toBe("choco install firefox -y")
		expect(check("firefox", "windows")?.command).toContain("%ProgramFiles%\\Mozilla Firefox\\firefox.exe")
		expect(check("firefox", "linux-dnf")).toBeUndefined()
	})

	it("epiphany is Linux-only, under Debian's package name on apt", () => {
		expect(command("epiphany", "linux-apt")).toBe("sudo apt-get install -y epiphany-browser")
		expect(command("epiphany", "linux-dnf")).toBe("sudo dnf install -y epiphany")
		expect(command("epiphany", "macos")).toBeUndefined()
		expect(command("epiphany", "windows")).toBeUndefined()
	})

	it("vscode installs the requested release for each platform", () => {
		const update = "https://update.code.visualstudio.com"
		expect(command("vscode", "linux-apt", "arm64", "1.95.0")).toContain(`${update}/1.95.0/linux-deb-arm64/stable`)
		expect(command("vscode", "linux-dnf", "x64", "latest")).toContain(`${update}/latest/linux-rpm-x64/stable`)
		expect(command("vscode", "linux-pacman", "x64", "1.95.0")).toContain(`${update}/1.95.0/linux-x64/stable`)
		expect(command("vscode", "linux-pacman", "x64", "1.95.0")).toContain(
			'ln -sf "$HOME/.local/share/vscode/bin/code" "$HOME/.local/bin/code"',
		)
		expect(command("vscode", "macos", "arm64", "1.95.0")).toContain(`${update}/1.95.0/darwin-universal/stable`)
		const windows = command("vscode", "windows", "arm64", "1.95.0")
		expect(windows).toContain(`${update}/1.95.0/win32-arm64-user/stable`)
		expect(windows).toContain("'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/MERGETASKS=!runcode,addtopath'")
		expect(windows).toContain("if ($p.ExitCode -ne 0)")
		expect(BUILTINS.vscode?.env?.("windows")).toEqual([{ path: "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\bin" }])
		expect(check("vscode", "windows")).toEqual({ command: "code --version" })
	})

	it("t3code installs the pinned release and reads its version without launching it", () => {
		const base = "https://github.com/pingdotgg/t3code/releases/download/v0.1.9/T3-Code-0.1.9"
		expect(command("t3code", "linux-apt", "x64", "0.1.9")).toContain(`${base}-amd64.deb`)
		expect(command("t3code", "linux-apt", "arm64", "0.1.9")).toContain(`${base}-arm64.deb`)
		expect(command("t3code", "linux-dnf", "x64", "0.1.9")).toContain(
			`curl -fsSL "${base}-x86_64.AppImage" -o "$HOME/.local/share/t3code/T3-Code-0.1.9-x86_64.AppImage"`,
		)
		expect(command("t3code", "linux-pacman", "arm64", "0.1.9")).toContain(`${base}-arm64.AppImage`)
		expect(command("t3code", "macos", "x64", "0.1.9")).toContain(`${base}-x64.zip`)
		expect(command("t3code", "windows", "arm64", "0.1.9")).toContain(`${base}-arm64.exe`)
		expect(check("t3code", "linux-apt")).toEqual({ command: "dpkg-query -W -f '${Version}' t3code" })
		expect(check("t3code", "linux-pacman")).toEqual({
			command: 'ls "$HOME/.local/share/t3code"',
			pattern: "T3-Code-(\\d+\\.\\d+\\.\\d+)",
		})
		expect(check("t3code", "macos")?.command).toContain('"$HOME/Applications/T3 Code (Beta).app/Contents/Info"')
		expect(check("t3code", "windows")?.command).toContain(
			"Uninstall\\e9197887-efb3-55e0-985e-d6d3b5dd594a').DisplayVersion",
		)
		expect(() => resolveDeps({ t3code: "latest" }, { arch: "x64", os: "macos" }, BUILTINS)).toThrow(ConfigError)
	})
})
