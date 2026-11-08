import { describe, expect, it } from "vitest"
import type { BuiltinDep } from "../../../src/builtins/types.ts"
import { listCommand } from "../../../src/commands/list.ts"
import { fakeRuntime } from "../fake-runtime.ts"

const catalog: Record<string, BuiltinDep> = {
	brew: { description: "Homebrew", os: () => ({ macos: "install" }), versions: "latest" },
	go: {
		description: "Go toolchain",
		os: ({ version }) => ({ all: `get ${version}`, windows: false }),
		versions: "pinned",
	},
}

describe("list", () => {
	it("prints each built-in with its version policy, OS availability and description", () => {
		const rt = fakeRuntime()
		expect(listCommand(rt, catalog)).toBe(0)
		expect(rt.logs).toEqual([
			'Built-in deps (give a version: go: "1.27.2")',
			"",
			"  brew  latest  macos                                   Homebrew",
			"  go    pinned  linux-apt linux-dnf linux-pacman macos  Go toolchain",
		])
	})
})
