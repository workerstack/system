import { resolve } from "node:path";

import { LATEST } from "../latest.constants.ts";
import { NAME_KEY, PACKAGE_MANAGER_KEY } from "../package-json.constants.ts";
import { parsePackageJson, readPackageManager } from "../package-json.ts";
import type { Context } from "../probe.ts";

/** The indent of the first indented key, which JSON.stringify repeats per level. */
const INDENT = /^[ \t]+(?=")/m;

/**
 * `json` with `packageManager` set to `value`, keeping the file's indent, EOL, trailing newline and key
 * order. A new field goes right after `name`, or first when there is no `name`.
 */
function withPackageManager(json: string, path: string, value: string): string {
  const pkg = parsePackageJson(json);

  if (pkg === null) throw new Error(`${path} is not a JSON object`);

  const entries = [...pkg].filter(([key]) => key !== PACKAGE_MANAGER_KEY);

  const at = pkg.has(PACKAGE_MANAGER_KEY)
    ? [...pkg.keys()].indexOf(PACKAGE_MANAGER_KEY)
    : entries.findIndex(([key]) => key === NAME_KEY) + 1;

  entries.splice(at, 0, [PACKAGE_MANAGER_KEY, value]);

  const indent = json.match(INDENT)?.[0] ?? "";
  const eol = json.includes("\r\n") ? "\r\n" : "\n";
  const body = JSON.stringify(Object.fromEntries(entries), null, indent).replaceAll("\n", eol);

  return json.endsWith("\n") ? body + eol : body;
}

/** Set package.json `packageManager` to `bun@<deps.bun.version>`. bun is the only package manager. */
export function syncPmCommand(ctx: Context): number {
  const { rt } = ctx;
  const bun = ctx.deps.bun;

  if (bun === undefined) {
    rt.log("\nSkipping packageManager sync — bun not in config");

    return 0;
  }

  if (bun.version === LATEST) {
    rt.log('\nSkipping packageManager sync — bun version is "latest"');

    return 0;
  }

  const path = resolve(ctx.configDir, ctx.packageJsonPath);
  const expected = `bun@${bun.version}`;

  try {
    const content = rt.readFile(path);
    const current = readPackageManager(content);

    if (current === expected) {
      rt.log(`\npackageManager already correct: ${expected}`);

      return 0;
    }

    rt.log(`\nSyncing packageManager: ${current ?? "(missing)"} -> ${expected}`);
    rt.writeFile(path, withPackageManager(content, path, expected));
    rt.log(`Updated packageManager to ${expected}`);

    return 0;
  } catch (error) {
    rt.error(`Failed to sync packageManager: ${error instanceof Error ? error.message : String(error)}`);

    return 1;
  }
}
