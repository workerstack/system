import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { main, USAGE } from "../../src/main.ts"
import { type FakeOptions, fakeRuntime } from "./fake-runtime.ts"

const configPath = resolve("/work", "system.config.ts")
const config = {
	deps: {
		tool: { description: "Tool", os: { all: "get tool", macos: "brew tool" }, required: true, version: "1.0.0" },
	},
}

function rtWith(opts: FakeOptions = {}) {
	return fakeRuntime({ files: { [configPath]: "" }, modules: { [configPath]: { default: config } }, ...opts })
}

describe("main", () => {
	it("prints usage and exits 0 with no command", async () => {
		const rt = fakeRuntime()
		expect(await main([], rt)).toBe(0)
		expect(rt.logs).toEqual([USAGE])
	})

	it("prints usage and exits 1 on an unknown command", async () => {
		const rt = fakeRuntime()
		expect(await main(["wat"], rt)).toBe(1)
		expect(rt.errors).toEqual(["Unknown command: wat"])
	})

	it("lists the built-in catalog without needing a config", async () => {
		const rt = fakeRuntime()
		expect(await main(["list"], rt)).toBe(0)
		expect(rt.logs[0]).toBe('Built-in deps (give a version: go: "1.27.2")')
		expect(rt.logs.some((line) => /^\s+go\s+pinned\s/.test(line))).toBe(true)
	})

	it("exits 1 on a bad flag", async () => {
		const rt = fakeRuntime()
		expect(await main(["install", "--os", "beos"], rt)).toBe(1)
		expect(rt.errors[0]).toMatch(/^Unknown OS target: beos/)
	})

	it("exits 1 without a config", async () => {
		const rt = fakeRuntime()
		expect(await main(["check"], rt)).toBe(1)
		expect(rt.errors[0]).toMatch(/^No system config found/)
	})

	it("exits 1 when the config exports no deps", async () => {
		const rt = fakeRuntime({ files: { [configPath]: "" }, modules: { [configPath]: { default: 1 } } })
		expect(await main(["check"], rt)).toBe(1)
		expect(rt.errors[0]).toMatch(/must export an object with a `deps` field/)
	})

	it("dispatches install with flags and detects the distro through the runtime", async () => {
		const rt = rtWith({ which: { dnf: "/usr/bin/dnf" } })
		expect(await main(["install", "--dry-run"], rt)).toBe(0)
		expect(rt.logs).toContain("Detected OS: linux-dnf")
		expect(rt.logs).toContain("   dry-run: get tool")
	})

	it("honors --os, then WORKERSTACK_SYSTEM_OS", async () => {
		const flag = rtWith({ env: { WORKERSTACK_SYSTEM_OS: "windows" } })
		await main(["install", "tool", "--dry-run", "--os", "macos"], flag)
		expect(flag.logs).toContain("   dry-run: brew tool")

		const env = rtWith({ env: { WORKERSTACK_SYSTEM_OS: "macos" } })
		await main(["install", "tool", "--dry-run"], env)
		expect(env.logs).toContain("   dry-run: brew tool")
	})

	it("dispatches check, env, and sync-pm", async () => {
		const check = rtWith()
		expect(await main(["check", "tool", "--here"], check)).toBe(1)
		expect(check.logs).toContain("tool — not installed (expected 1.0.0)")

		const env = rtWith()
		expect(await main(["env"], env)).toBe(0)
		expect(env.logs).toContain("\nNo dependencies with environment variables configured.")

		const sync = rtWith()
		expect(await main(["sync-pm"], sync)).toBe(0)
		expect(sync.logs).toContain("\nSkipping packageManager sync — bun not in config")
	})

	it("reads packageJsonPath from the config", async () => {
		const pkg = resolve("/work", "app/package.json")
		const rt = fakeRuntime({
			files: { [configPath]: "", [pkg]: '{\n\t"name": "a"\n}\n' },
			modules: {
				[configPath]: {
					default: {
						deps: { bun: { description: "b", os: { all: "x" }, required: true, version: "1.4.4" } },
						packageJsonPath: "app/package.json",
					},
				},
			},
		})
		expect(await main(["sync-pm"], rt)).toBe(0)
		expect(rt.files.get(pkg)).toContain('"packageManager": "bun@1.4.4"')
	})

	it("prints a config error plainly and exits 1", async () => {
		const rt = fakeRuntime({
			files: { [configPath]: "" },
			modules: {
				[configPath]: {
					default: { deps: { a: { ...config.deps.tool, dependsOn: ["missing"] } } },
				},
			},
		})
		expect(await main(["install"], rt)).toBe(1)
		expect(rt.errors).toEqual(['deps.a.dependsOn: "missing" is not a dep in this config'])
	})

	it("turns a thrown error into a fatal exit 1", async () => {
		const rt = fakeRuntime({ files: { [configPath]: "" } })
		expect(await main(["check"], rt)).toBe(1)
		expect(rt.errors).toEqual([`\nFatal error: no module at ${configPath}`])
	})

	it("reports a non-Error throw", async () => {
		const rt = rtWith()
		rt.importModule = () => Promise.reject("boom")
		expect(await main(["check"], rt)).toBe(1)
		expect(rt.errors).toEqual(["\nFatal error: boom"])
	})
})
