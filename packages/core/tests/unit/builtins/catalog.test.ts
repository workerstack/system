import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTINS as NARROW } from "../../../src/builtins/index.ts"
import { resolveDeps } from "../../../src/builtins/resolve.ts"
import type { Arch, BuiltinDep } from "../../../src/builtins/types.ts"
import { OS_TARGETS, type OsTarget } from "../../../src/config.ts"
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
		expect(BUILTIN_NAMES.size).toBe(36)
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
		expect(command("cf", "linux-apt", "x64", "1.0.0-beta.12")).toBe("bun i -g cf@1.0.0-beta.12")
		expect(command("codex", "windows", "x64", "0.160.0")).toBe("bun i -g @openai/codex@0.160.0")
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
})
