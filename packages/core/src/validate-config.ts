/**
 * Shape check for a loaded config. Collects every problem with its path, then throws one `ConfigError`,
 * so a typo fails before anything installs instead of mid-run.
 */

import type { BuiltinOverride } from "./builtins/types.ts";
import { ConfigError } from "./config-error.ts";
import { type EnvVar, type OsCommands, OS_TARGETS, type SystemConfig, type SystemDepConfig } from "./config.ts";

/**
 * A plain object read before its fields are checked: every field any config object may carry, each holding
 * anything. Every non-array object is one, so the check reads fields without a cast.
 */
type Loose = {
  readonly appendToPath?: unknown;
  readonly check?: unknown;
  readonly command?: unknown;
  readonly deps?: unknown;
  readonly dependsOn?: unknown;
  readonly description?: unknown;
  readonly detect?: unknown;
  readonly env?: unknown;
  readonly fallback?: unknown;
  readonly key?: unknown;
  readonly os?: unknown;
  readonly packageJsonPath?: unknown;
  readonly path?: unknown;
  readonly pattern?: unknown;
  readonly required?: unknown;
  readonly value?: unknown;
  readonly version?: unknown;
};

/** Where a check is: the path its problems name (`deps.go.os`, or empty at the top), and the list they go to. */
type Site = { readonly path: string; readonly problems: string[] };

const TOP_KEYS = ["deps", "packageJsonPath"];
const DEP_KEYS = ["check", "dependsOn", "description", "env", "os", "required", "version"];
const CHECK_KEYS = ["command", "pattern"];
const OS_KEYS = ["all", ...OS_TARGETS] as const;
const ENV_FORMS = "must be { path }, { key, value } or { key, detect, fallback? }";

/** A key of `os`: a target, or `all`. */
type OsKey = (typeof OS_KEYS)[number];

function isLoose(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isText(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOsKey(key: string): key is OsKey {
  return OS_KEYS.some((known) => known === key);
}

function compiles(source: string): boolean {
  try {
    return new RegExp(source) instanceof RegExp;
  } catch {
    return false;
  }
}

/** The site of `key` under `site`. */
function within(site: Site, key: string): Site {
  return { path: site.path === "" ? key : `${site.path}.${key}`, problems: site.problems };
}

function report(site: Site, message: string): void {
  site.problems.push(`${site.path}: ${message}`);
}

/** `report`, for a check that fails on it. */
function reported(site: Site, message: string): false {
  report(site, message);

  return false;
}

/** Whether the problems list still holds `before` problems: the check since then found none. */
function isClean(site: Site, before: number): boolean {
  return site.problems.length === before;
}

function unknownKeys(value: Loose, allowed: readonly string[], site: Site): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) report(within(site, key), `unknown key (allowed: ${allowed.join(", ")})`);
}

/** Whether `os` is a map of commands; an override's (`isOverride`) merges over the catalog's, so it may be empty. */
function isOsCommands(os: unknown, site: Site, { isOverride }: { isOverride: boolean }): os is OsCommands {
  if (!isLoose(os)) return reported(site, "must be an object of commands");
  const before = site.problems.length;

  if (!isOverride && Object.keys(os).length === 0) report(site, "must name at least one OS key or all");

  for (const [key, command] of Object.entries(os)) {
    const at = within(site, key);

    if (!isOsKey(key)) {
      report(at, `unknown OS (allowed: ${OS_KEYS.join(", ")})`);
    } else if (key === "all") {
      if (!isText(command)) report(at, "must be a command string");
    } else if (command !== false && !isText(command)) {
      report(at, "must be a command string or false");
    }
  }

  return isClean(site, before);
}

function isCheck(check: unknown, site: Site): check is NonNullable<SystemDepConfig["check"]> {
  if (!isLoose(check)) return reported(site, "must be an object like { command }");
  const before = site.problems.length;

  if (!isText(check.command)) report(within(site, "command"), "must be a non-empty string");

  if (check.pattern !== undefined && !isString(check.pattern))
    report(within(site, "pattern"), "must be a regex source string");
  else if (isString(check.pattern) && !compiles(check.pattern)) report(within(site, "pattern"), "invalid regex");

  unknownKeys(check, CHECK_KEYS, site);

  return isClean(site, before);
}

/** The fields of a `{ key, value }` or `{ key, detect, fallback? }` entry. */
function hasEnvValue(entry: Loose, site: Site): boolean {
  const before = site.problems.length;

  if (!isText(entry.key)) report(within(site, "key"), "must be a non-empty string");

  if ("value" in entry) {
    if (!isString(entry.value)) report(within(site, "value"), "must be a string");
  } else {
    if (!isTextList(entry.detect)) report(within(site, "detect"), "must be a list of paths");

    if (entry.fallback !== undefined && !isString(entry.fallback)) report(within(site, "fallback"), "must be a string");
  }

  return isClean(site, before);
}

function isEnvVar(entry: unknown, site: Site): entry is EnvVar {
  if (!isLoose(entry)) return reported(site, ENV_FORMS);

  if ("appendToPath" in entry)
    return reported(site, `appendToPath is gone; use { path: ${JSON.stringify(entry.value)} } (it goes first on PATH)`);

  if ("path" in entry) return isText(entry.path) || reported(within(site, "path"), "must be a non-empty string");

  if (!("value" in entry) && !("detect" in entry)) return reported(site, ENV_FORMS);

  return hasEnvValue(entry, site);
}

function isEnvList(env: unknown, site: Site): env is readonly EnvVar[] {
  if (!Array.isArray(env)) return reported(site, "must be a list");
  const before = site.problems.length;

  for (const [index, entry] of env.entries())
    isEnvVar(entry, { path: `${site.path}[${index}]`, problems: site.problems });

  return isClean(site, before);
}

/** The fields every custom dep needs, which a built-in's override (`isBuiltin`) may leave out but `version`. */
function hasDepFields(dep: Loose, site: Site, { isBuiltin }: { isBuiltin: boolean }): boolean {
  const before = site.problems.length;

  if ((!isBuiltin || dep.description !== undefined) && !isText(dep.description))
    report(within(site, "description"), "must be a non-empty string");

  if (!isText(dep.version)) report(within(site, "version"), "must be a non-empty string");

  if ((!isBuiltin || dep.required !== undefined) && !isBoolean(dep.required))
    report(within(site, "required"), "must be true or false");

  if (!isBuiltin || dep.os !== undefined) isOsCommands(dep.os, within(site, "os"), { isOverride: isBuiltin });

  return isClean(site, before);
}

/** The fields no dep needs: its check, what it depends on, and its env. */
function hasDepExtras(dep: Loose, site: Site): boolean {
  const before = site.problems.length;

  if (dep.check !== undefined) isCheck(dep.check, within(site, "check"));

  if (dep.dependsOn !== undefined && !isTextList(dep.dependsOn))
    report(within(site, "dependsOn"), "must be a list of dep names");

  if (dep.env !== undefined) isEnvList(dep.env, within(site, "env"));

  unknownKeys(dep, DEP_KEYS, site);

  return isClean(site, before);
}

/**
 * Whether one dep entry is valid, its problems under `site` (e.g. `deps.go`). A custom dep needs description,
 * version, required and a non-empty os. A built-in takes a version string, or an object whose only
 * required field is version; its os merges over the catalog's, so it may be empty.
 */
function isDep(
  dep: unknown,
  site: Site,
  { isBuiltin }: { isBuiltin: boolean },
): dep is BuiltinOverride | SystemDepConfig | string {
  if (isBuiltin && !isLoose(dep)) return isText(dep) || reported(site, "must be a version string or { version, ... }");

  if (!isLoose(dep)) return reported(site, "must be an object");
  const hasFields = hasDepFields(dep, site, { isBuiltin });

  return hasDepExtras(dep, site) && hasFields;
}

function isConfig(
  config: unknown,
  site: Site,
  { builtins }: { builtins: ReadonlySet<string> },
): config is SystemConfig {
  if (!isLoose(config)) return reported(within(site, "config"), "must be an object like { deps: { ... } }");
  const before = site.problems.length;
  const deps = within(site, "deps");

  if (isLoose(config.deps)) {
    for (const [name, dep] of Object.entries(config.deps))
      isDep(dep, within(deps, name), { isBuiltin: builtins.has(name) });
  } else {
    report(deps, "must be an object of dependencies");
  }

  if (config.packageJsonPath !== undefined && !isString(config.packageJsonPath))
    report(within(site, "packageJsonPath"), "must be a string");

  unknownKeys(config, TOP_KEYS, site);

  return isClean(site, before);
}

/**
 * `config` typed as a `SystemConfig`, or a `ConfigError` listing every problem.
 * Names in `builtins` take the built-in entry forms.
 */
export function validateConfig(config: unknown, builtins: ReadonlySet<string> = new Set()): SystemConfig {
  const site: Site = { path: "", problems: [] };

  if (isConfig(config, site, { builtins })) return config;

  throw new ConfigError(`Invalid system config:\n${site.problems.map((p) => `  - ${p}`).join("\n")}`);
}
