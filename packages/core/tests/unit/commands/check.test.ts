import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { checkCommand } from "../../../src/commands/check.ts"
import { TTY_PATH_FALLBACK_WARN } from "../../../src/path.ts"
import { context, dep } from "./context.ts"

const pkg = resolve("/work", "package.json")
const found = { capture: { "go --version": "go version go1.2.3 linux/amd64" }, which: { go: "/bin/go" } }

describe("check <name>", () => {
	it("fails on an unknown dep", () => {
		const ctx = context({ go: dep() })
		expect(checkCommand(ctx, "nope", false)).toBe(1)
		expect(ctx.rt.errors).toContain("Unknown dependency: nope")
		expect(ctx.rt.logs).toContain("Available: go")
	})

	it("passes a dep unavailable on this OS", () => {
		const ctx = context({ go: dep({ os: { windows: "x" } }) })
		expect(checkCommand(ctx, "go", false)).toBe(0)
		expect(ctx.rt.logs).toContain("go — not available on linux-apt")
	})

	it("fails a missing dep", () => {
		const ctx = context({ go: dep() })
		expect(checkCommand(ctx, "go", false)).toBe(1)
		expect(ctx.rt.logs).toContain("go — not installed (expected 1.2.3)")
	})

	it("counts a binary that fails its check or prints no version as not installed", () => {
		const failing = context({ go: dep() }, { which: { go: "/bin/go" } })
		expect(checkCommand(failing, "go", false)).toBe(1)

		const silent = context({ go: dep() }, { capture: { "go --version": "go devel" }, which: { go: "/bin/go" } })
		expect(checkCommand(silent, "go", false)).toBe(1)
		expect(silent.rt.logs).toContain("go — not installed (expected 1.2.3)")
	})

	it("reports the installed version and binary path", () => {
		const ctx = context({ go: dep() }, found)
		expect(checkCommand(ctx, "go", false)).toBe(0)
		expect(ctx.rt.logs).toContain("go@1.2.3 (expected 1.2.3) /bin/go")
	})

	it("probes with the TTY PATH, or this process PATH with --here", () => {
		const tty = context({ go: dep() }, { ...found, env: { PATH: "/proc/bin" } })
		checkCommand(tty, "go", false)
		expect(tty.rt.captured[0]?.searchPath).toBe("/tty/bin")

		const here = context({ go: dep() }, { ...found, env: { PATH: "/proc/bin" } })
		checkCommand(here, "go", true)
		expect(here.rt.captured[0]?.searchPath).toBe("/proc/bin")

		const windows = context({ go: dep() }, { ...found, env: { Path: "C:\\bin" } })
		checkCommand(windows, "go", true)
		expect(windows.rt.captured[0]?.searchPath).toBe("C:\\bin")

		const none = context({ go: dep() }, found)
		checkCommand(none, "go", true)
		expect(none.rt.captured[0]?.searchPath).toBe("")
	})

	it("warns once when the TTY snapshot falls back to this process", () => {
		const ctx = context({ go: dep() }, { ...found, tty: { path: "/p", source: "process" } })
		checkCommand(ctx, "go", false)
		expect(ctx.rt.warnings).toEqual([TTY_PATH_FALLBACK_WARN])
	})
})

describe("check (all)", () => {
	it("counts ok, mismatch, and missing and fails on a missing required dep", () => {
		const ctx = context(
			{
				gone: dep(),
				go: dep(),
				mac: dep({ os: { macos: "x" } }),
				old: dep({ check: { command: "old -v" } }),
				opt: dep({ required: false }),
			},
			{
				capture: { "go --version": "go 1.2.3", "old -v": "old 0.9.0" },
				which: { go: "/bin/go", old: "/bin/old" },
			},
		)
		expect(checkCommand(ctx, undefined, false)).toBe(1)
		expect(ctx.rt.logs).toContain("  v [required] go@1.2.3")
		expect(ctx.rt.logs).toContain("  ~ [required] old@0.9.0 (expected 1.2.3) /bin/old")
		expect(ctx.rt.logs).toContain("  x [required] gone — not installed (expected 1.2.3)")
		expect(ctx.rt.logs).toContain("  x [optional] opt — not installed (expected 1.2.3)")
		expect(ctx.rt.logs).toContain("  - [required] mac — not available on linux-apt")
		expect(ctx.rt.logs).toContain("OK: 1  Mismatch: 2  Missing: 1")
		expect(ctx.rt.logs).toContain("\nRequired dependencies missing — run: system install")
	})

	it("passes with mismatches and suggests --upgrade", () => {
		const ctx = context({ go: dep() }, { capture: { "go --version": "go 1.0.0" }, which: { go: "/bin/go" } })
		expect(checkCommand(ctx, undefined, false)).toBe(0)
		expect(ctx.rt.logs).toContain("\nVersion mismatches found — run: system install --upgrade")
	})

	it("passes clean", () => {
		const ctx = context({ go: dep() }, found)
		expect(checkCommand(ctx, undefined, false)).toBe(0)
		expect(ctx.rt.logs).toContain("\nAll system dependencies OK")
	})
})

describe("check packageManager", () => {
	const bunFound = { capture: { "bun --version": "1.4.4" }, which: { bun: "/bin/bun" } }

	it("passes when packageManager matches the bun pin", () => {
		const ctx = context(
			{ bun: dep({ version: "1.4.4" }) },
			{ ...bunFound, files: { [pkg]: '{"packageManager":"bun@1.4.4"}' } },
		)
		expect(checkCommand(ctx, undefined, false)).toBe(0)
		expect(ctx.rt.logs).toContain("\n  v packageManager: bun@1.4.4")
	})

	it("counts a wrong or missing packageManager as a mismatch", () => {
		const wrong = context({ bun: dep({ version: "1.4.4" }) }, { ...bunFound, files: { [pkg]: '{"packageManager":1}' } })
		checkCommand(wrong, undefined, false)
		expect(wrong.rt.logs).toContain("\n  ~ packageManager: (missing) (expected bun@1.4.4)")
		expect(wrong.rt.logs).toContain("OK: 1  Mismatch: 1  Missing: 0")
	})

	it("accepts any bun@ in latest mode", () => {
		const ok = context(
			{ bun: dep({ version: "latest" }) },
			{ ...bunFound, files: { [pkg]: '{"packageManager":"bun@1.0.0"}' } },
		)
		checkCommand(ok, undefined, false)
		expect(ok.rt.logs).toContain("\n  v packageManager: bun@1.0.0 (latest mode)")

		const bad = context({ bun: dep({ version: "latest" }) }, { ...bunFound, files: { [pkg]: "{}" } })
		checkCommand(bad, undefined, false)
		expect(bad.rt.logs).toContain("\n  ~ packageManager: (missing) (expected bun@*)")
	})
})
