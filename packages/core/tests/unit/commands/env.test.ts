import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { configureEnvVars, envCommand } from "../../../src/commands/env.ts"
import { fakeRuntime } from "../fake-runtime.ts"
import { context, dep } from "./context.ts"

const bashrc = resolve("/home/me", ".bashrc")

describe("configureEnvVars", () => {
	it("does nothing for an empty list", () => {
		const rt = fakeRuntime()
		expect(configureEnvVars(rt, "go", [])).toBe(true)
		expect(rt.files.size).toBe(0)
	})

	it("writes a managed block with values, PATH entries, and a reload hint", () => {
		const rt = fakeRuntime({ env: { SHELL: "/bin/bash" } })
		expect(configureEnvVars(rt, "go", [{ key: "GOPATH", value: "$HOME/go" }, { path: "$HOME/go/bin" }])).toBe(true)
		expect(rt.files.get(bashrc)).toContain('export GOPATH="$HOME/go"')
		expect(rt.logs).toContain("      GOPATH=$HOME/go")
		expect(rt.logs).toContain("      PATH=$HOME/go/bin:$PATH")
		expect(rt.files.get(bashrc)).toContain('export PATH="$HOME/go/bin:$PATH"')
		expect(rt.logs).toContain("\n   Run: source ~/.bashrc   (or restart terminal)")
	})

	it("defaults to .bashrc when SHELL is unset", () => {
		const rt = fakeRuntime()
		configureEnvVars(rt, "go", [{ key: "A", value: "1" }])
		expect(rt.files.has(bashrc)).toBe(true)
	})

	it("replaces an existing block in place", () => {
		const rt = fakeRuntime({ files: { [bashrc]: "keep\n" } })
		configureEnvVars(rt, "go", [{ key: "A", value: "1" }])
		configureEnvVars(rt, "go", [{ key: "A", value: "2" }])
		const rc = rt.files.get(bashrc) as string
		expect(rc.startsWith("keep\n")).toBe(true)
		expect(rc).toContain('export A="2"')
		expect(rc).not.toContain('export A="1"')
		expect(rt.logs).toContain("   Updating existing go environment config in .bashrc...")
	})

	it("detects the first existing path, else the fallback, else nothing", () => {
		const home = "/home/me"
		const found = fakeRuntime({ files: { "/home/me/b": "" }, home })
		configureEnvVars(found, "sdk", [{ detect: ["$HOME/a", "$HOME/b"], key: "SDK" }])
		expect(found.logs).toContain("   Detected SDK at: /home/me/b")
		expect(found.files.get(bashrc)).toContain('export SDK="$HOME/b"')

		const fallback = fakeRuntime({ home })
		configureEnvVars(fallback, "sdk", [{ detect: ["$HOME/a"], fallback: "$HOME/sdk", key: "SDK" }])
		expect(fallback.logs).toContain("   Using fallback for SDK: $HOME/sdk")

		const none = fakeRuntime({ home })
		expect(configureEnvVars(none, "sdk", [{ detect: ["$HOME/a"], key: "SDK" }])).toBe(false)
		expect(none.logs).toContain("   Could not detect SDK, no fallback specified")
		expect(none.logs).toContain("   No environment variables to configure")
	})

	it("writes a fish conf.d file for a fish SHELL", () => {
		const rt = fakeRuntime({ env: { SHELL: "/usr/bin/fish" } })
		configureEnvVars(rt, "go", [{ path: "$HOME/go/bin" }])
		const fish = resolve("/home/me", ".config", "fish", "conf.d", "workerstack-system.fish")
		expect(rt.files.get(fish)).toContain('set -gx PATH "$HOME/go/bin" $PATH')
		expect(rt.logs).toContain(`\n   Run: source ${fish}   (or restart fish)`)
	})

	it("reports a write failure", () => {
		const rt = fakeRuntime()
		rt.writeFile = () => {
			throw new Error("EACCES")
		}
		expect(configureEnvVars(rt, "go", [{ key: "A", value: "1" }])).toBe(false)
		expect(rt.errors).toContain("   Failed to configure env vars: EACCES")
	})

	it("reports a non-Error throw", () => {
		const rt = fakeRuntime()
		rt.writeFile = () => {
			throw "disk full"
		}
		configureEnvVars(rt, "go", [{ key: "A", value: "1" }])
		expect(rt.errors).toContain("   Failed to configure env vars: disk full")
	})

	it("writes both PowerShell profiles on Windows", () => {
		const rt = fakeRuntime({ home: "C:\\Users\\me", platform: "win32" })
		configureEnvVars(rt, "go", [{ key: "A", value: "1" }])
		const written = [...rt.files.entries()]
		expect(written.map(([path]) => path.includes("WindowsPowerShell"))).toEqual([false, true])
		for (const [, content] of written) expect(content).toContain('$env:A = "1"')
	})
})

describe("env", () => {
	it("says so when no dep has env vars", () => {
		const ctx = context({ go: dep() })
		expect(envCommand(ctx)).toBe(0)
		expect(ctx.rt.logs).toContain("\nNo dependencies with environment variables configured.")
	})

	it("configures every dep with env vars", () => {
		const ctx = context({
			a: dep({ env: [{ key: "A", value: "1" }] }),
			b: dep({ env: [{ key: "B", value: "2" }] }),
			c: dep(),
		})
		expect(envCommand(ctx)).toBe(0)
		const rc = ctx.rt.files.get(bashrc) as string
		expect(rc).toContain('export A="1"')
		expect(rc).toContain('export B="2"')
		expect(ctx.rt.logs).toContain(`Environment variables configured in ${bashrc}`)
	})

	it("exits 1 when a dep's env cannot be resolved", () => {
		const ctx = context({ a: dep({ env: [{ detect: ["/nope"], key: "A" }] }) })
		expect(envCommand(ctx)).toBe(1)
	})
})
