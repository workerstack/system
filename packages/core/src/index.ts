/**
 * @workerstack/system — cross-platform system dependency manager
 */

export type { SystemConfig, EnvVar, OsCommands, OsTarget, SystemDepConfig } from "./config.ts"
export { defineConfig, interpolate, OS_TARGETS, resolveCheckCommand, resolveOsCommand } from "./config.ts"
export { sortByDependencies } from "./graph.ts"
export { parseVersion, versionsMatch } from "./version.ts"
export {
	commandExists,
	detectLinuxDistro,
	detectOs,
	detectOsFromPlatform,
	parseOsTarget,
	whichBinary,
} from "./platform.ts"
