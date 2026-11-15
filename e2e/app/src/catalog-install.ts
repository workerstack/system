import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILTIN_GROUPS,
  BUILTIN_NAMES,
  BUILTINS,
  detectOs,
  resolveDeps,
  sortByDependencies,
  type SystemDepConfig,
  validateConfig,
} from "@workerstack/system";

import { env } from "../env.ts";
import { type Outcome, print, type Result, type Run, tryOne } from "./catalog-run.ts";

type Group = keyof typeof BUILTIN_GROUPS;

type Row = Result & { name: string; required: boolean };

const CATALOG = "@workerstack/system-example-consumer";
const RULE = /* @__PURE__ */ "=".repeat(60);

function isGroup(value: string | undefined): value is Group {
  return value !== undefined && Object.hasOwn(BUILTIN_GROUPS, value);
}

function parseGroup(argv: readonly string[]): Group | undefined {
  const flag = argv.indexOf("--group");
  const value = flag === -1 ? undefined : argv[flag + 1];

  return isGroup(value) ? value : undefined;
}

function hasDefault(mod: unknown): mod is { default: unknown } {
  return typeof mod === "object" && mod !== null && "default" in mod;
}

/** The catalog loads at run time, as the CLI loads it, so this strict-checked script never imports a config file. */
async function setup(): Promise<Run> {
  const configPath = fileURLToPath(import.meta.resolve(CATALOG));
  const mod: unknown = await import(configPath);

  if (!hasDefault(mod)) throw new Error(`${configPath} has no default export`);
  const catalog = validateConfig(mod.default, BUILTIN_NAMES);
  const os = detectOs();

  return {
    bin: join(import.meta.dir, "../../../packages/core/src/bin.ts"),
    configPath,
    deps: resolveDeps(catalog.deps, { arch: process.arch, os }, BUILTINS),
    isInContainer: existsSync("/.dockerenv") || existsSync("/run/.containerenv"),
    os,
    perDepMs: Number(env.WORKERSTACK_SYSTEM_INSTALL_TIMEOUT_MS ?? 600_000),
  };
}

/** The group plus everything it depends on (cf needs bun from runtimes), in install order. */
function groupEntries(run: Run, group: Group): Array<[string, SystemDepConfig]> {
  const wanted = new Set(Object.keys(BUILTIN_GROUPS[group]));

  for (const name of wanted) for (const need of run.deps[name]?.dependsOn ?? []) wanted.add(need);

  return sortByDependencies(Object.entries(run.deps)).filter(([name]) => wanted.has(name));
}

/** One at a time, in dependsOn order: a dep installs only after its prerequisites, and package managers lock. */
async function installAll(run: Run, entries: ReadonlyArray<[string, SystemDepConfig]>): Promise<Row[]> {
  const rows: Row[] = [];

  for (const [name, dep] of entries) {
    print(`\n>> ${name}`);
    const result = await tryOne(run, name, dep);
    rows.push({ name, required: dep.required, ...result });
    print(`   ${result.outcome}: ${result.detail}`);
  }

  return rows;
}

function countOf(rows: readonly Row[], outcome: Outcome): number {
  return rows.filter((row) => row.outcome === outcome).length;
}

function table(rows: readonly Row[]): string {
  const counts = (["ok", "unavailable", "failed", "timeout"] as const).map(
    (outcome) => `${outcome} ${countOf(rows, outcome)}`,
  );

  return [
    "| dep | result | detail |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.name} | ${row.outcome} | ${row.detail.replaceAll("|", "/")} |`),
    "",
    counts.join(" · "),
  ].join("\n");
}

/** A required dep that fails, or a group with nothing installed, fails the job. */
function isFailedRun(rows: readonly Row[]): boolean {
  const isFailedRequired = rows.some((row) => row.required && (row.outcome === "failed" || row.outcome === "timeout"));

  return isFailedRequired || countOf(rows, "ok") === 0;
}

/** Installs the group `--group` names and sets the exit code: 2 for a bad flag, 1 for a failed run. */
export async function main(argv: readonly string[]): Promise<void> {
  const group = parseGroup(argv);

  if (group === undefined) {
    process.stderr.write(`--group must be one of: ${Object.keys(BUILTIN_GROUPS).join(", ")}\n`);

    process.exitCode = 2;

    return;
  }

  const run = await setup();
  const entries = groupEntries(run, group);
  print(`catalog-install — group ${group}: ${entries.map(([name]) => name).join(", ")}`);
  print(`home=${homedir()} os=${run.os} arch=${process.arch}\n${RULE}`);
  const rows = await installAll(run, entries);
  const summary = table(rows);
  print(`\n${RULE}\n${summary}`);
  const summaryPath = env.GITHUB_STEP_SUMMARY;

  if (summaryPath !== undefined && summaryPath !== "")
    await Bun.write(summaryPath, `# Catalog install: ${group} on ${run.os}\n\n${summary}\n`);

  process.exitCode = isFailedRun(rows) ? 1 : 0;
}
