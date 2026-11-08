import { describe, expect, it } from "vitest"
import { needsPowerShell, runShellCommand, shellInvocation } from "../../src/exec.ts"

describe("needsPowerShell", () => {
	it("detects PowerShell-only syntax", () => {
		expect(needsPowerShell("irm https://deno.land/install.ps1 | iex")).toBe(true)
		expect(needsPowerShell('Invoke-WebRequest -OutFile "$env:LOCALAPPDATA\\bin\\atlas.exe"')).toBe(true)
		expect(needsPowerShell("choco install nginx --version=1.29.4 || choco install nginx")).toBe(false)
		expect(needsPowerShell('bun -e "await Bun.write(process.env.MARKER, \\"ok\\")"')).toBe(false)
	})
})

describe("shellInvocation", () => {
	it("runs unix commands with bash -c so multi-line scripts work", () => {
		expect(shellInvocation("echo hi", "linux")).toEqual({ args: ["-c", "echo hi"], file: "/bin/bash", verbatim: false })
		expect(shellInvocation("echo hi", "darwin").file).toBe("/bin/bash")
	})

	it("uses PowerShell only for PowerShell syntax on Windows", () => {
		const irm = "irm https://deno.land/install.ps1 | iex"
		expect(shellInvocation(irm, "win32")).toEqual({
			args: ["-NoProfile", "-NonInteractive", "-Command", irm],
			file: "powershell.exe",
			verbatim: false,
		})
	})

	it("uses ComSpec, else cmd.exe, with verbatim /d /s /c for everything else on Windows", () => {
		const command = "choco install nginx || choco install nginx"
		expect(shellInvocation(command, "win32", { ComSpec: "C:\\Windows\\cmd.exe" })).toEqual({
			args: ["/d", "/s", "/c", `"${command}"`],
			file: "C:\\Windows\\cmd.exe",
			verbatim: true,
		})
		expect(shellInvocation(command, "win32", {}).file).toBe("cmd.exe")
	})
})

describe("runShellCommand", () => {
	it("returns on exit 0 and throws on failure", () => {
		const node = JSON.stringify(process.execPath)
		expect(() => runShellCommand(`${node} -e "process.exit(0)"`)).not.toThrow()
		expect(() => runShellCommand(`${node} -e "process.exit(2)"`)).toThrow(/^exit 2: /)
	})

	it("throws when the shell itself cannot start", () => {
		/* powershell.exe is absent on unix; on Windows the command fails instead. Either way it throws. */
		expect(() => runShellCommand("irm https://invalid.invalid | iex", "win32")).toThrow()
	})

	it.skipIf(process.platform === "win32")("reports the signal when the shell is killed", () => {
		expect(() => runShellCommand("kill -TERM $$", "linux")).toThrow(/^exit SIGTERM: /)
	})
})
