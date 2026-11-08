/**
 * @workerstack/system — every OS dependency a workerstack repo needs, from one config.
 */

export { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTINS, type BuiltinName } from "./builtins/index.ts"
export { type RawEntry, resolveDeps } from "./builtins/resolve.ts"
export type { Arch, BuiltinDep, BuiltinOverride, RecipeContext } from "./builtins/types.ts"
export type { DepEntry, EnvVar, OsCommands, OsTarget, SystemConfig, SystemDepConfig } from "./config.ts"
export { defineConfig, interpolate, OS_TARGETS, resolveCheckCommand, resolveOsCommand } from "./config.ts"
export { ConfigError } from "./errors.ts"
export { sortByDependencies } from "./graph.ts"
export {
	commandExists,
	detectLinuxDistro,
	detectOs,
	detectOsFromPlatform,
	parseOsTarget,
	whichBinary,
} from "./platform.ts"
export { validateConfig } from "./validate.ts"
export { parseVersion, versionsMatch } from "./version.ts"
