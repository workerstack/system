import { resolve } from "node:path"
import type { Context } from "../probe.ts"

/**
 * `json` with `packageManager` set to `value`, keeping the file's indent, EOL, trailing newline and key
 * order. A new field goes right after `name`, or first when there is no `name`.
 */
export function withPackageManager(json: string, path: string, value: string): string {
	const pkg: unknown = JSON.parse(json)
	if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) throw new Error(`${path} is not a JSON object`)

	const entries = Object.entries(pkg).filter(([key]) => key !== "packageManager")
	const existing = Object.keys(pkg).indexOf("packageManager")
	const at = existing !== -1 ? existing : entries.findIndex(([key]) => key === "name") + 1
	entries.splice(at, 0, ["packageManager", value])

	const indent = json.match(/^[ \t]+(?=")/m)?.[0] ?? ""
	const eol = json.includes("\r\n") ? "\r\n" : "\n"
	const body = JSON.stringify(Object.fromEntries(entries), null, indent).replace(/\n/g, eol)
	return json.endsWith("\n") ? body + eol : body
}

/** Set package.json `packageManager` to `bun@<deps.bun.version>`. bun is the only package manager. */
export function syncPmCommand(ctx: Context): number {
	const { rt } = ctx
	const bun = ctx.deps.bun
	if (!bun) {
		rt.log("\nSkipping packageManager sync — bun not in config")
		return 0
	}
	if (bun.version === "latest") {
		rt.log('\nSkipping packageManager sync — bun version is "latest"')
		return 0
	}

	const path = resolve(ctx.configDir, ctx.packageJsonPath)
	const expected = `bun@${bun.version}`
	try {
		const content = rt.readFile(path)
		const current = (JSON.parse(content) as { packageManager?: unknown }).packageManager
		if (current === expected) {
			rt.log(`\npackageManager already correct: ${expected}`)
			return 0
		}
		rt.log(`\nSyncing packageManager: ${typeof current === "string" ? current : "(missing)"} -> ${expected}`)
		rt.writeFile(path, withPackageManager(content, path, expected))
		rt.log(`Updated packageManager to ${expected}`)
		return 0
	} catch (error) {
		rt.error(`Failed to sync packageManager: ${error instanceof Error ? error.message : String(error)}`)
		return 1
	}
}
