import { describe, expect, it } from "vitest"
import type { SystemDepConfig } from "../../src/config.ts"
import { archLabel, defineConfig, interpolate, resolveCheckCommand, resolveOsCommand } from "../../src/config.ts"

function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
	return {
		description: "test dep",
		os: { all: "echo {{name}}-{{version}}" },
		required: true,
		version: "1.2.3",
		...overrides,
	}
}

describe("interpolate", () => {
	it("replaces name, version, and major", () => {
		expect(interpolate("{{name}}@{{version}} ({{major}})", "node", "22.12.0")).toBe("node@22.12.0 (22)")
	})

	it("maps arm64 to arm64 and every other arch to amd64", () => {
		expect(interpolate("bin-{{arch}}", "jq", "1.8.1", "arm64")).toBe("bin-arm64")
		expect(interpolate("bin-{{arch}}", "jq", "1.8.1", "x64")).toBe("bin-amd64")
		expect(archLabel()).toBe(process.arch === "arm64" ? "arm64" : "amd64")
	})

	it("uses the full version as major when there is no dot", () => {
		expect(interpolate("{{major}}", "rust", "stable")).toBe("stable")
	})
})

describe("resolveOsCommand", () => {
	it("returns null when neither the OS key nor all is set", () => {
		expect(resolveOsCommand("git", dep({ os: { macos: "brew install git" } }), "linux-apt")).toBeNull()
	})

	it("uses the specific OS command over all", () => {
		const command = resolveOsCommand(
			"git",
			dep({
				os: {
					all: "echo all",
					"linux-apt": "apt install git={{version}}",
				},
				version: "2.39.5",
			}),
			"linux-apt",
		)
		expect(command).toBe("apt install git=2.39.5")
	})

	it("falls back to all when the OS key is omitted", () => {
		expect(resolveOsCommand("bun", dep({ os: { all: "install {{name}}" } }), "macos")).toBe("install bun")
	})

	it("returns null when the OS is explicitly unavailable", () => {
		expect(resolveOsCommand("dnsmasq", dep({ os: { all: "install dnsmasq", windows: false } }), "windows")).toBeNull()
	})

	it("returns null when neither the OS key nor all is set", () => {
		expect(resolveOsCommand("epiphany", dep({ os: { "linux-apt": "apt install epiphany" } }), "macos")).toBeNull()
	})
})

describe("resolveCheckCommand", () => {
	it("defaults to name --version", () => {
		expect(resolveCheckCommand("node", dep())).toBe("node --version")
	})

	it("interpolates a custom check command", () => {
		expect(resolveCheckCommand("atlas", dep({ check: { command: "{{name}} version {{version}}" } }))).toBe(
			"atlas version 1.2.3",
		)
	})
})

describe("defineConfig", () => {
	it("returns the config as written (main defaults packageJsonPath)", () => {
		const input = { deps: { bun: "1.4.4", mine: dep() } }
		expect(defineConfig(input)).toBe(input)
	})

	it("keeps an explicit packageJsonPath", () => {
		const config = defineConfig({
			deps: {},
			packageJsonPath: "./apps/web/package.json",
		})
		expect(config.packageJsonPath).toBe("./apps/web/package.json")
	})
})
