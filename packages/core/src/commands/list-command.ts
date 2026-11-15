import type { BuiltinDep } from "../builtins/types.ts";
import { OS_TARGETS } from "../config.ts";
import type { Runtime } from "../runtime.ts";

/** One catalog line, by column. */
type Row = { description: string; name: string; os: string; versions: string };

/** The OS targets a built-in has a command for. */
function availability(builtin: BuiltinDep): string {
  const os = builtin.os({ arch: "x64", version: builtin.versions === "latest" ? "latest" : "0.0.0" });

  return OS_TARGETS.filter((target) => {
    const command = os[target] ?? os.all;

    return command !== undefined && command !== false;
  }).join(" ");
}

/** A column's cell for a row, padded to the column's widest cell. */
function padded(rows: readonly Row[], column: Exclude<keyof Row, "description">): (row: Row) => string {
  const width = Math.max(...rows.map((row) => row[column].length));

  return (row) => row[column].padEnd(width);
}

/** Print the built-in catalog: name, version policy, where it installs, what it is. */
export function listCommand(rt: Runtime, catalog: Readonly<Record<string, BuiltinDep>>): number {
  const rows = Object.entries(catalog).map(([name, builtin]): Row => ({
    description: builtin.description,
    name,
    os: availability(builtin),
    versions: builtin.versions,
  }));

  const name = padded(rows, "name");
  const versions = padded(rows, "versions");
  const os = padded(rows, "os");
  rt.log('Built-in deps (give a version: go: "1.27.2")');
  rt.log("");

  for (const row of rows) rt.log(`  ${[name(row), versions(row), os(row), row.description].join("  ")}`);

  return 0;
}
