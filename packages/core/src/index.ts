/**
 * @workerstack/system — cross-platform system dependency manager
 */

export type { SystemConfig, EnvVar, OsCommands, OsTarget, SystemDepConfig } from "./config.ts"
export {
	defineConfig,
	interpolate,
	OS_TARGETS,
	resolveCheckCommand,
	resolveOsCommand,
	versionsMatch,
} from "./config.ts"
export { sortByDependencies } from "./graph.ts"
export {
	commandExists,
	detectLinuxDistro,
	detectOs,
	detectOsFromPlatform,
	parseOsTarget,
	whichBinary,
} from "./platform.ts"
