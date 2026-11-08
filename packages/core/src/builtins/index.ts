/**
 * The built-in catalog: every tool workerstack supports by name. A config gives `name: "<version>"`;
 * the catalog supplies the install commands, check, env and prerequisites.
 */

import { AGENTS } from "./agents.ts"
import { BOOTSTRAP } from "./bootstrap.ts"
import { BROWSERS } from "./browsers.ts"
import { CLOUDFLARE } from "./cloudflare.ts"
import { DATABASE } from "./database.ts"
import { LANGUAGES } from "./languages.ts"
import { RELEASE } from "./release.ts"
import { RUNTIMES } from "./runtimes.ts"
import type { BuiltinDep } from "./types.ts"

/** The catalog by group, for docs and per-group CI installs. */
export const BUILTIN_GROUPS = {
	bootstrap: BOOTSTRAP,
	runtimes: RUNTIMES,
	languages: LANGUAGES,
	release: RELEASE,
	cloudflare: CLOUDFLARE,
	database: DATABASE,
	browsers: BROWSERS,
	agents: AGENTS,
} as const

export const BUILTINS = {
	...BOOTSTRAP,
	...RUNTIMES,
	...LANGUAGES,
	...RELEASE,
	...CLOUDFLARE,
	...DATABASE,
	...BROWSERS,
	...AGENTS,
} satisfies Record<string, BuiltinDep>

export type BuiltinName = keyof typeof BUILTINS

export const BUILTIN_NAMES: ReadonlySet<string> = new Set(Object.keys(BUILTINS))
