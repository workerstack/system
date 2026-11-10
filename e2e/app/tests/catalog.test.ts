import { dirname, join } from "node:path"
import { describe, expect, test } from "bun:test"
import {
	BUILTIN_NAMES,
	BUILTINS,
	OS_TARGETS,
	type OsTarget,
	resolveCheckCommand,
	resolveDeps,
	resolveOsCommand,
	type SystemDepConfig,
	sortByDependencies,
} from "@workerstack/system"
import catalog from "../../../examples/consumer/system.config.ts"
import { runCli } from "./helpers.ts"

const catalogPath = join(import.meta.dir, "../../../examples/consumer/system.config.ts")
const catalogDir = dirname(catalogPath)

function resolvedOn(os: OsTarget, arch = "x64"): Record<string, SystemDepConfig> {
	return resolveDeps(catalog.deps, { arch, os }, BUILTINS)
}

describe("workerstack catalog — every built-in and the custom form", () => {
	test("declares every built-in except the auto-added bootstraps, plus one custom dep", () => {
		const declared = Object.keys(catalog.deps)
		const builtins = declared.filter((name) => BUILTIN_NAMES.has(name))
		expect(builtins.length).toBe(BUILTIN_NAMES.size - 2)
		expect(declared.filter((name) => !BUILTIN_NAMES.has(name))).toEqual(["just"])
	})

	test("resolves to 39 deps with brew and choco added", () => {
		const deps = resolvedOn("linux-apt")
		expect(Object.keys(deps).length).toBe(39)
		expect(deps.brew?.version).toBe("latest")
		expect(deps.choco?.version).toBe("latest")
	})

	test("every resolved command on every OS and CPU is interpolated", () => {
		let count = 0
		for (const os of OS_TARGETS) {
			for (const arch of ["x64", "arm64"]) {
				for (const [name, dep] of Object.entries(resolvedOn(os, arch))) {
					const cmd = resolveOsCommand(name, dep, os)
					if (!cmd) continue
					count++
					expect(cmd, `${name} on ${os}/${arch}`).not.toContain("{{")
				}
			}
		}
		expect(count).toBeGreaterThan(300)
	})

	test("dependsOn puts prerequisites first", () => {
		const order = sortByDependencies(Object.entries(resolvedOn("macos"))).map(([name]) => name)
		const before = (a: string, b: string) => expect(order.indexOf(a), `${a} before ${b}`).toBeLessThan(order.indexOf(b))
		for (const dep of ["ruff", "mypy", "python"]) before("uv", dep)
		for (const dep of ["gradle", "google-java-format"]) before("java", dep)
		for (const dep of ["cf", "codex", "playwright"]) before("bun", dep)
		for (const dep of ["git", "curl", "docker", "ffmpeg"]) before("brew", dep)
	})

	test("the atlas override keeps the catalog's commands and replaces the description", () => {
		const atlas = resolvedOn("linux-apt").atlas!
		expect(atlas.description).toStartWith("Atlas: after an upgrade")
		expect(resolveOsCommand("atlas", atlas, "linux-apt")).toContain("atlas-linux-amd64-v1.3.0")
	})

	test("check commands come from the catalog or default to name --version", () => {
		const deps = resolvedOn("linux-apt")
		expect(resolveCheckCommand("go", deps.go!)).toBe("go version")
		expect(resolveCheckCommand("java", deps.java!)).toBe("java -version 2>&1")
		expect(resolveCheckCommand("uv", deps.uv!)).toBe("uv --version")
		expect(resolveCheckCommand("sherpa-onnx", deps["sherpa-onnx"]!)).toBe("sherpa-onnx-version")
		expect(resolveCheckCommand("stripe", deps.stripe!)).toBe("stripe --version")
		expect(resolveCheckCommand("just", deps.just!)).toBe("just --version")
	})

	test("windows commands never use apt or brew, macOS never apt or choco", () => {
		for (const [name, dep] of Object.entries(resolvedOn("windows"))) {
			const cmd = resolveOsCommand(name, dep, "windows") ?? ""
			expect(cmd, name).not.toMatch(/apt-get|brew install/)
		}
		for (const [name, dep] of Object.entries(resolvedOn("macos"))) {
			const cmd = resolveOsCommand(name, dep, "macos") ?? ""
			expect(cmd, name).not.toMatch(/apt-get|choco install/)
		}
	})
})

describe("CLI dry-run of the workerstack catalog", () => {
	test("prints every dep for the native OS", async () => {
		const result = await runCli(["install", "--dry-run", "--config", catalogPath], { cwd: catalogDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("Dry-run complete")
		expect(result.stdout).toContain("Found 39 dependencies")
	})

	test("walks every OS target", async () => {
		for (const os of OS_TARGETS) {
			const result = await runCli(["install", "--dry-run", "--os", os, "--config", catalogPath], {
				cwd: catalogDir,
				env: { WORKERSTACK_SYSTEM_OS: undefined },
			})
			expect(result.exitCode, os).toBe(0)
			expect(result.stdout).toContain(`Detected OS: ${os}`)
		}
	})

	test("--os windows installs into LOCALAPPDATA and marks Linux-only deps unavailable", async () => {
		const result = await runCli(["install", "--dry-run", "--os", "windows", "--config", catalogPath], {
			cwd: catalogDir,
			env: { WORKERSTACK_SYSTEM_OS: undefined },
		})
		expect(result.stdout).toContain("chromium@latest — not available on windows")
		expect(result.stdout).toContain("sqld@0.24.32 — not available on windows")
		expect(result.stdout).toContain("$env:LOCALAPPDATA\\bin")
		expect(result.stdout).toContain("choco install git -y")
	})

	test("list prints the catalog", async () => {
		const result = await runCli(["list"], { cwd: catalogDir })
		expect(result.exitCode).toBe(0)
		for (const name of BUILTIN_NAMES) expect(result.stdout).toContain(`  ${name} `)
	})

	test("check git succeeds on CI images that have git", async () => {
		const result = await runCli(["check", "git", "--config", catalogPath], { cwd: catalogDir })
		expect(result.exitCode).toBe(0)
		expect(result.stdout).toContain("git@")
	})
})
