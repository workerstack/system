import type { BuiltinDep } from "../builtins/types.ts"
import { OS_TARGETS } from "../config.ts"
import type { Runtime } from "../runtime.ts"

/** The OS targets a built-in has a command for. */
function availability(builtin: BuiltinDep): string {
	const os = builtin.os({ arch: "x64", version: builtin.versions === "latest" ? "latest" : "0.0.0" })
	return OS_TARGETS.filter((target) => {
		const command = os[target] ?? os.all
		return typeof command === "string"
	}).join(" ")
}

/** Print the built-in catalog: name, version policy, where it installs, what it is. */
export function listCommand(rt: Runtime, catalog: Readonly<Record<string, BuiltinDep>>): number {
	const rows = Object.entries(catalog).map(([name, builtin]) => [
		name,
		builtin.versions,
		availability(builtin),
		builtin.description,
	])
	const widths = [0, 1, 2].map((col) => Math.max(...rows.map((row) => (row[col] as string).length)))
	rt.log('Built-in deps (give a version: go: "1.27.2")')
	rt.log("")
	for (const row of rows) {
		rt.log(`  ${row.map((cell, col) => (col < 3 ? cell.padEnd(widths[col] as number) : cell)).join("  ")}`)
	}
	return 0
}
