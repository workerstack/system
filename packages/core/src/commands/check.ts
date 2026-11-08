import { resolve } from "node:path"
import { resolveOsCommand } from "../config.ts"
import { versionsMatch } from "../version.ts"
import { TTY_PATH_FALLBACK_WARN } from "../path.ts"
import { type Context, probeInstalled } from "../probe.ts"
import type { Runtime } from "../runtime.ts"

/** `--here`: this process PATH. Otherwise a new interactive TTY's PATH, falling back with one warning. */
function searchPath(rt: Runtime, here: boolean): string {
	if (here) return rt.env.PATH ?? rt.env.Path ?? ""
	const snapshot = rt.ttyPath()
	if (snapshot.source === "process") rt.warn(TTY_PATH_FALLBACK_WARN)
	return snapshot.path
}

/** Mismatch count from the packageManager field (0 or 1). bun is the only package manager. */
function checkPackageManager(ctx: Context): number {
	const bun = ctx.deps.bun
	if (!bun) return 0
	const { rt } = ctx
	const pkg = JSON.parse(rt.readFile(resolve(ctx.configDir, ctx.packageJsonPath))) as { packageManager?: unknown }
	const current = typeof pkg.packageManager === "string" ? pkg.packageManager : undefined

	if (bun.version === "latest") {
		if (current?.startsWith("bun@")) {
			rt.log(`\n  v packageManager: ${current} (latest mode)`)
			return 0
		}
		rt.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected bun@*)`)
		return 1
	}
	const expected = `bun@${bun.version}`
	if (current === expected) {
		rt.log(`\n  v packageManager: ${current}`)
		return 0
	}
	rt.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected ${expected})`)
	return 1
}

export function checkCommand(ctx: Context, target: string | undefined, here: boolean): number {
	const { rt } = ctx
	const path = searchPath(rt, here)

	if (target !== undefined) {
		const config = ctx.deps[target]
		if (!config) {
			rt.error(`Unknown dependency: ${target}`)
			rt.log(`Available: ${Object.keys(ctx.deps).join(", ")}`)
			return 1
		}
		if (resolveOsCommand(target, config, ctx.os) === null) {
			rt.log(`${target} — not available on ${ctx.os}`)
			return 0
		}
		const installed = probeInstalled(rt, target, config, path)
		if (!installed) {
			rt.log(`${target} — not installed (expected ${config.version})`)
			return 1
		}
		rt.log(`${target}@${installed.version} (expected ${config.version}) ${installed.path}`)
		return 0
	}

	rt.log("@workerstack/system — check")
	rt.log(`Detected OS: ${ctx.os}`)
	rt.log("=".repeat(50))

	let ok = 0
	let mismatch = 0
	let missing = 0
	for (const [name, config] of Object.entries(ctx.deps)) {
		const badge = config.required ? "[required]" : "[optional]"
		if (resolveOsCommand(name, config, ctx.os) === null) {
			rt.log(`  - ${badge} ${name} — not available on ${ctx.os}`)
			continue
		}
		const installed = probeInstalled(rt, name, config, path)
		if (!installed) {
			rt.log(`  x ${badge} ${name} — not installed (expected ${config.version})`)
			if (config.required) missing++
			else mismatch++
		} else if (versionsMatch(installed.version, config.version)) {
			rt.log(`  v ${badge} ${name}@${installed.version}`)
			ok++
		} else {
			rt.log(`  ~ ${badge} ${name}@${installed.version} (expected ${config.version}) ${installed.path}`)
			mismatch++
		}
	}
	mismatch += checkPackageManager(ctx)

	rt.log(`\n${"=".repeat(50)}`)
	rt.log(`OK: ${ok}  Mismatch: ${mismatch}  Missing: ${missing}`)
	if (missing > 0) {
		rt.log("\nRequired dependencies missing — run: system install")
		return 1
	}
	rt.log(mismatch > 0 ? "\nVersion mismatches found — run: system install --upgrade" : "\nAll system dependencies OK")
	return 0
}
