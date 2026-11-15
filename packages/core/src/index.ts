/**
 * @workerstack/system — every OS dependency a workerstack repo needs, from one config.
 */

export { BUILTIN_GROUPS, BUILTIN_NAMES, BUILTINS, type BuiltinName } from "./builtins/catalog.ts";

export { type RawEntry, resolveDeps } from "./builtins/resolve.ts";

export type { Arch, BuiltinDep, BuiltinOverride, RecipeContext } from "./builtins/types.ts";

export type {
  DefinedConfig,
  DepEntry,
  EnvVar,
  OsCommands,
  OsTarget,
  SystemConfig,
  SystemDepConfig,
  TemplateVars,
} from "./config.ts";

export {
  defineConfig,
  interpolate,
  OS_TARGETS,
  renderTemplate,
  resolveCheckCommand,
  resolveOsCommand,
} from "./config.ts";

export { ConfigError } from "./config-error.ts";

export { sortByDependencies } from "./sort-by-dependencies.ts";

export {
  commandExists,
  detectLinuxDistro,
  detectOs,
  detectOsFromPlatform,
  parseOsTarget,
  whichBinary,
} from "./platform.ts";

export { validateConfig } from "./validate-config.ts";

export { parseVersion, versionsMatch } from "./version.ts";
