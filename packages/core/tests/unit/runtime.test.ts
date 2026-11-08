import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { processPath } from "../../src/path.ts"
import { nodeRuntime } from "../../src/runtime.ts"

const rt = nodeRuntime()
const node = JSON.stringify(process.execPath)

describe("nodeRuntime", () => {
	it("reflects this process", () => {
		expect(rt.platform).toBe(process.platform)
		expect(rt.arch).toBe(process.arch)
		expect(rt.cwd).toBe(process.cwd())
		expect(rt.env).toBe(process.env)
	})

	it("captures trimmed stdout, and fails on a non-zero exit", () => {
		expect(rt.capture(`${node} -e "console.log(' 1.2.3 ')"`)).toEqual({ ok: true, stdout: "1.2.3", timedOut: false })
		expect(rt.capture(`${node} -e "process.exit(3)"`)).toEqual({ ok: false, stdout: "", timedOut: false })
	})

	it("kills a check that outlives the timeout and reports it", () => {
		const slow = nodeRuntime({ checkTimeoutMs: 200 })
		expect(slow.capture(`${node} -e "setTimeout(() => {}, 10000)"`)).toEqual({ ok: false, stdout: "", timedOut: true })
	})

	it("captures with a replaced PATH", () => {
		const out = rt.capture(`${node} -e "console.log(process.env.PATH)"`, `/only/here`)
		expect(out).toEqual({ ok: true, stdout: "/only/here", timedOut: false })
	})

	it("runs a command and reports its exit status", () => {
		expect(rt.run(`${node} -e "process.exit(0)"`)).toBe(true)
		expect(rt.run(`${node} -e "process.exit(1)"`)).toBe(false)
	})

	it("reads, writes with parents, and checks files", () => {
		const path = join(mkdtempSync(join(tmpdir(), "system-rt-")), "a", "b.txt")
		expect(rt.exists(path)).toBe(false)
		rt.writeFile(path, "hi")
		expect(rt.exists(path)).toBe(true)
		expect(rt.readFile(path)).toBe("hi")
		expect(readFileSync(path, "utf-8")).toBe("hi")
	})

	it("imports a module by path", async () => {
		const path = join(mkdtempSync(join(tmpdir(), "system-rt-")), "c.mjs")
		writeFileSync(path, "export default { deps: { a: 1 } }")
		expect((await rt.importModule(path)).default).toEqual({ deps: { a: 1 } })
	})

	it("resolves binaries and snapshots a PATH", () => {
		expect(rt.which(process.execPath)).toBe(process.execPath)
		expect(rt.which("system-definitely-missing", processPath())).toBeNull()
		expect(rt.ttyPath().path.length).toBeGreaterThan(0)
	})

	it("logs to the console streams", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {})
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		rt.log("l")
		rt.error("e")
		rt.warn("w")
		expect([log.mock.calls, error.mock.calls, warn.mock.calls]).toEqual([[["l"]], [["e"]], [["w"]]])
		vi.restoreAllMocks()
	})
})
