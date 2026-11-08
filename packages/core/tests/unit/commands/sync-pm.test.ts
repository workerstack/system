import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { syncPmCommand } from "../../../src/commands/sync-pm.ts"
import { context, dep } from "./context.ts"

const pkg = resolve("/work", "package.json")

describe("sync-pm", () => {
	it("skips without a bun dep", () => {
		const ctx = context({ go: dep() })
		expect(syncPmCommand(ctx)).toBe(0)
		expect(ctx.rt.logs).toContain("\nSkipping packageManager sync — bun not in config")
	})

	it("skips when bun is latest", () => {
		const ctx = context({ bun: dep({ version: "latest" }) })
		expect(syncPmCommand(ctx)).toBe(0)
		expect(ctx.rt.logs).toContain('\nSkipping packageManager sync — bun version is "latest"')
	})

	it("leaves a correct field alone", () => {
		const ctx = context({ bun: dep({ version: "1.4.4" }) }, { files: { [pkg]: '{"packageManager": "bun@1.4.4"}' } })
		expect(syncPmCommand(ctx)).toBe(0)
		expect(ctx.rt.logs).toContain("\npackageManager already correct: bun@1.4.4")
	})

	it("rewrites a stale field", () => {
		const ctx = context(
			{ bun: dep({ version: "1.4.4" }) },
			{ files: { [pkg]: '{\n\t"name": "x",\n\t"packageManager": "bun@1.0.0"\n}\n' } },
		)
		expect(syncPmCommand(ctx)).toBe(0)
		expect(ctx.rt.files.get(pkg)).toBe('{\n\t"name": "x",\n\t"packageManager": "bun@1.4.4"\n}\n')
		expect(ctx.rt.logs).toContain("\nSyncing packageManager: bun@1.0.0 -> bun@1.4.4")
	})

	it("inserts a missing field after name", () => {
		const ctx = context({ bun: dep({ version: "1.4.4" }) }, { files: { [pkg]: '{\n\t"name": "x"\n}\n' } })
		expect(syncPmCommand(ctx)).toBe(0)
		expect(ctx.rt.files.get(pkg)).toBe('{\n\t"name": "x",\n\t"packageManager": "bun@1.4.4"\n}\n')
	})

	it("fails when package.json cannot be read", () => {
		const ctx = context({ bun: dep({ version: "1.4.4" }) })
		expect(syncPmCommand(ctx)).toBe(1)
		expect(ctx.rt.errors[0]).toMatch(/^Failed to sync packageManager: ENOENT/)
	})

	it("reports a non-Error throw", () => {
		const ctx = context({ bun: dep({ version: "1.4.4" }) }, { files: { [pkg]: '{"name":"x"}' } })
		ctx.rt.writeFile = () => {
			throw "read-only"
		}
		expect(syncPmCommand(ctx)).toBe(1)
		expect(ctx.rt.errors).toContain("Failed to sync packageManager: read-only")
	})
})
