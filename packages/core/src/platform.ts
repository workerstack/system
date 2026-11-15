/**
 * OS detection for system dependency installation
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import { OS_TARGETS, type OsTarget } from "./config.ts";
import { env } from "./env.ts";
import { nonEmpty } from "./non-empty.ts";
import { pathEnv } from "./path.ts";
import { MACOS_PLATFORM, WINDOWS_PLATFORM } from "./platform.constants.ts";

/** Run a shell command and return stdout; throws on a non-zero exit. Injected so lookups are testable. */
type ShellExec = (command: string, env: NodeJS.ProcessEnv | undefined) => string;

/** How `findBinary` looks: on which platform, on which PATH (this process's when unset), and through what. */
export type BinaryLookup = {
  exec?: ShellExec;
  platform?: NodeJS.Platform;
  searchPath?: string | undefined;
};

/** One quote at either end of a token. */
const SURROUNDING_QUOTE = /^["']|["']$/g;

/** A line break in `where` output, Windows or Unix. */
const LINE_BREAK = /\r?\n/;

function shellExec(command: string, childEnv: NodeJS.ProcessEnv | undefined): string {
  return execSync(command, { encoding: "utf-8", env: childEnv, stdio: ["ignore", "pipe", "ignore"] });
}

/** `whichBinary`, with the shell lookup injected. */
export function findBinary(
  command: string,
  { exec = shellExec, platform = process.platform, searchPath }: BinaryLookup = {},
): string | null {
  const token = command.replaceAll(SURROUNDING_QUOTE, "");

  if (token === "") return null;

  if (existsSync(token)) return token;
  const lookup = platform === WINDOWS_PLATFORM ? `where ${token}` : `command -v ${token}`;

  try {
    const out = exec(lookup, searchPath === undefined ? undefined : pathEnv(searchPath));

    // `where` lists every match, one per line; the first is what the shell runs
    return nonEmpty(out.trim().split(LINE_BREAK)[0]) ?? null;
  } catch {
    return null;
  }
}

/** Resolved path of the first token (`command -v`, or `where` on Windows). Null if missing. */
export function whichBinary(
  command: string,
  platform: NodeJS.Platform = process.platform,
  searchPath?: string,
): string | null {
  return findBinary(command, { platform, searchPath });
}

/** Whether `command` resolves, on `searchPath` when given, else on this process's PATH. */
export function commandExists(command: string, searchPath?: string): boolean {
  return whichBinary(command, process.platform, searchPath) !== null;
}

function isOsTarget(value: string): value is OsTarget {
  return OS_TARGETS.some((target) => target === value);
}

/** `value` as an OS target; throws naming the known targets when it is none. */
export function parseOsTarget(value: string): OsTarget {
  if (isOsTarget(value)) return value;
  throw new Error(`Unknown OS target: ${value}. Expected one of: ${OS_TARGETS.join(", ")}`);
}

/** True when `command` resolves on PATH. Injected so detection is testable without the host's tools. */
export type CommandProbe = (command: string) => boolean;

/** The Linux target whose package manager `has` finds: apt, then dnf, then pacman; apt when it finds none. */
export function detectLinuxDistro(has: CommandProbe = commandExists): OsTarget {
  if (has("apt-get")) return "linux-apt";

  if (has("dnf")) return "linux-dnf";

  if (has("pacman")) return "linux-pacman";

  // default to apt if nothing detected
  return "linux-apt";
}

/**
 * The OS target of `platform`: `override` when set (`WORKERSTACK_SYSTEM_OS` by default), else macOS, Windows, or
 * the Linux distro `has` detects.
 */
export function detectOsFromPlatform(
  platform: NodeJS.Platform,
  override: string | undefined = env.WORKERSTACK_SYSTEM_OS,
  has: CommandProbe = commandExists,
): OsTarget {
  const forced = nonEmpty(override);

  if (forced !== undefined) return parseOsTarget(forced);

  if (platform === MACOS_PLATFORM) return "macos";

  if (platform === WINDOWS_PLATFORM) return "windows";

  return detectLinuxDistro(has);
}

/**
 * Detect the current OS target.
 * `override` (or `WORKERSTACK_SYSTEM_OS`) forces a target — used by tests and `--os`.
 */
export function detectOs(override: string | undefined = env.WORKERSTACK_SYSTEM_OS): OsTarget {
  return detectOsFromPlatform(process.platform, override);
}
