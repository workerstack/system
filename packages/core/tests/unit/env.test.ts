import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { applyEnvBlock, expandPath, reloadHint, renderEnvBlock, shellConfigPaths, shellKind } from "../../src/env.ts"

describe("shellKind", () => {
	it("uses PowerShell on Windows whatever SHELL says", () => {
		expect(shellKind("win32")).toBe("powershell")
		expect(shellKind("win32", "/usr/bin/fish")).toBe("powershell")
	})

	it("uses fish for a fish SHELL and posix otherwise", () => {
		expect(shellKind("linux", "/usr/bin/fish")).toBe("fish")
		expect(shellKind("darwin", "/opt/homebrew/bin/fish")).toBe("fish")
		expect(shellKind("linux", "/bin/zsh")).toBe("posix")
		expect(shellKind("linux")).toBe("posix")
	})
})

describe("shellConfigPaths", () => {
	const home = join("home", "me")

	it("writes the PowerShell 7 and Windows PowerShell 5.1 profiles on Windows", () => {
		expect(shellConfigPaths(home, "powershell")).toEqual([
			resolve(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
			resolve(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
		])
	})

	it("writes .zshrc for zsh and .bashrc otherwise", () => {
		expect(shellConfigPaths(home, "posix", "/bin/zsh")).toEqual([resolve(home, ".zshrc")])
		expect(shellConfigPaths(home, "posix", "/bin/bash")).toEqual([resolve(home, ".bashrc")])
	})

	it("writes a fish conf.d file, under XDG_CONFIG_HOME when set", () => {
		expect(shellConfigPaths(home, "fish")).toEqual([
			resolve(home, ".config", "fish", "conf.d", "workerstack-system.fish"),
		])
		expect(shellConfigPaths(home, "fish", "/usr/bin/fish", { XDG_CONFIG_HOME: "/xdg" })).toEqual([
			resolve("/xdg", "fish", "conf.d", "workerstack-system.fish"),
		])
	})
})

describe("expandPath", () => {
	it("expands HOME and USERPROFILE to the given home in every syntax", () => {
		expect(expandPath("$HOME/tool", "/home/me")).toBe("/home/me/tool")
		expect(expandPath("${HOME}/tool", "/home/me")).toBe("/home/me/tool")
		expect(expandPath("%USERPROFILE%\\tool", "C:\\Users\\me")).toBe("C:\\Users\\me\\tool")
		expect(expandPath("%home%\\tool", "C:\\Users\\me")).toBe("C:\\Users\\me\\tool")
	})

	it("expands PowerShell $env:NAME", () => {
		expect(
			expandPath("$env:LOCALAPPDATA\\bin", "C:\\Users\\me", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }),
		).toBe("C:\\Users\\me\\AppData\\Local\\bin")
		expect(expandPath("$env:NOPE\\bin", "C:\\h", {})).toBe("$env:NOPE\\bin")
	})

	it("expands any variable from env and leaves unknown ones literal", () => {
		const env = { ANDROID_HOME: "/sdk", GOPATH: "/go" }
		expect(expandPath("$ANDROID_HOME/platform-tools", "/h", env)).toBe("/sdk/platform-tools")
		expect(expandPath("%ANDROID_HOME%\\platform-tools", "/h", env)).toBe("/sdk\\platform-tools")
		expect(expandPath("${GOPATH}/bin:$GOPATH", "/h", env)).toBe("/go/bin:/go")
		expect(expandPath("$NOPE/x %NOPE% ${NOPE}", "/h", env)).toBe("$NOPE/x %NOPE% ${NOPE}")
	})
})

describe("renderEnvBlock", () => {
	const envs = [{ key: "TOOL_HOME", value: "$HOME/tool" }, { path: "$HOME/tool/bin" }]

	it("emits bash exports with PATH entries first", () => {
		const block = renderEnvBlock("tool", envs, "posix")
		expect(block).toContain("# tool environment (managed by @workerstack/system)")
		expect(block).toContain('export TOOL_HOME="$HOME/tool"')
		expect(block).toContain('export PATH="$HOME/tool/bin:$PATH"')
		expect(block).toContain("# end tool environment")
		expect(block).not.toContain("\r\n")
	})

	it("emits PowerShell assignments with PATH entries first", () => {
		const block = renderEnvBlock("tool", envs, "powershell")
		expect(block).toContain('$env:TOOL_HOME = "$HOME/tool"')
		expect(block).toContain('$env:Path = "$HOME/tool/bin;" + $env:Path')
		expect(block).toContain("\r\n")
	})

	it("emits fish set -gx with PATH entries first", () => {
		const block = renderEnvBlock("tool", envs, "fish")
		expect(block).toContain('set -gx TOOL_HOME "$HOME/tool"')
		expect(block).toContain('set -gx PATH "$HOME/tool/bin" $PATH')
		expect(block).not.toContain("\r\n")
	})
})

describe("applyEnvBlock", () => {
	it("replaces an existing managed block", () => {
		const first = renderEnvBlock("tool", [{ key: "A", value: "1" }], "posix")
		const second = renderEnvBlock("tool", [{ key: "A", value: "2" }], "posix")
		const next = applyEnvBlock(`keep${first}`, second, "tool")
		expect(next).toContain("keep")
		expect(next).toContain('export A="2"')
		expect(next).not.toContain('export A="1"')
	})

	it("is idempotent", () => {
		const block = renderEnvBlock("tool", [{ path: "/opt/tool" }], "posix")
		const once = applyEnvBlock("keep\n", block, "tool")
		expect(applyEnvBlock(once, block, "tool")).toBe(once)
	})

	it("replaces a legacy crossdeps block with one new block", () => {
		const legacy = '\n# tool environment (managed by crossdeps)\nexport A="old"\n# end tool environment\n'
		const block = renderEnvBlock("tool", [{ key: "A", value: "new" }], "posix")
		const next = applyEnvBlock(`before\n${legacy}after\n`, block, "tool")
		expect(next).toContain("before\n")
		expect(next).toContain("after\n")
		expect(next).not.toContain("managed by crossdeps")
		expect(next).not.toContain('export A="old"')
		expect(next.match(/managed by @workerstack\/system/g)).toHaveLength(1)
	})

	it("leaves other tools' blocks alone", () => {
		const other = renderEnvBlock("other", [{ key: "B", value: "1" }], "posix")
		const next = applyEnvBlock(other, renderEnvBlock("tool", [{ key: "A", value: "1" }], "posix"), "tool")
		expect(next).toContain('export B="1"')
	})
})

describe("reloadHint", () => {
	it("names the file to source for each shell", () => {
		expect(reloadHint("powershell", "C:\\p\\Microsoft.PowerShell_profile.ps1")).toBe(
			"Restart PowerShell or run: . $PROFILE",
		)
		expect(reloadHint("posix", "/home/me/.zshrc")).toBe("Run: source ~/.zshrc   (or restart terminal)")
		expect(reloadHint("fish", "/x/conf.d/workerstack-system.fish")).toBe(
			"Run: source /x/conf.d/workerstack-system.fish   (or restart fish)",
		)
	})
})
