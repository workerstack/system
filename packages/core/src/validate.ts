/**
 * Shape check for a loaded config. Collects every problem with its path, then throws one `ConfigError`,
 * so a typo fails before anything installs instead of mid-run.
 */

import { OS_TARGETS, type SystemConfig } from "./config.ts"
import { ConfigError } from "./errors.ts"

type Record_ = Record<string, unknown>

const TOP_KEYS = ["deps", "packageJsonPath"]
const DEP_KEYS = ["check", "dependsOn", "description", "env", "os", "required", "version"]
const CHECK_KEYS = ["command", "pattern"]
const OS_KEYS = ["all", ...OS_TARGETS]
const ENV_SHAPE = "must be { path }, { key, value } or { key, detect, fallback? }"

function isObject(value: unknown): value is Record_ {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
	return typeof value === "string" && value.length > 0
}

function isTextList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function compiles(source: string): boolean {
	try {
		return new RegExp(source) instanceof RegExp
	} catch {
		return false
	}
}

function unknownKeys(value: Record_, allowed: readonly string[], at: string, problems: string[]): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key)) problems.push(`${at}${key}: unknown key (allowed: ${allowed.join(", ")})`)
	}
}

function checkOs(os: unknown, at: string, problems: string[]): void {
	if (!isObject(os)) {
		problems.push(`${at}: must be an object of commands`)
		return
	}
	if (Object.keys(os).length === 0) problems.push(`${at}: must name at least one OS key or all`)
	for (const [key, command] of Object.entries(os)) {
		if (key === "all") {
			if (!isText(command)) problems.push(`${at}.all: must be a command string`)
		} else if (!OS_KEYS.includes(key)) {
			problems.push(`${at}.${key}: unknown OS (allowed: ${OS_KEYS.join(", ")})`)
		} else if (command !== false && !isText(command)) {
			problems.push(`${at}.${key}: must be a command string or false`)
		}
	}
}

function checkCheck(check: unknown, at: string, problems: string[]): void {
	if (!isObject(check)) {
		problems.push(`${at}: must be an object like { command }`)
		return
	}
	if (!isText(check.command)) problems.push(`${at}.command: must be a non-empty string`)
	if (check.pattern !== undefined) {
		if (typeof check.pattern !== "string") problems.push(`${at}.pattern: must be a regex source string`)
		else if (!compiles(check.pattern)) problems.push(`${at}.pattern: invalid regex`)
	}
	unknownKeys(check, CHECK_KEYS, `${at}.`, problems)
}

function checkEnvEntry(entry: unknown, at: string, problems: string[]): void {
	if (!isObject(entry)) {
		problems.push(`${at}: ${ENV_SHAPE}`)
		return
	}
	if ("appendToPath" in entry) {
		problems.push(`${at}: appendToPath is gone; use { path: ${JSON.stringify(entry.value)} } (it goes first on PATH)`)
		return
	}
	if ("path" in entry) {
		if (!isText(entry.path)) problems.push(`${at}.path: must be a non-empty string`)
		return
	}
	if (!("value" in entry) && !("detect" in entry)) {
		problems.push(`${at}: ${ENV_SHAPE}`)
		return
	}
	if (!isText(entry.key)) problems.push(`${at}.key: must be a non-empty string`)
	if ("value" in entry) {
		if (typeof entry.value !== "string") problems.push(`${at}.value: must be a string`)
		return
	}
	if (!isTextList(entry.detect)) problems.push(`${at}.detect: must be a list of paths`)
	if (entry.fallback !== undefined && typeof entry.fallback !== "string") {
		problems.push(`${at}.fallback: must be a string`)
	}
}

/** Problems with one custom dep, each prefixed with `at` (e.g. `deps.go`). */
export function checkDep(dep: unknown, at: string, problems: string[]): void {
	if (!isObject(dep)) {
		problems.push(`${at}: must be an object`)
		return
	}
	if (!isText(dep.description)) problems.push(`${at}.description: must be a non-empty string`)
	if (!isText(dep.version)) problems.push(`${at}.version: must be a non-empty string`)
	if (typeof dep.required !== "boolean") problems.push(`${at}.required: must be true or false`)
	checkOs(dep.os, `${at}.os`, problems)
	if (dep.check !== undefined) checkCheck(dep.check, `${at}.check`, problems)
	if (dep.dependsOn !== undefined && !isTextList(dep.dependsOn)) {
		problems.push(`${at}.dependsOn: must be a list of dep names`)
	}
	if (dep.env !== undefined) {
		if (!Array.isArray(dep.env)) problems.push(`${at}.env: must be a list`)
		else dep.env.forEach((entry, i) => checkEnvEntry(entry, `${at}.env[${i}]`, problems))
	}
	unknownKeys(dep, DEP_KEYS, `${at}.`, problems)
}

/** `config` typed as a `SystemConfig`, or a `ConfigError` listing every problem. */
export function validateConfig(config: unknown): SystemConfig {
	const problems: string[] = []
	if (!isObject(config)) {
		problems.push("config: must be an object like { deps: { ... } }")
	} else {
		if (!isObject(config.deps)) problems.push("deps: must be an object of dependencies")
		else for (const [name, dep] of Object.entries(config.deps)) checkDep(dep, `deps.${name}`, problems)
		if (config.packageJsonPath !== undefined && typeof config.packageJsonPath !== "string") {
			problems.push("packageJsonPath: must be a string")
		}
		unknownKeys(config, TOP_KEYS, "", problems)
	}
	if (problems.length > 0)
		throw new ConfigError(`Invalid system config:\n${problems.map((p) => `  - ${p}`).join("\n")}`)
	return config as SystemConfig
}
