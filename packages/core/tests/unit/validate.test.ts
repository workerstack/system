import { describe, expect, it } from "vitest"
import { ConfigError } from "../../src/errors.ts"
import { validateConfig } from "../../src/validate.ts"

const go = { description: "Go", os: { all: "get go" }, required: true, version: "1.27.1" }

function errors(config: unknown): string[] {
	try {
		validateConfig(config)
		return []
	} catch (error) {
		if (!(error instanceof ConfigError)) throw error
		return error.message.split("\n").slice(1)
	}
}

describe("validateConfig built-in entries", () => {
	const builtins = new Set(["go", "uv"])
	const check = (deps: unknown) => {
		try {
			validateConfig({ deps }, builtins)
			return []
		} catch (error) {
			return (error as Error).message.split("\n").slice(1)
		}
	}

	it("accepts a version string and an override object", () => {
		expect(check({ go: "1.27.2", uv: { os: { macos: false }, required: false, version: "0.13.1" } })).toEqual([])
		expect(check({ go: { os: {}, version: "1.27.2" } })).toEqual([])
	})

	it("rejects an empty version, a missing version, unknown keys, and bad override fields", () => {
		expect(check({ go: "" })).toEqual(["  - deps.go: must be a version string or { version, ... }"])
		expect(check({ go: 1 })).toEqual(["  - deps.go: must be a version string or { version, ... }"])
		expect(check({ go: { os: { beos: "x" }, required: 1, verison: "1" } })).toEqual([
			"  - deps.go.version: must be a non-empty string",
			"  - deps.go.required: must be true or false",
			"  - deps.go.os.beos: unknown OS (allowed: all, linux-apt, linux-dnf, linux-pacman, macos, windows)",
			"  - deps.go.verison: unknown key (allowed: check, dependsOn, description, env, os, required, version)",
		])
		expect(check({ go: { description: "", version: "1" } })).toEqual([
			"  - deps.go.description: must be a non-empty string",
		])
	})
})

describe("validateConfig", () => {
	it("accepts a full valid config and returns it typed", () => {
		const config = {
			deps: {
				go: {
					...go,
					check: { command: "go version", pattern: "go(\\d+\\.\\d+\\.\\d+)" },
					dependsOn: [],
					env: [{ path: "/usr/local/go/bin" }, { key: "GOPATH", value: "$HOME/go" }, { detect: ["/a"], key: "X" }],
					os: { all: "x", "linux-apt": false, windows: "y" },
				},
			},
			packageJsonPath: "package.json",
		}
		expect(validateConfig(config)).toBe(config)
	})

	it("heads the message and lists one line per problem", () => {
		expect(() => validateConfig({ deps: { go: { ...go, version: 1 } } })).toThrow(
			new ConfigError("Invalid system config:\n  - deps.go.version: must be a non-empty string"),
		)
	})

	it("rejects a non-object config and a missing or non-object deps", () => {
		expect(errors(null)).toEqual(["  - config: must be an object like { deps: { ... } }"])
		expect(errors({})).toEqual(["  - deps: must be an object of dependencies"])
		expect(errors({ deps: [] })).toEqual(["  - deps: must be an object of dependencies"])
	})

	it("rejects unknown top-level keys and a non-string packageJsonPath", () => {
		expect(errors({ deps: {}, packageJsonPath: 1, pkg: "x" })).toEqual([
			"  - packageJsonPath: must be a string",
			"  - pkg: unknown key (allowed: deps, packageJsonPath)",
		])
	})

	it("collects every problem in a dep, with its path", () => {
		expect(errors({ deps: { go: { os: {}, required: "yes", verison: "1" } } })).toEqual([
			"  - deps.go.description: must be a non-empty string",
			"  - deps.go.version: must be a non-empty string",
			"  - deps.go.required: must be true or false",
			"  - deps.go.os: must name at least one OS key or all",
			"  - deps.go.verison: unknown key (allowed: check, dependsOn, description, env, os, required, version)",
		])
	})

	it("rejects a dep that is not an object", () => {
		expect(errors({ deps: { go: "1.27.1" } })).toEqual(["  - deps.go: must be an object"])
	})

	it("checks os keys and values", () => {
		expect(errors({ deps: { go: { ...go, os: { all: false, beos: "x", macos: 1 } } } })).toEqual([
			"  - deps.go.os.all: must be a command string",
			"  - deps.go.os.beos: unknown OS (allowed: all, linux-apt, linux-dnf, linux-pacman, macos, windows)",
			"  - deps.go.os.macos: must be a command string or false",
		])
		expect(errors({ deps: { go: { ...go, os: "x" } } })).toEqual(["  - deps.go.os: must be an object of commands"])
	})

	it("checks check, dependsOn, and a bad pattern", () => {
		expect(
			errors({ deps: { go: { ...go, check: { command: "", pattern: "(", x: 1 }, dependsOn: ["a", 2] } } }),
		).toEqual([
			"  - deps.go.check.command: must be a non-empty string",
			"  - deps.go.check.pattern: invalid regex",
			"  - deps.go.check.x: unknown key (allowed: command, pattern)",
			"  - deps.go.dependsOn: must be a list of dep names",
		])
		expect(errors({ deps: { go: { ...go, check: "go -v" } } })).toEqual([
			"  - deps.go.check: must be an object like { command }",
		])
		expect(errors({ deps: { go: { ...go, check: { command: "go", pattern: 1 } } } })).toEqual([
			"  - deps.go.check.pattern: must be a regex source string",
		])
	})

	it("accepts a check without a pattern and rejects a non-string env value", () => {
		expect(
			errors({ deps: { go: { ...go, check: { command: "go version" }, env: [{ key: "A", value: 1 }] } } }),
		).toEqual(["  - deps.go.env[0].value: must be a string"])
	})

	it("checks each env entry and points appendToPath at { path }", () => {
		expect(
			errors({
				deps: {
					go: {
						...go,
						env: [
							{ appendToPath: true, key: "PATH", value: "/go/bin" },
							{ key: "A" },
							{ detect: "x", key: "B" },
							{ detect: ["/x"], fallback: 1, key: "C" },
							{ path: "" },
							{ key: 1, value: "v" },
							3,
						],
					},
				},
			}),
		).toEqual([
			'  - deps.go.env[0]: appendToPath is gone; use { path: "/go/bin" } (it goes first on PATH)',
			"  - deps.go.env[1]: must be { path }, { key, value } or { key, detect, fallback? }",
			"  - deps.go.env[2].detect: must be a list of paths",
			"  - deps.go.env[3].fallback: must be a string",
			"  - deps.go.env[4].path: must be a non-empty string",
			"  - deps.go.env[5].key: must be a non-empty string",
			"  - deps.go.env[6]: must be { path }, { key, value } or { key, detect, fallback? }",
		])
		expect(errors({ deps: { go: { ...go, env: {} } } })).toEqual(["  - deps.go.env: must be a list"])
	})
})
