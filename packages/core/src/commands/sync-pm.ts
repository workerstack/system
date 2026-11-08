import { resolve } from "node:path"
import type { Context } from "../probe.ts"

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
		const pkg = JSON.parse(content) as { name?: unknown; packageManager?: unknown }
		const current = typeof pkg.packageManager === "string" ? pkg.packageManager : undefined
		if (current === expected) {
			rt.log(`\npackageManager already correct: ${expected}`)
			return 0
		}
		rt.log(`\nSyncing packageManager: ${current ?? "(missing)"} -> ${expected}`)
		const name = String(pkg.name)
		const updated = current
			? content.replace(`"packageManager": "${current}"`, `"packageManager": "${expected}"`)
			: content.replace(`"name": "${name}"`, `"name": "${name}",\n\t"packageManager": "${expected}"`)
		rt.writeFile(path, updated)
		rt.log(`Updated packageManager to ${expected}`)
		return 0
	} catch (error) {
		rt.error(`Failed to sync packageManager: ${error instanceof Error ? error.message : String(error)}`)
		return 1
	}
}
