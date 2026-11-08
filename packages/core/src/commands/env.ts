import type { EnvVar } from "../config.ts"
import {
	applyEnvBlock,
	type EnvLine,
	expandPath,
	hasEnvBlock,
	reloadHint,
	renderEnvBlock,
	shellConfigPath,
	shellKind,
} from "../env.ts"
import type { Context } from "../probe.ts"
import type { Runtime } from "../runtime.ts"

/** The line `env` renders to, or null when a `detect` entry finds nothing and has no fallback. */
function resolveEnvLine(rt: Runtime, env: EnvVar): EnvLine | null {
	if ("path" in env) return { path: env.path }
	if ("value" in env) return { key: env.key, value: env.value }
	for (const path of env.detect) {
		const expanded = expandPath(path, rt.home, rt.env)
		if (rt.exists(expanded)) {
			rt.log(`   Detected ${env.key} at: ${expanded}`)
			return { key: env.key, value: path }
		}
	}
	if (env.fallback !== undefined) {
		rt.log(`   Using fallback for ${env.key}: ${env.fallback}`)
		return { key: env.key, value: env.fallback }
	}
	rt.log(`   Could not detect ${env.key}, no fallback specified`)
	return null
}

function rcFile(rt: Runtime): { kind: ReturnType<typeof shellKind>; path: string } {
	const shell = rt.env.SHELL ?? ""
	const kind = shellKind(rt.platform, shell)
	return { kind, path: shellConfigPath(rt.home, kind, shell, rt.env) }
}

function fileName(path: string): string {
	return path.split(/[\\/]/).pop() as string
}

/** Write `tool`'s managed block into the shell rc. True when a block was written. */
export function configureEnvVars(rt: Runtime, tool: string, envVars: readonly EnvVar[]): boolean {
	if (envVars.length === 0) return true

	const { kind, path } = rcFile(rt)
	rt.log(`\n   Configuring environment variables in ${fileName(path)}...`)

	const lines = envVars.map((env) => resolveEnvLine(rt, env)).filter((line) => line !== null)
	if (lines.length === 0) {
		rt.log("   No environment variables to configure")
		return false
	}

	try {
		const existing = rt.exists(path) ? rt.readFile(path) : ""
		if (hasEnvBlock(existing, tool)) rt.log(`   Updating existing ${tool} environment config...`)
		rt.writeFile(path, applyEnvBlock(existing, renderEnvBlock(tool, lines, kind), tool))
	} catch (error) {
		rt.error(`   Failed to configure env vars: ${error instanceof Error ? error.message : String(error)}`)
		return false
	}

	rt.log(`   Added to ${fileName(path)}:`)
	for (const line of lines) rt.log("path" in line ? `      PATH=${line.path}:$PATH` : `      ${line.key}=${line.value}`)
	rt.log(`\n   ${reloadHint(kind, path)}`)
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

	const { kind, path } = rcFile(rt)
	rt.log(`\n${"=".repeat(50)}`)
	rt.log(`Environment variables configured in ${path}`)
	rt.log(`\n${reloadHint(kind, path)}`)
	return failed > 0 ? 1 : 0
}
