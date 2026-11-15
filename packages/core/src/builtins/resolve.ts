import { ConfigError } from "../config-error.ts";
import type { OsTarget, SystemDepConfig } from "../config.ts";
import { LATEST } from "../latest.constants.ts";
import type { Arch, BuiltinDep, BuiltinOverride } from "./types.ts";

/** A config entry before resolution: a built-in's version or override, or a full custom dep. */
export type RawEntry = BuiltinOverride | SystemDepConfig | string;

/** Every dep by name as a full config, in config order then added prerequisites. */
type Resolved = Map<string, SystemDepConfig>;

/** The machine a config resolves for. */
type Target = {
  /** The CPU, as `process.arch` names it; built-ins need `x64` or `arm64`. */
  arch: string;
  /** The OS family the install commands are picked for. */
  os: OsTarget;
};

type BuiltinCheck = SystemDepConfig["check"];

const ARCHES: readonly Arch[] = ["arm64", "x64"];
const PROBLEM_PREFIX = "\n  - ";

function isArch(arch: string): arch is Arch {
  return ARCHES.some((known) => known === arch);
}

function isVersion(entry: RawEntry): entry is string {
  return typeof entry === "string";
}

function isCheckPerOs(check: BuiltinDep["check"]): check is (os: OsTarget) => BuiltinCheck {
  return typeof check === "function";
}

function invalid(problems: readonly string[]): ConfigError {
  return new ConfigError(`Invalid system config:${problems.map((problem) => PROBLEM_PREFIX + problem).join("")}`);
}

function optionalFields(builtin: BuiltinDep, override: BuiltinOverride, os: OsTarget): Partial<SystemDepConfig> {
  const check = override.check ?? (isCheckPerOs(builtin.check) ? builtin.check(os) : builtin.check);
  const dependsOn = override.dependsOn ?? builtin.dependsOn;
  const env = override.env ?? builtin.env?.(os);

  return {
    ...(check === undefined ? {} : { check }),
    ...(dependsOn === undefined ? {} : { dependsOn: [...dependsOn] }),
    ...(env === undefined ? {} : { env: [...env] }),
  };
}

function expand(builtin: BuiltinDep, entry: BuiltinOverride | string, { arch, os }: Target): SystemDepConfig {
  if (!isArch(arch)) throw invalid([`built-in deps support x64 and arm64; this machine is ${arch}`]);
  const override: BuiltinOverride = isVersion(entry) ? { version: entry } : entry;

  return {
    description: override.description ?? builtin.description,
    os: { ...builtin.os({ arch, version: override.version }), ...override.os },
    required: override.required ?? true,
    version: override.version,
    ...optionalFields(builtin, override, os),
  };
}

function versionProblem(name: string, builtin: BuiltinDep, version: string): string | undefined {
  if (builtin.versions === LATEST && version !== LATEST) return `deps.${name}: ${name} only installs "latest"`;

  if (builtin.versions === "pinned" && version === LATEST)
    return `deps.${name}: ${name} needs a pinned version, not "latest"`;

  return undefined;
}

/** Adds each missing `latest`-only prerequisite, and a problem naming the fix for every other missing built-in. */
function addPrerequisites(
  resolved: Resolved,
  { catalog, problems, target }: { catalog: Readonly<Record<string, BuiltinDep>>; problems: string[]; target: Target },
): void {
  for (const [name, config] of resolved) {
    for (const need of config.dependsOn ?? []) {
      const builtin = resolved.has(need) ? undefined : catalog[need];

      if (builtin?.versions === LATEST) resolved.set(need, expand(builtin, LATEST, target));
      else if (builtin !== undefined) problems.push(`deps.${name}: needs ${need}; add ${need}: "<version>"`);
    }
  }
}

/**
 * Every entry as a full `SystemDepConfig`. Built-in names expand from `catalog` for `target`; other names
 * pass through. A `latest`-only built-in that a dep needs is added when missing. Throws `ConfigError`
 * listing every version-policy and prerequisite problem, or naming the CPU when a built-in has no recipe for it.
 */
export function resolveDeps(
  deps: Record<string, RawEntry>,
  target: Target,
  catalog: Readonly<Record<string, BuiltinDep>>,
): Record<string, SystemDepConfig> {
  const problems: string[] = [];
  const resolved: Resolved = new Map();

  for (const [name, entry] of Object.entries(deps)) {
    const builtin = catalog[name];

    if (builtin === undefined) {
      resolved.set(
        name,
        entry /* a name outside the catalog is a custom dep; validate checked its shape */ as SystemDepConfig,
      );
      continue;
    }

    const problem = versionProblem(name, builtin, isVersion(entry) ? entry : entry.version);

    if (problem !== undefined) problems.push(problem);
    resolved.set(name, expand(builtin, entry, target));
  }

  addPrerequisites(resolved, { catalog, problems, target });

  if (problems.length > 0) throw invalid(problems);

  return Object.fromEntries(resolved);
}
