import { describe, expect, it } from "vitest"
import { installCommand } from "../../../src/commands/install.ts"
import { context, dep } from "./context.ts"

const off = { dryRun: false, upgrade: false }

describe("install <name>", () => {
	it("fails on an unknown dep and lists the available ones", () => {
		const ctx = context({ go: dep(), jq: dep() })
		expect(installCommand(ctx, "nope", off)).toBe(1)
		expect(ctx.rt.errors).toContain("Unknown dependency: nope")
		expect(ctx.rt.logs).toContain("Available: go, jq")
	})

	it("runs the resolved command for a missing dep", () => {
		const ctx = context({ go: dep() })
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect(ctx.rt.ran).toEqual(["install go@1.2.3"])
		expect(ctx.rt.logs).toContain("   Installed successfully")
	})

	it("exits 1 when the command fails", () => {
		const ctx = context({ go: dep() }, { failing: ["install go@1.2.3"] })
		expect(installCommand(ctx, "go", off)).toBe(1)
		expect(ctx.rt.errors).toEqual(["\nCommand failed: install go@1.2.3", "   Installation failed"])
	})

	it("reports a dep with no command for this OS", () => {
		const ctx = context({ go: dep({ os: { macos: "brew install go" } }) })
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect(ctx.rt.logs).toContain("go@1.2.3 — not available on linux-apt")
		expect(ctx.rt.ran).toEqual([])
	})

	it("skips a dep already at the expected version", () => {
		const ctx = context({ go: dep() }, { capture: { "go --version": "go 1.2.3" }, which: { go: "/bin/go" } })
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect(ctx.rt.logs).toContain("   Already installed (1.2.3), skipping")
		expect(ctx.rt.ran).toEqual([])
	})

	it("skips a mismatched dep without --upgrade and says how to upgrade", () => {
		const ctx = context({ go: dep() }, { capture: { "go --version": "go 1.1.0" }, which: { go: "/bin/go" } })
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect(ctx.rt.logs).toContain("   Already installed (1.1.0), skipping (expected 1.2.3) /bin/go")
		expect(ctx.rt.logs).toContain("   run: system install go --upgrade")
	})

	it("reinstalls a mismatched dep with --upgrade and warns when PATH still wins", () => {
		const ctx = context({ go: dep() }, { capture: { "go --version": "go 1.1.0" }, which: { go: "/bin/go" } })
		expect(installCommand(ctx, "go", { dryRun: false, upgrade: true })).toBe(0)
		expect(ctx.rt.ran).toEqual(["install go@1.2.3"])
		expect(ctx.rt.logs).toContain("   PATH still has 1.1.0 (expected 1.2.3) /bin/go")
	})

	it("writes env vars for a dep it skips, so a new shell finds what is already installed", () => {
		const ctx = context(
			{ go: dep({ env: [{ path: "$HOME/go/bin" }] }) },
			{ capture: { "go --version": "go 1.2.3" }, env: { SHELL: "/bin/bash" }, which: { go: "/opt/go" } },
		)
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect(ctx.rt.ran).toEqual([])
		expect([...ctx.rt.files.values()].join("")).toContain('export PATH="$HOME/go/bin:$PATH"')

		const stale = context(
			{ go: dep({ env: [{ path: "$HOME/go/bin" }] }) },
			{ capture: { "go --version": "go 1.0.0" }, env: { SHELL: "/bin/bash" }, which: { go: "/opt/go" } },
		)
		installCommand(stale, "go", off)
		expect([...stale.rt.files.values()].join("")).toContain('export PATH="$HOME/go/bin:$PATH"')
	})

	it("configures env vars after a successful install", () => {
		const ctx = context({ go: dep({ env: [{ key: "GOPATH", value: "$HOME/go" }] }) }, { env: { SHELL: "/bin/bash" } })
		expect(installCommand(ctx, "go", off)).toBe(0)
		expect([...ctx.rt.files.values()].join("")).toContain('export GOPATH="$HOME/go"')
	})
})

describe("install PATH", () => {
	it("puts every dep's PATH dirs first on this run's PATH, so later installs find earlier ones", () => {
		const ctx = context(
			{
				ruff: dep({ dependsOn: ["uv"], env: [{ path: "$HOME/.local/bin" }] }),
				uv: dep({ env: [{ key: "UV", value: "1" }, { path: "/opt/uv/bin" }] }),
			},
			{ env: { PATH: "/usr/bin" }, home: "/home/me" },
		)
		installCommand(ctx, undefined, off)
		expect(ctx.rt.prepended).toEqual(["/home/me/.local/bin", "/opt/uv/bin"])
	})

	it("does the same for a single install", () => {
		const ctx = context({ go: dep({ env: [{ path: "$HOME/go/bin" }] }) }, { home: "/home/me" })
		installCommand(ctx, "go", off)
		expect(ctx.rt.prepended).toEqual(["/home/me/go/bin"])
	})
})

describe("install (all)", () => {
	it("installs in dependency order and summarizes", () => {
		const ctx = context({
			app: dep({ dependsOn: ["lib"] }),
			lib: dep(),
			mac: dep({ os: { macos: "x" }, required: false }),
		})
		expect(installCommand(ctx, undefined, off)).toBe(0)
		expect(ctx.rt.ran).toEqual(["install lib@1.2.3", "install app@1.2.3"])
		expect(ctx.rt.logs).toContain("  [optional] mac@1.2.3 (not available on linux-apt)")
		expect(ctx.rt.logs).toContain("Installed: 2")
		expect(ctx.rt.logs).toContain("Unavailable on linux-apt: 1")
		expect(ctx.rt.logs).toContain("\nAll required system dependencies are ready!")
	})

	it("fails only when a required dep fails", () => {
		const ctx = context(
			{ opt: dep({ required: false }), req: dep() },
			{ failing: ["install opt@1.2.3", "install req@1.2.3"] },
		)
		expect(installCommand(ctx, undefined, off)).toBe(1)
		expect(ctx.rt.logs).toContain("Failed: 1")
		expect(ctx.rt.logs).toContain("Skipped: 1")
		expect(ctx.rt.logs).toContain("\nSome required dependencies failed to install")
	})

	it("prints commands without running them on --dry-run", () => {
		const ctx = context({ go: dep() })
		expect(installCommand(ctx, undefined, { dryRun: true, upgrade: false })).toBe(0)
		expect(ctx.rt.ran).toEqual([])
		expect(ctx.rt.logs).toContain("   dry-run: install go@1.2.3")
		expect(ctx.rt.logs).toContain("Planned: 1")
		expect(ctx.rt.logs).toContain("\nDry-run complete")
	})
})
