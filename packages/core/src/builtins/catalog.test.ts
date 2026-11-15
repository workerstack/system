import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import type { EnvVar, OsTarget } from "../config.ts";
import { OS_TARGETS } from "../config.ts";
import { needsPowerShell } from "../exec.ts";
import { validateConfig } from "../validate-config.ts";
import { ARCHES, builtin, BUILTINS, sample, withPrerequisites } from "./catalog-fixtures.ts";
import { BUILTIN_GROUPS, BUILTIN_NAMES } from "./catalog.ts";
import { resolveDeps } from "./resolve.ts";
import type { BuiltinDep } from "./types.ts";

const PS_PRELUDE = "$ErrorActionPreference = 'Stop'";
const UNRESOLVED = /\{\{|undefined|\[object/;
const UNIX_ONLY = /\\|\$env:/;

/** The path or value an env entry writes; empty for a detect entry. */
function envValue(entry: EnvVar): string {
  if ("path" in entry) return entry.path;

  return "value" in entry ? entry.value : "";
}

/** Every path or value `dep`'s env writes, by OS. */
function envWrites(name: string, dep: BuiltinDep): { name: string; os: OsTarget; value: string }[] {
  return OS_TARGETS.flatMap((os) => (dep.env?.(os) ?? []).map((entry) => ({ name, os, value: envValue(entry) })));
}

/** Every command `name` gives across OSes and CPUs, by OS; `false` where it is unavailable. */
function commandsOf(name: string): { os: string; value: string | false | undefined }[] {
  return OS_TARGETS.flatMap((os) =>
    ARCHES.map((arch) => {
      const raw = builtin(name).os({ arch, version: sample(name) });

      return { os, value: raw[os] ?? raw.all };
    }),
  );
}

it("built-in catalog has no name in two groups", () => {
  const total = Object.values(BUILTIN_GROUPS).reduce((sum, group) => sum + Object.keys(group).length, 0);
  expect(BUILTIN_NAMES.size).toBe(total);
  expect(BUILTIN_NAMES.size).toBe(43);
});

it("built-in catalog names only catalog deps as prerequisites, and every prerequisite is installable somewhere", () => {
  for (const [name, dep] of Object.entries(BUILTINS)) {
    for (const need of dep.dependsOn ?? []) expect(BUILTIN_NAMES.has(need), `${name} → ${need}`).toBe(true);
    expect(dep.description.length, name).toBeGreaterThan(10);
  }
});

for (const name of Object.keys(BUILTINS)) {
  it(`${name}: resolves on every OS and CPU to a clean command or explicit unavailability`, () => {
    const commands = commandsOf(name);

    const available = commands.flatMap(({ os, value }) =>
      value === false || value === undefined ? [] : [{ os, value }],
    );

    const windows = available.filter(({ os }) => os === "windows").map(({ value }) => value);
    const unix = available.filter(({ os }) => os !== "windows").map(({ value }) => value);

    expect(
      commands.filter(({ value }) => value === undefined),
      `${name} must give a command or false`,
    ).toStrictEqual([]);
    expect(available.length, `${name} installs nowhere`).toBeGreaterThan(0);
    expect(available.filter(({ value }) => UNRESOLVED.test(value))).toStrictEqual([]);
    expect(windows.filter((value) => needsPowerShell(value) && !value.includes(PS_PRELUDE))).toStrictEqual([]);
    expect(
      unix.filter((value) => value.includes("$env:")),
      name,
    ).toStrictEqual([]);

    for (const os of OS_TARGETS) {
      const config = resolveDeps(withPrerequisites(name), { arch: "x64", os }, BUILTINS);
      // the resolved config, with auto-added bootstraps, is itself a valid custom config
      expect(() => validateConfig({ deps: config })).not.toThrow();
    }
  });
}

it("built-in catalog is documented: the catalog reference has a table row for every built-in", () => {
  const readme = readFileSync(new URL("../../references/catalog.md", import.meta.url), "utf-8");

  // oxfmt pads table cells, so match the first cell loosely
  for (const name of BUILTIN_NAMES) expect(readme, name).toMatch(new RegExp(`^\\| \`${name}\` +\\|`, "m"));
});

it("built-in catalog writes unix paths on unix and Windows paths on Windows", () => {
  const written = Object.entries(BUILTINS).flatMap(([name, dep]) => envWrites(name, dep));

  expect(written.filter(({ os, value }) => os === "windows" && value.includes("/"))).toStrictEqual([]);
  expect(written.filter(({ os, value }) => os !== "windows" && UNIX_ONLY.test(value))).toStrictEqual([]);
});
