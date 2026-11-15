import { BUILTINS, type OsTarget, resolveDeps, type SystemDepConfig } from "@workerstack/system";
import catalog from "@workerstack/system-example-consumer";

/** The example catalog with its built-in entries expanded into full deps for one OS and CPU. */
export function resolvedOn(os: OsTarget, arch = "x64"): Record<string, SystemDepConfig> {
  return resolveDeps(catalog.deps, { arch, os }, BUILTINS);
}

/** One resolved dep, failing the test with its name when the catalog lacks it. */
export function depOf(deps: Readonly<Record<string, SystemDepConfig>>, name: string): SystemDepConfig {
  const dep = deps[name];

  if (dep === undefined) throw new Error(`${name} is not in the resolved catalog`);

  return dep;
}
