import type { OsTarget, SystemDepConfig } from "../config.ts"
import { ConfigError } from "../errors.ts"
import type { Arch, BuiltinDep, BuiltinOverride } from "./types.ts"

/** A config entry before resolution: a built-in's version or override, or a full custom dep. */
export type RawEntry = BuiltinOverride | SystemDepConfig | string

function isArch(arch: string): arch is Arch {
	return arch === "x64" || arch === "arm64"
}

function expand(builtin: BuiltinDep, entry: BuiltinOverride | string, arch: Arch, os: OsTarget): SystemDepConfig {
	const o: BuiltinOverride = typeof entry === "string" ? { version: entry } : entry
	const config: SystemDepConfig = {
		description: o.description ?? builtin.description,
		os: { ...builtin.os({ arch, version: o.version }), ...o.os },
		required: o.required ?? true,
		version: o.version,
	}
	const check = o.check ?? builtin.check
	const dependsOn = o.dependsOn ?? builtin.dependsOn
	const env = o.env ?? builtin.env?.(os)
	if (check) config.check = check
	if (dependsOn) config.dependsOn = [...dependsOn]
	if (env) config.env = [...env]
	return config
}

/**
 * Every entry as a full `SystemDepConfig`. Built-in names expand from `catalog` for `arch` and `os`; other names
 * pass through. A `latest`-only built-in that a dep needs is added when missing. Throws `ConfigError`
 * listing every version-policy, prerequisite and CPU problem.
 */
export function resolveDeps(
	deps: Record<string, RawEntry>,
	{ arch, os }: { arch: string; os: OsTarget },
	catalog: Readonly<Record<string, BuiltinDep>>,
): Record<string, SystemDepConfig> {
	const problems: string[] = []
	const usesBuiltin = Object.keys(deps).some((name) => name in catalog)
	if (usesBuiltin && !isArch(arch)) {
		throw new ConfigError(`Invalid system config:\n  - built-in deps support x64 and arm64; this machine is ${arch}`)
	}

	const resolved: Record<string, SystemDepConfig> = {}
	for (const [name, entry] of Object.entries(deps)) {
		const builtin = catalog[name]
		if (builtin === undefined) {
			resolved[name] = entry as SystemDepConfig
			continue
		}
		const version = typeof entry === "string" ? entry : entry.version
		if (builtin.versions === "latest" && version !== "latest")
			problems.push(`deps.${name}: ${name} only installs "latest"`)
		if (builtin.versions === "pinned" && version === "latest") {
			problems.push(`deps.${name}: ${name} needs a pinned version, not "latest"`)
		}
		resolved[name] = expand(builtin, entry as BuiltinOverride | string, arch as Arch, os)
	}

	/* prerequisites: add latest-only built-ins, name the fix for the rest */
	const queue = Object.keys(resolved)
	for (let i = 0; i < queue.length; i++) {
		const name = queue[i] as string
		for (const need of resolved[name]?.dependsOn ?? []) {
			if (need in resolved) continue
			const builtin = catalog[need]
			if (builtin?.versions === "latest") {
				resolved[need] = expand(builtin, "latest", arch as Arch, os)
				queue.push(need)
			} else if (builtin) {
				problems.push(`deps.${name}: needs ${need}; add ${need}: "<version>"`)
			}
		}
	}

	if (problems.length > 0)
		throw new ConfigError(`Invalid system config:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
	return resolved
}
