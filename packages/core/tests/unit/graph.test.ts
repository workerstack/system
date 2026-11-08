import { describe, expect, it } from "vitest"
import type { SystemDepConfig } from "../../src/config.ts"
import { ConfigError } from "../../src/errors.ts"
import { sortByDependencies } from "../../src/graph.ts"

function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
	return {
		description: "test dep",
		os: { all: "echo ok" },
		required: true,
		version: "1.0.0",
		...overrides,
	}
}

const names = (entries: Array<[string, SystemDepConfig]>) => sortByDependencies(entries).map(([name]) => name)

describe("sortByDependencies", () => {
	it("puts dependsOn targets first", () => {
		expect(
			names([
				["cf", dep({ dependsOn: ["bun"] })],
				["bun", dep()],
			]),
		).toEqual(["bun", "cf"])
	})

	it("walks a deeper chain and keeps independent entries in config order", () => {
		expect(
			names([
				["z", dep()],
				["ruff", dep({ dependsOn: ["uv"] })],
				["uv", dep({ dependsOn: ["curl"] })],
				["curl", dep()],
				["mypy", dep({ dependsOn: ["uv"] })],
			]),
		).toEqual(["z", "curl", "uv", "ruff", "mypy"])
	})

	it("throws on a dependsOn name that is not in the config", () => {
		expect(() => names([["ruff", dep({ dependsOn: ["uv"] })]])).toThrow(
			new ConfigError('deps.ruff.dependsOn: "uv" is not a dep in this config'),
		)
	})

	it("throws on a cycle and names it", () => {
		expect(() =>
			names([
				["a", dep({ dependsOn: ["b"] })],
				["b", dep({ dependsOn: ["c"] })],
				["c", dep({ dependsOn: ["a"] })],
			]),
		).toThrow(new ConfigError("dependency cycle: a → b → c → a"))
	})

	it("throws on a self-dependency", () => {
		expect(() => names([["a", dep({ dependsOn: ["a"] })]])).toThrow(new ConfigError("dependency cycle: a → a"))
	})
})
