/**
 * CLI argument parsing. Pure: returns the parsed invocation or an error message, never exits.
 */

import { type OsTarget, OS_TARGETS } from "./config.ts"

export interface Invocation {
	command: string | undefined
	config: string | undefined
	dryRun: boolean
	here: boolean
	os: OsTarget | undefined
	target: string | undefined
	upgrade: boolean
}

export type ParseResult = { ok: true; value: Invocation } | { error: string; ok: false }

const VALUE_FLAGS = { "--config": "a path", "--os": "a target" } as const
const BOOL_FLAGS = ["--dry-run", "--here", "--upgrade"] as const

function isOsTarget(value: string): value is OsTarget {
	return (OS_TARGETS as readonly string[]).includes(value)
}

export function parseArgs(argv: readonly string[]): ParseResult {
	const values: Partial<Record<keyof typeof VALUE_FLAGS, string>> = {}
	const bools = new Set<string>()
	const positional: string[] = []

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string
		if (arg in VALUE_FLAGS) {
			const flag = arg as keyof typeof VALUE_FLAGS
			const value = argv[i + 1]
			if (value === undefined || value.startsWith("--")) {
				return { error: `${flag} requires ${VALUE_FLAGS[flag]} argument`, ok: false }
			}
			values[flag] = value
			i++
		} else if ((BOOL_FLAGS as readonly string[]).includes(arg)) {
			bools.add(arg)
		} else if (arg.startsWith("--")) {
			return { error: `Unknown flag: ${arg}`, ok: false }
		} else {
			positional.push(arg)
		}
	}

	const os = values["--os"]
	if (os !== undefined && !isOsTarget(os)) {
		return { error: `Unknown OS target: ${os}. Expected one of: ${OS_TARGETS.join(", ")}`, ok: false }
	}

	return {
		ok: true,
		value: {
			command: positional[0],
			config: values["--config"],
			dryRun: bools.has("--dry-run"),
			here: bools.has("--here"),
			os,
			target: positional[1],
			upgrade: bools.has("--upgrade"),
		},
	}
}
