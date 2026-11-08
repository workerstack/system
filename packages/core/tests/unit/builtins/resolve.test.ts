import { describe, expect, it } from "vitest"
import { resolveDeps } from "../../../src/builtins/resolve.ts"
import type { BuiltinDep } from "../../../src/builtins/types.ts"
import { ConfigError } from "../../../src/errors.ts"

const catalog: Record<string, BuiltinDep> = {
	brew: { description: "brew", os: () => ({ macos: "install brew" }), versions: "latest" },
	tool: {
		check: { command: "tool -v" },
		dependsOn: ["brew"],
		description: "a tool",
		env: (os) => [{ path: os === "windows" ? "%LOCALAPPDATA%\\tool" : "$HOME/.tool/bin" }],
		os: ({ arch, version }) => ({ all: `get tool-${version}-${arch}`, macos: `brew install tool@${version}` }),
		versions: "pinned",
	},
	claude: { description: "claude", os: ({ version }) => ({ all: `install claude ${version}` }), versions: "any" },
	uv: { description: "uv", os: ({ version }) => ({ all: `get uv ${version}` }), versions: "pinned" },
	ruff: {
		dependsOn: ["uv"],
		description: "ruff",
		os: ({ version }) => ({ all: `uv tool install ruff==${version}` }),
		versions: "pinned",
	},
}

const custom = { description: "mine", os: { all: "make install" }, required: false, version: "2.0.0" }

describe("resolveDeps", () => {
	it("expands a version string into the catalog's config for this arch", () => {
		const deps = resolveDeps({ tool: "1.2.3" }, { arch: "arm64", os: "linux-apt" }, catalog)
		expect(deps.tool).toEqual({
			check: { command: "tool -v" },
			dependsOn: ["brew"],
			description: "a tool",
			env: [{ path: "$HOME/.tool/bin" }],
			os: { all: "get tool-1.2.3-arm64", macos: "brew install tool@1.2.3" },
			required: true,
			version: "1.2.3",
		})
		expect(resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "linux-apt" }, catalog).tool?.os.all).toBe(
			"get tool-1.2.3-x64",
		)
		expect(resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "windows" }, catalog).tool?.env).toEqual([
			{ path: "%LOCALAPPDATA%\\tool" },
		])
	})

	it("merges an override's os per key and replaces every other field", () => {
		const deps = resolveDeps(
			{
				tool: {
					check: { command: "tool version" },
					dependsOn: [],
					description: "mine",
					env: [],
					os: { macos: false, windows: "choco install tool" },
					required: false,
					version: "1.2.3",
				},
			},
			{ arch: "x64", os: "linux-apt" },
			catalog,
		)
		expect(deps.tool).toEqual({
			check: { command: "tool version" },
			dependsOn: [],
			description: "mine",
			env: [],
			os: { all: "get tool-1.2.3-x64", macos: false, windows: "choco install tool" },
			required: false,
			version: "1.2.3",
		})
	})

	it("passes custom deps through untouched", () => {
		expect(resolveDeps({ mine: custom }, { arch: "x64", os: "linux-apt" }, catalog)).toEqual({ mine: custom })
	})

	it("adds a missing latest-only prerequisite", () => {
		const deps = resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "linux-apt" }, catalog)
		expect(Object.keys(deps)).toEqual(["tool", "brew"])
		expect(deps.brew).toMatchObject({ os: { macos: "install brew" }, required: true, version: "latest" })
	})

	it("keeps a prerequisite the config already declares", () => {
		const deps = resolveDeps({ ruff: "0.17.1", uv: "0.13.1" }, { arch: "x64", os: "linux-apt" }, catalog)
		expect(Object.keys(deps)).toEqual(["ruff", "uv"])
	})

	it("rejects a missing pinned prerequisite with the fix", () => {
		expect(() => resolveDeps({ ruff: "0.17.1" }, { arch: "x64", os: "linux-apt" }, catalog)).toThrow(
			new ConfigError('Invalid system config:\n  - deps.ruff: needs uv; add uv: "<version>"'),
		)
	})

	it("rejects latest on a pinned built-in and a pin on a latest-only one", () => {
		expect(() => resolveDeps({ brew: "4.0.0", tool: "latest" }, { arch: "x64", os: "linux-apt" }, catalog)).toThrow(
			new ConfigError(
				'Invalid system config:\n  - deps.brew: brew only installs "latest"\n  - deps.tool: tool needs a pinned version, not "latest"',
			),
		)
	})

	it("accepts a pin or latest on an any-version built-in", () => {
		expect(resolveDeps({ claude: "2.1.89" }, { arch: "x64", os: "linux-apt" }, catalog).claude?.os.all).toBe(
			"install claude 2.1.89",
		)
		expect(resolveDeps({ claude: "latest" }, { arch: "x64", os: "linux-apt" }, catalog).claude?.os.all).toBe(
			"install claude latest",
		)
	})

	it("rejects an unsupported CPU only when a built-in is used", () => {
		expect(resolveDeps({ mine: custom }, { arch: "ia32", os: "linux-apt" }, catalog)).toEqual({ mine: custom })
		expect(() => resolveDeps({ tool: "1.2.3" }, { arch: "ia32", os: "linux-apt" }, catalog)).toThrow(
			new ConfigError("Invalid system config:\n  - built-in deps support x64 and arm64; this machine is ia32"),
		)
	})
})
