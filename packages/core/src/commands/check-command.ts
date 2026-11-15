import { resolve } from "node:path";

import { resolveOsCommand } from "../config.ts";
import { LATEST } from "../latest.constants.ts";
import { readPackageManager } from "../package-json.ts";
import { TTY_PATH_FALLBACK_WARN } from "../path.ts";
import { type Context, type NamedDep, probeInstalled } from "../probe.ts";
import type { Runtime } from "../runtime.ts";
import { versionsMatch } from "../version.ts";
import { badge, header, RULE, targetDep } from "./report.ts";

/** How `check` finds binaries. */
export type CheckOptions = {
  /** search this process's PATH instead of a new interactive TTY's */
  here: boolean;
};

/** The dep counts in the check summary. */
type Tally = { mismatch: number; missing: number; ok: number };

/** `--here`: this process PATH. Otherwise a new interactive TTY's PATH, falling back with one warning. */
function searchPath(rt: Runtime, { here }: CheckOptions): string {
  if (here) return rt.env.PATH ?? rt.env.Path ?? "";
  const snapshot = rt.ttyPath();

  if (snapshot.source === "process") rt.warn(`${TTY_PATH_FALLBACK_WARN} (${snapshot.reason})`);

  return snapshot.path;
}

/** Mismatch count from the packageManager field (0 or 1). bun is the only package manager. */
function checkPackageManager(ctx: Context): number {
  const bun = ctx.deps.bun;

  if (bun === undefined) return 0;
  const { rt } = ctx;
  const current = readPackageManager(rt.readFile(resolve(ctx.configDir, ctx.packageJsonPath)));

  if (bun.version === LATEST) {
    if (current?.startsWith("bun@") === true) {
      rt.log(`\n  v packageManager: ${current} (latest mode)`);

      return 0;
    }

    rt.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected bun@*)`);

    return 1;
  }

  const expected = `bun@${bun.version}`;

  if (current === expected) {
    rt.log(`\n  v packageManager: ${current}`);

    return 0;
  }

  rt.log(`\n  ~ packageManager: ${current ?? "(missing)"} (expected ${expected})`);

  return 1;
}

/** Report the one dep `check <target>` names. */
function checkOne(ctx: Context, target: string, path: string): number {
  const { rt } = ctx;
  const config = targetDep(ctx, target);

  if (config === undefined) return 1;

  if (resolveOsCommand(target, config, ctx.os) === null) {
    rt.log(`${target} — not available on ${ctx.os}`);

    return 0;
  }

  const installed = probeInstalled(rt, [target, config], { searchPath: path });

  if (installed === null) {
    rt.log(`${target} — not installed (expected ${config.version})`);

    return 1;
  }

  rt.log(`${target}@${installed.version} (expected ${config.version}) ${installed.path}`);

  return 0;
}

/** Print one dep's summary line and name the count it adds to. */
function checkDep(ctx: Context, dep: NamedDep, path: string): keyof Tally | null {
  const { rt } = ctx;
  const [name, config] = dep;
  const tag = badge(config);

  if (resolveOsCommand(name, config, ctx.os) === null) {
    rt.log(`  - ${tag} ${name} — not available on ${ctx.os}`);

    return null;
  }

  const installed = probeInstalled(rt, dep, { searchPath: path });

  if (installed === null) {
    rt.log(`  x ${tag} ${name} — not installed (expected ${config.version})`);

    return config.required ? "missing" : "mismatch";
  }

  if (versionsMatch(installed.version, config.version)) {
    rt.log(`  v ${tag} ${name}@${installed.version}`);

    return "ok";
  }

  rt.log(`  ~ ${tag} ${name}@${installed.version} (expected ${config.version}) ${installed.path}`);

  return "mismatch";
}

/** Report every dep and the packageManager field, then what to run next. */
function checkAll(ctx: Context, path: string): number {
  const { rt } = ctx;
  header(ctx, "check");

  const tally: Tally = { mismatch: 0, missing: 0, ok: 0 };

  for (const dep of Object.entries(ctx.deps)) {
    const count = checkDep(ctx, dep, path);

    if (count !== null) tally[count]++;
  }

  tally.mismatch += checkPackageManager(ctx);

  rt.log(`\n${RULE}`);
  rt.log(`OK: ${tally.ok}  Mismatch: ${tally.mismatch}  Missing: ${tally.missing}`);

  if (tally.missing > 0) {
    rt.log("\nRequired dependencies missing — run: system install");

    return 1;
  }

  rt.log(
    tally.mismatch > 0 ? "\nVersion mismatches found — run: system install --upgrade" : "\nAll system dependencies OK",
  );

  return 0;
}

/** `system check [target]`: what is installed against the pins. 1 when a required dep is missing. */
export function checkCommand(ctx: Context, target: string | undefined, options: CheckOptions): number {
  const path = searchPath(ctx.rt, options);

  return target === undefined ? checkAll(ctx, path) : checkOne(ctx, target, path);
}
