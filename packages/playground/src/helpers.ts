import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OS_TARGETS, type OsTarget, type SystemDepConfig } from "@workerstack/system";

import { env } from "./env.ts";

export type CliResult = { exitCode: number; stderr: string; stdout: string };

/** Variables for the child; one set to undefined is unset there instead of inherited. */
export type ChildEnv = Readonly<Record<string, string | undefined>>;

const cli = `${import.meta.dirname}/../../core/src/bin.ts`;

/** The fixture consumer, whose system.config.ts holds the present, absent, stale and unix-only fixtures. */
export const appDir = `${import.meta.dirname}/__fixtures__/consumer`;

export const MISSING_CHECK = { command: "system-definitely-missing --version" } as const;

export async function runCli(
  args: readonly string[],
  opts: { cwd?: string | undefined; env?: ChildEnv | undefined } = {},
): Promise<CliResult> {
  const merged = Object.entries({ ...env, ...opts.env });
  const childEnv = Object.fromEntries(merged.filter((entry): entry is [string, string] => entry[1] !== undefined));

  const proc = Bun.spawn([process.execPath, cli, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: childEnv,
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout };
}

/** The CLI in the fixture consumer, against its fixture config. */
export async function inApp(args: readonly string[], childEnv?: ChildEnv): Promise<CliResult> {
  return await runCli(args, { cwd: appDir, env: childEnv });
}

/** Writes `deps` as `dir`'s system.config.ts and returns its path. */
export function writeConfig(dir: string, deps: Readonly<Record<string, SystemDepConfig>>): string {
  const configPath = join(dir, "system.config.ts");
  writeFileSync(configPath, `export default ${JSON.stringify({ deps }, null, "\t")};\n`);

  return configPath;
}

/** A fresh temp dir named after `prefix`, holding a system.config.ts with `deps`. */
export function fixture(prefix: string, deps: Readonly<Record<string, SystemDepConfig>>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeConfig(dir, deps);

  return dir;
}

/** The CLI in a fixture dir, against that dir's system.config.ts. */
export async function runIn(dir: string, args: readonly string[], childEnv?: ChildEnv): Promise<CliResult> {
  return await runCli([...args, "--config", join(dir, "system.config.ts")], { cwd: dir, env: childEnv });
}

/** Both streams, as the message of an exit-code expectation. */
export function output(result: CliResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

/** One command per OS target, each from `command`. */
export function perOs(command: (os: OsTarget) => string): Readonly<Record<string, string>> {
  return Object.fromEntries(OS_TARGETS.map((os) => [os, command(os)]));
}

function bunEval(script: string): string {
  return `bun -e ${JSON.stringify(script)}`;
}

export function bunWrite(envKey: string, value: string): string {
  return bunEval(`await Bun.write(process.env.${envKey}, ${JSON.stringify(value)})`);
}

export function bunAppend(envKey: string, value: string): string {
  return bunEval(
    [
      `const p=process.env.${envKey}`,
      'const prev=await Bun.file(p).exists()?await Bun.file(p).text():""',
      `await Bun.write(p, prev+${JSON.stringify(value)})`,
    ].join("; "),
  );
}

export function bunLog(value: string): string {
  return bunEval(`console.log(${JSON.stringify(value)})`);
}

export function bunRead(envKey: string): string {
  return bunEval(`console.log((await Bun.file(process.env.${envKey}).text()).trim())`);
}
