import { resolveOsCommand, type SystemDepConfig, versionsMatch } from "../config.ts"
import { sortByDependencies } from "../graph.ts"
import { type Context, probeInstalled } from "../probe.ts"
import { configureEnvVars } from "./env.ts"

export interface InstallOptions {
	dryRun: boolean
	upgrade: boolean
}

type Outcome = "failed" | "installed" | "planned" | "skipped" | "unavailable"

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
		return "skipped"
	}
	if (installed && !opts.upgrade) {
		rt.log(`   Already installed (${installed.version}), skipping (expected ${config.version}) ${installed.path}`)
		rt.log(`   run: system install ${name} --upgrade`)
		return "skipped"
	}

	if (!rt.run(command)) {
		rt.error(`\nCommand failed: ${command}`)
		rt.error("   Installation failed")
		return "failed"
	}

	rt.log("   Installed successfully")
	if (config.env && config.env.length > 0) configureEnvVars(rt, name, config.env)
	/* Installer often does not win PATH — brew/nvm/fnm still first. */
	const after = probeInstalled(rt, name, config)
	if (after && !versionsMatch(after.version, config.version)) {
		rt.log(`   PATH still has ${after.version} (expected ${config.version}) ${after.path}`)
		rt.log("   Unpin/unlink that binary or put the pinned one first on PATH")
	}
	return "installed"
}

export function installCommand(ctx: Context, target: string | undefined, opts: InstallOptions): number {
	const { rt } = ctx

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
