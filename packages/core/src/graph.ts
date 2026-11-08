import type { SystemDepConfig } from "./config.ts"
import { ConfigError } from "./errors.ts"

/**
 * Install order: every `dependsOn` target before its dependent, otherwise config order.
 * Throws `ConfigError` on a `dependsOn` name missing from the config, or on a cycle.
 */
export function sortByDependencies<T extends Pick<SystemDepConfig, "dependsOn">>(
	entries: Array<[string, T]>,
): Array<[string, T]> {
	const byName = new Map(entries)
	const sorted: Array<[string, T]> = []
	const done = new Set<string>()
	const path: string[] = []

	function visit(name: string, config: T): void {
		if (done.has(name)) return
		const start = path.indexOf(name)
		if (start !== -1) throw new ConfigError(`dependency cycle: ${[...path.slice(start), name].join(" → ")}`)
		path.push(name)
		for (const dep of config.dependsOn ?? []) {
			const target = byName.get(dep)
			if (target === undefined) throw new ConfigError(`deps.${name}.dependsOn: "${dep}" is not a dep in this config`)
			visit(dep, target)
		}
		path.pop()
		done.add(name)
		sorted.push([name, config])
	}

	for (const [name, config] of entries) visit(name, config)
	return sorted
}
