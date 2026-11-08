import { resolveOsCommand, type SystemDepConfig } from "../config.ts"
import { versionsMatch } from "../version.ts"
import { sortByDependencies } from "../graph.ts"
import { type Context, probeInstalled } from "../probe.ts"
import { expandPath } from "../env.ts"
import { configureEnvVars } from "./env.ts"

export interface InstallOptions {
	dryRun: boolean
	upgrade: boolean
}

type Outcome = "failed" | "installed" | "planned" | "skipped" | "unavailable"

/**
 * Write the dep's env block whenever it is present, installed now or before: an already-installed tool
 * (a CI image's rust, a setup action's bun) is otherwise missing from a new shell's PATH.
 */
function writeEnv(ctx: Context, name: string, config: SystemDepConfig): void {
	if (config.env && config.env.length > 0) configureEnvVars(ctx.rt, name, config.env)
}

function installOne(ctx: Context, name: string, config: SystemDepConfig, opts: InstallOptions): Outcome {
	const { rt } = ctx
	const command = resolveOsCommand(name, config, ctx.os)
	if (!command) {
		rt.log(`${name}@${config.version} — not available on ${ctx.os}`)
		return "unavailable"
	}

	rt.log(`${name}@${config.version}`)
	rt.log(`   ${config.description}`)

	if (opts.dryRun) {
		rt.log(`   dry-run: ${command}`)
		return "planned"
	}

	const installed = probeInstalled(rt, name, config)
	if (installed && versionsMatch(installed.version, config.version)) {
		rt.log(`   Already installed (${installed.version}), skipping`)
		writeEnv(ctx, name, config)
		return "skipped"
	}
	if (installed && !opts.upgrade) {
		rt.log(`   Already installed (${installed.version}), skipping (expected ${config.version}) ${installed.path}`)
		rt.log(`   run: system install ${name} --upgrade`)
		writeEnv(ctx, name, config)
		return "skipped"
	}

	if (!rt.run(command)) {
		rt.error(`\nCommand failed: ${command}`)
		rt.error("   Installation failed")
		return "failed"
	}

	rt.log("   Installed successfully")
	writeEnv(ctx, name, config)
	/* Installer often does not win PATH — brew/nvm/fnm still first. */
	const after = probeInstalled(rt, name, config)
	if (after && !versionsMatch(after.version, config.version)) {
		rt.log(`   PATH still has ${after.version} (expected ${config.version}) ${after.path}`)
		rt.log("   Unpin/unlink that binary or put the pinned one first on PATH")
	}
	return "installed"
}

/**
 * Put every dep's `{ path }` dirs first on this run's PATH, so a dep finds a prerequisite installed earlier
 * in the same run (ruff needs uv) and the skip check sees the pinned binary before a system one.
 */
function prependDepPaths(ctx: Context): void {
	for (const config of Object.values(ctx.deps)) {
		for (const entry of config.env ?? []) {
			if ("path" in entry) ctx.rt.prependPath(expandPath(entry.path, ctx.rt.home, ctx.rt.env))
		}
	}
}

export function installCommand(ctx: Context, target: string | undefined, opts: InstallOptions): number {
	const { rt } = ctx
	prependDepPaths(ctx)

	if (target !== undefined) {
		const config = ctx.deps[target]
		if (!config) {
			rt.error(`Unknown dependency: ${target}`)
			rt.log(`Available: ${Object.keys(ctx.deps).join(", ")}`)
			return 1
		}
		rt.log(`Detected OS: ${ctx.os}`)
		return installOne(ctx, target, config, opts) === "failed" ? 1 : 0
	}

	rt.log("@workerstack/system — install")
	rt.log(`Detected OS: ${ctx.os}`)
	rt.log("=".repeat(50))

	const entries = sortByDependencies(Object.entries(ctx.deps))
	rt.log(`\nFound ${entries.length} dependencies to install:\n`)
	for (const [name, config] of entries) {
		const badge = config.required ? "[required]" : "[optional]"
		const available = resolveOsCommand(name, config, ctx.os) !== null
		rt.log(`  ${badge} ${name}@${config.version}${available ? "" : ` (not available on ${ctx.os})`}`)
	}

	rt.log(`\n${"=".repeat(50)}`)
	rt.log(opts.dryRun ? "Dry-run — commands only, nothing installed" : "Installing dependencies...")
	rt.log("=".repeat(50))

	const counts: Record<Outcome, number> = { failed: 0, installed: 0, planned: 0, skipped: 0, unavailable: 0 }
	for (const [name, config] of entries) {
		const outcome = installOne(ctx, name, config, opts)
		/* an optional dep that fails does not fail the run */
		counts[outcome === "failed" && !config.required ? "skipped" : outcome]++
	}

	rt.log(`\n${"=".repeat(50)}`)
	rt.log("Installation Summary")
	rt.log("=".repeat(50))
	if (opts.dryRun) rt.log(`Planned: ${counts.planned}`)
	else rt.log(`Installed: ${counts.installed}`)
	rt.log(`Skipped: ${counts.skipped}`)
	rt.log(`Unavailable on ${ctx.os}: ${counts.unavailable}`)
	rt.log(`Failed: ${counts.failed}`)

	if (counts.failed > 0) {
		rt.log("\nSome required dependencies failed to install")
		return 1
	}
	rt.log(opts.dryRun ? "\nDry-run complete" : "\nAll required system dependencies are ready!")
	return 0
}
