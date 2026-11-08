import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { findConfig, importConfig } from "../../src/load.ts"
import { fakeRuntime } from "./fake-runtime.ts"

const config = { deps: {} }
const at = (name: string) => resolve("/work", name)

describe("findConfig", () => {
	it("resolves --config against cwd", () => {
		const rt = fakeRuntime({ cwd: "/work", files: { [at("cfg/x.ts")]: "" } })
		expect(findConfig(rt, "cfg/x.ts")).toEqual({ ok: true, value: at("cfg/x.ts") })
	})

	it("fails when --config points at nothing", () => {
		expect(findConfig(fakeRuntime(), "missing.ts")).toEqual({
			error: `Config file not found: ${at("missing.ts")}`,
			ok: false,
		})
	})

	it("takes the first convention name present", () => {
		const rt = fakeRuntime({ files: { [at("system.config.js")]: "", [at("system.config.mjs")]: "" } })
		expect(findConfig(rt, undefined)).toEqual({ ok: true, value: at("system.config.js") })
	})

	it("names every convention when none exists", () => {
		expect(findConfig(fakeRuntime(), undefined)).toEqual({
			error: "No system config found. Create one of: system.config.ts, system.config.js, system.config.mjs",
			ok: false,
		})
	})
})

describe("importConfig", () => {
	it("prefers the default export", async () => {
		const rt = fakeRuntime({ modules: { "/c.ts": { default: config, other: { deps: { x: 1 } } } } })
		expect(await importConfig(rt, "/c.ts")).toEqual({ ok: true, value: config })
	})

	it("falls back to a named export holding deps", async () => {
		const rt = fakeRuntime({ modules: { "/c.ts": { default: 1, junk: null, named: config } } })
		expect(await importConfig(rt, "/c.ts")).toEqual({ ok: true, value: config })
	})

	it("throws a ConfigError for an invalid config", async () => {
		const rt = fakeRuntime({ modules: { "/c.ts": { default: { deps: { go: { version: "1" } } } } } })
		await expect(importConfig(rt, "/c.ts")).rejects.toThrow(/^Invalid system config:\n  - deps.go.description/)
	})

	it("fails when no export holds deps", async () => {
		const rt = fakeRuntime({ modules: { "/c.ts": { default: { nope: true } } } })
		expect(await importConfig(rt, "/c.ts")).toEqual({
			error: "Config file must export an object with a `deps` field (use defineConfig)",
			ok: false,
		})
	})
})
