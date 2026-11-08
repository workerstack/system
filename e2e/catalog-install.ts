#!/usr/bin/env bun
/**
 * Really install every built-in in one catalog group on this machine, then require `check` to report the
 * pinned version (any parsed version for `latest`). CI runs one job per OS × group, so apt, dnf, pacman,
 * brew and choco all execute for real, not just --dry-run.
 *
 *   bun e2e/catalog-install.ts --group languages
 */
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
	BUILTIN_GROUPS,
	BUILTINS,
	detectOs,
	resolveDeps,
	resolveOsCommand,
	sortByDependencies,
	versionsMatch,
} from "@workerstack/system"
import catalog from "../examples/consumer/system.config.ts"

const bin = join(import.meta.dir, "../packages/core/src/bin.ts")
const configPath = join(import.meta.dir, "../examples/consumer/system.config.ts")
const perDepMs = Number(process.env.WORKERSTACK_SYSTEM_INSTALL_TIMEOUT_MS ?? 600_000)

const groupFlag = process.argv.indexOf("--group")
const group = groupFlag === -1 ? undefined : process.argv[groupFlag + 1]
if (group === undefined || !(group in BUILTIN_GROUPS)) {
	console.error(`--group must be one of: ${Object.keys(BUILTIN_GROUPS).join(", ")}`)
	process.exit(2)
}

const os = detectOs()
const deps = resolveDeps(catalog.deps, { arch: process.arch, os }, BUILTINS)
/* the group plus everything it depends on (cf needs bun from runtimes), in install order */
const wanted = new Set(Object.keys(BUILTIN_GROUPS[group as keyof typeof BUILTIN_GROUPS]))
for (const name of wanted) for (const need of deps[name]?.dependsOn ?? []) wanted.add(need)
const names = sortByDependencies(Object.entries(deps))
	.map(([name]) => name)
	.filter((name) => wanted.has(name))

type Outcome = "failed" | "ok" | "timeout" | "unavailable"

async function cli(args: string[]): Promise<{ code: number; out: string; timedOut: boolean }> {
	const proc = Bun.spawn(["bun", bin, ...args, "--config", configPath], {
		env: {
			...process.env,
			DEBIAN_FRONTEND: "noninteractive",
			HOMEBREW_NO_AUTO_UPDATE: "1",
			HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: "1",
		},
		stderr: "pipe",
		stdout: "pipe",
	})
	let timedOut = false
	const killer = setTimeout(() => {
		timedOut = true
		proc.kill()
	}, perDepMs)
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	])
	clearTimeout(killer)
	const out = `${stdout}\n${stderr}`.trim()
	if (out) console.log(out)
	return { code, out, timedOut }
}

/* the Fedora and Arch jobs run in containers, which have no systemd to run a daemon */
const inContainer = existsSync("/.dockerenv") || existsSync("/run/.containerenv")
const NEEDS_SERVICE_MANAGER = new Set(["docker"])

async function tryOne(name: string): Promise<{ detail: string; outcome: Outcome }> {
	const config = deps[name]!
	if (resolveOsCommand(name, config, os) === null) return { detail: `not available on ${os}`, outcome: "unavailable" }
	if (inContainer && NEEDS_SERVICE_MANAGER.has(name)) {
		return { detail: "needs systemd, which a container lacks", outcome: "unavailable" }
	}

	const install = await cli(["install", name, "--upgrade"])
	if (install.timedOut) return { detail: "install timed out", outcome: "timeout" }
	if (install.code !== 0) return { detail: `install exit ${install.code}`, outcome: "failed" }

	/* check reads a new interactive shell's PATH, so it sees what install wrote into the rc file */
	const check = await cli(["check", name])
	const found = check.out.match(new RegExp(`^${name}@(\\S+) \\(expected `, "m"))?.[1]
	if (!found) return { detail: "installed, but check finds nothing", outcome: "failed" }
	if (!versionsMatch(found, config.version)) {
		return { detail: `check finds ${found}, expected ${config.version}`, outcome: "failed" }
	}
	return { detail: `${found}`, outcome: "ok" }
}

console.log(`catalog-install — group ${group}: ${names.join(", ")}`)
console.log(`home=${homedir()} os=${os} arch=${process.arch}`)
console.log("=".repeat(60))

const rows: Array<{ detail: string; name: string; outcome: Outcome }> = []
for (const name of names) {
	console.log(`\n>> ${name}`)
	const result = await tryOne(name)
	rows.push({ name, ...result })
	console.log(`   ${result.outcome}: ${result.detail}`)
}

const count = (outcome: Outcome) => rows.filter((row) => row.outcome === outcome).length
const table = [
	"| dep | result | detail |",
	"| --- | --- | --- |",
	...rows.map((row) => `| ${row.name} | ${row.outcome} | ${row.detail.replaceAll("|", "/")} |`),
	"",
	`ok ${count("ok")} · unavailable ${count("unavailable")} · failed ${count("failed")} · timeout ${count("timeout")}`,
].join("\n")
console.log(`\n${"=".repeat(60)}\n${table}`)

if (process.env.GITHUB_STEP_SUMMARY) {
	await Bun.write(process.env.GITHUB_STEP_SUMMARY, `# Catalog install: ${group} on ${os}\n\n${table}\n`)
}

/* a required dep that fails, or a group with nothing installed, fails the job */
const failedRequired = rows.filter(
	(row) => (row.outcome === "failed" || row.outcome === "timeout") && deps[row.name]!.required,
)
if (failedRequired.length > 0 || count("ok") === 0) process.exit(1)
