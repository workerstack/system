import type { EnvVar } from "../config.ts"
import {
	applyEnvBlock,
	expandPath,
	hasEnvBlock,
	reloadHint,
	renderEnvBlock,
	shellConfigPath,
	shellKind,
} from "../env.ts"
import type { Context } from "../probe.ts"
import type { Runtime } from "../runtime.ts"

type ResolvedEnv = { appendToPath?: boolean | undefined; key: string; value: string }

function resolveEnvValue(rt: Runtime, env: EnvVar): string | null {
	if (env.detect && env.detect.length > 0) {
		for (const path of env.detect) {
			const expanded = expandPath(path, rt.home, rt.env)
			if (rt.exists(expanded)) {
				rt.log(`   Detected ${env.key} at: ${expanded}`)
				return path
			}
		}
		if (env.fallback) {
			rt.log(`   Using fallback for ${env.key}: ${env.fallback}`)
			return env.fallback
		}
		rt.log(`   Could not detect ${env.key}, no fallback specified`)
		return null
	}
	return env.value || null
}

function configName(path: string): string {
	return path.split(/[\\/]/).pop() as string
}

/** Write `tool`'s managed block into the shell rc. True when a block was written. */
export function configureEnvVars(rt: Runtime, tool: string, envVars: readonly EnvVar[]): boolean {
	if (envVars.length === 0) return true

	const kind = shellKind(rt.platform)
	const path = shellConfigPath(rt.home, kind, rt.env.SHELL ?? "")
	const name = configName(path)
	rt.log(`\n   Configuring environment variables in ${name}...`)

	const resolved: ResolvedEnv[] = []
	for (const env of envVars) {
		const value = resolveEnvValue(rt, env)
		if (value) resolved.push({ appendToPath: env.appendToPath, key: env.key, value })
	}
	if (resolved.length === 0) {
		rt.log("   No environment variables to configure")
		return false
	}

	try {
		const existing = rt.exists(path) ? rt.readFile(path) : ""
		if (hasEnvBlock(existing, tool)) rt.log(`   Updating existing ${tool} environment config...`)
		rt.writeFile(path, applyEnvBlock(existing, renderEnvBlock(tool, resolved, kind), tool))
	} catch (error) {
		rt.error(`   Failed to configure env vars: ${error instanceof Error ? error.message : String(error)}`)
		return false
	}

	rt.log(`   Added to ${name}:`)
	for (const env of resolved) rt.log(env.appendToPath ? `      PATH+=:${env.value}` : `      ${env.key}=${env.value}`)
	rt.log(`\n   ${reloadHint(kind, name)}`)
	return true
}

export function envCommand(ctx: Context): number {
	const { rt } = ctx
	rt.log("Setting up environment variables")
	rt.log("=".repeat(50))

	const envDeps = Object.entries(ctx.deps).flatMap(([tool, config]) =>
		config.env && config.env.length > 0 ? [[tool, config.env] as const] : [],
	)
	if (envDeps.length === 0) {
		rt.log("\nNo dependencies with environment variables configured.")
		return 0
	}

	let failed = 0
	for (const [tool, env] of envDeps) {
		rt.log(`\n${tool}`)
		if (!configureEnvVars(rt, tool, env)) failed++
	}

	const kind = shellKind(rt.platform)
	const path = shellConfigPath(rt.home, kind, rt.env.SHELL ?? "")
	rt.log(`\n${"=".repeat(50)}`)
	rt.log(`Environment variables configured in ${path}`)
	rt.log(`\n${reloadHint(kind, configName(path))}`)
	return failed > 0 ? 1 : 0
}
