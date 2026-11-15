/**
 * What is installed: the check command's binary, where it resolves, and the version it reports.
 */

import { type OsTarget, resolveCheckCommand, type SystemDepConfig } from "./config.ts";
import type { Runtime } from "./runtime.ts";
import { parseVersion } from "./version.ts";

const WHITESPACE = /\s+/;

/** Everything a command needs: the effects, the resolved deps, and where the config lives. */
export type Context = {
  configDir: string;
  deps: Record<string, SystemDepConfig>;
  os: OsTarget;
  packageJsonPath: string;
  rt: Runtime;
};

/** A dep key and its config, as `Object.entries(ctx.deps)` yields them. */
export type NamedDep = readonly [name: string, config: SystemDepConfig];

/** First token of the check command: the binary whose presence and path are probed. */
function checkBinary(name: string, config: SystemDepConfig): string {
  return resolveCheckCommand(name, config).split(WHITESPACE)[0] /* split always yields a first element */ as string;
}

export type Installed = {
  /** where the check binary resolves */
  path: string;
  /** parsed from the check output (`check.pattern`, else the first `N.N…`) */
  version: string;
};

/** Where `probeInstalled` looks. */
export type ProbeOptions = {
  /** the PATH to resolve the binary and run the check on; default this process's */
  searchPath?: string;
};

/** The installed binary and the version it reports, or null when it is missing or reports none. */
export function probeInstalled(
  rt: Runtime,
  [name, config]: NamedDep,
  { searchPath }: ProbeOptions = {},
): Installed | null {
  const path = rt.which(checkBinary(name, config), searchPath);

  if (path === null) return null;
  const command = resolveCheckCommand(name, config);
  const result = rt.capture(command, searchPath);

  if (result.timedOut) rt.warn(`   ${name}: check timed out: ${command}`);
  const version = result.ok ? parseVersion(result.stdout, config.check?.pattern) : null;

  return version === null ? null : { path, version };
}
