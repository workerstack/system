import { describe, expect, it } from "vitest"
import { parseVersion, versionsMatch } from "../../src/version.ts"

describe("versionsMatch", () => {
	it("rejects substring look-alikes", () => {
		expect(versionsMatch("1.0.0", "11.0.0")).toBe(false)
		expect(versionsMatch("1.2", "1.27.1")).toBe(false)
		expect(versionsMatch("21.0.12", "1.0.1")).toBe(false)
		expect(versionsMatch("1.27.10", "1.27.1")).toBe(false)
	})

	it("matches when the expected segments prefix the installed ones", () => {
		expect(versionsMatch("22.20.0", "22")).toBe(true)
		expect(versionsMatch("22.20.0", "22.20")).toBe(true)
		expect(versionsMatch("1.27.1", "1.27.1")).toBe(true)
		expect(versionsMatch("21.0.12.1", "21.0.12")).toBe(true)
		expect(versionsMatch("22.20", "22.20.0")).toBe(false)
	})

	it("ignores a leading v on either side", () => {
		expect(versionsMatch("v1.4.4", "1.4.4")).toBe(true)
		expect(versionsMatch("1.4.4", "v1.4")).toBe(true)
	})

	it("matches a prerelease or build tag only exactly", () => {
		expect(versionsMatch("1.0.0-beta.12", "1.0.0-beta.12")).toBe(true)
		expect(versionsMatch("1.0.0-beta.1", "1.0.0-beta.12")).toBe(false)
		expect(versionsMatch("1.0.0", "1.0.0-beta.12")).toBe(false)
		expect(versionsMatch("1.0.0-beta.12", "1.0.0")).toBe(false)
		expect(versionsMatch("21.0.12+7", "21.0.12+7")).toBe(true)
	})

	it("matches anything for latest", () => {
		expect(versionsMatch("0.0.1", "latest")).toBe(true)
	})
})

describe("parseVersion", () => {
	it("takes the first dotted version in the output", () => {
		expect(parseVersion("go version go1.27.1 linux/amd64")).toBe("1.27.1")
		expect(parseVersion("cf 1.0.0-beta.12")).toBe("1.0.0-beta.12")
		expect(parseVersion("Docker version 29.8.2, build abc")).toBe("29.8.2")
		expect(parseVersion("no version here")).toBeNull()
	})

	it("uses a check pattern's first capture when given", () => {
		const java = 'openjdk version "21.0.12" 2026-07-15 LTS\nOpenJDK Runtime (build 21.0.12+7-LTS)'
		expect(parseVersion(java, "build (\\d+\\.\\d+\\.\\d+\\+\\d+)")).toBe("21.0.12+7")
		expect(parseVersion("ffmpeg version n7.1.1", "version n?([\\d.]+)")).toBe("7.1.1")
		expect(parseVersion("nothing", "version (\\d+)")).toBeNull()
	})
})
