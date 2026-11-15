/**
 * Shared helpers for the catalog tests: the catalog widened to `BuiltinDep`, sample versions, and the command or
 * check a built-in resolves to.
 */

import type { OsTarget, SystemDepConfig } from "../config.ts";
import { BUILTINS as NARROW } from "./catalog.ts";
import { resolveDeps } from "./resolve.ts";
import type { Arch, BuiltinDep } from "./types.ts";

/** The catalog widened, so every entry reads as a `BuiltinDep`. */
export const BUILTINS: Readonly<Record<string, BuiltinDep>> = NARROW;

/** Every CPU the catalog ships recipes for. */
export const ARCHES: readonly Arch[] = ["x64", "arm64"];

const LATEST = "latest";
const SAMPLE_PIN = "1.2.3";

/** The built-in called `name`; throws when the catalog has none, so a renamed built-in fails loudly. */
export function builtin(name: string): BuiltinDep {
  const found = BUILTINS[name];

  if (found === undefined) throw new Error(`no built-in ${name}`);

  return found;
}

/** A version `name` accepts: `latest` for a latest-only built-in, else a pin. */
export function sample(name: string): string {
  return BUILTINS[name]?.versions === LATEST ? LATEST : SAMPLE_PIN;
}

/** `name` and every pinned prerequisite it needs, at sample versions. */
export function withPrerequisites(name: string): Record<string, string> {
  const deps = new Map<string, string>();

  function add(dep: string): void {
    deps.set(dep, sample(dep));

    for (const need of BUILTINS[dep]?.dependsOn ?? []) if (BUILTINS[need]?.versions !== LATEST) add(need);
  }

  add(name);

  return Object.fromEntries(deps);
}

/** The install command `name` gives on `os`, or undefined where it is unavailable. */
export function command(
  name: string,
  os: OsTarget,
  { arch = "x64", version = sample(name) }: { arch?: Arch; version?: string } = {},
): string | undefined {
  const cmds = builtin(name).os({ arch, version });
  const cmd = cmds[os] ?? cmds.all;

  return cmd === false ? undefined : cmd;
}

/** The check a built-in resolves to on `os`. */
export function check(name: string, os: OsTarget): SystemDepConfig["check"] {
  return resolveDeps(withPrerequisites(name), { arch: "x64", os }, BUILTINS)[name]?.check;
}
