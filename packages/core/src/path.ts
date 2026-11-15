/**
 * Interactive-TTY PATH snapshot for `check`.
 *
 * `install` keeps using this process PATH. `check --here` does too.
 */

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { env as processEnv } from "./env.ts";
import { nonEmpty } from "./non-empty.ts";
import { WINDOWS_PLATFORM } from "./platform.constants.ts";
import { POWERSHELL, ZSH } from "./shell.constants.ts";

/** Where a PATH came from: a new interactive shell, or this process when that shell could not be read. */
type PathSource = "tty" | "process";

export type PathSnapshot = {
  path: string;
  /** why the interactive shell could not be read, when `source` is `process` */
  reason?: string;
  source: PathSource;
};

export type ExecFile = (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => string;

export const TTY_PATH_FALLBACK_WARN = "could not read interactive-shell PATH; using this process PATH";

export const PATH_PRINTF = 'printf %s "$PATH"';
export const UNIX_BASH_PATH_ARGS: readonly ["-ic", string] = ["-ic", PATH_PRINTF];
export const UNIX_ZSH_PATH_ARGS: readonly ["-lic", string] = ["-lic", PATH_PRINTF];

/**
 * What a new Windows terminal does: PATH from the registry (Machine, then User, where installers and
 * choco write), then each profile in PowerShell's startup order, then print PATH. Profiles are dot-sourced
 * explicitly (-NoProfile) because they must run after PATH is rebuilt.
 */
const WINDOWS_TTY_PATH_SCRIPT =
  "$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + " +
  "[Environment]::GetEnvironmentVariable('Path', 'User'); " +
  "foreach ($p in @($PROFILE.AllUsersAllHosts, $PROFILE.AllUsersCurrentHost, " +
  "$PROFILE.CurrentUserAllHosts, $PROFILE.CurrentUserCurrentHost)) { if (Test-Path $p) { . $p } }; " +
  "$env:Path";

export const WINDOWS_TTY_PATH_ARGS: readonly ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", string] = [
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  WINDOWS_TTY_PATH_SCRIPT,
];

/** Kill the snapshot shell after this long, so a hanging rc cannot hang a run. */
const SNAPSHOT_TIMEOUT_MS = 30_000;

/** The variables a Windows snapshot drops: PATH, which it rebuilds, and PSModulePath, which would break 5.1. */
const WINDOWS_DROPPED_KEY = /^(path|psmodulepath)$/i;

/** A Windows executable's suffix, which a shell's name drops. */
const EXE_SUFFIX = /\.exe$/i;

/** The shell a snapshot runs when `SHELL` is unset or empty. */
const DEFAULT_SHELL = "/bin/sh";

function defaultExecFile(file: string, args: readonly string[], env: NodeJS.ProcessEnv): string {
  return execFileSync(file, [...args], {
    encoding: "utf-8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: SNAPSHOT_TIMEOUT_MS,
  });
}

export function processPath(env: NodeJS.ProcessEnv = processEnv): string {
  return env.PATH ?? env.Path ?? "";
}

export function pathEnv(searchPath: string, base: NodeJS.ProcessEnv = processEnv): NodeJS.ProcessEnv {
  return { ...base, PATH: searchPath, Path: searchPath };
}

/**
 * HOME/USER/SHELL, locale, TERM, and the Windows profile and user-dir roots a profile expands
 * (`$env:LOCALAPPDATA\bin`). Not PATH. Not leftover toolchain exports. Not PSModulePath.
 */
const TTY_ENV_KEEP = [
  "APPDATA",
  "ComSpec",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "HOMESHARE",
  "LANG",
  "LANGUAGE",
  "LOCALAPPDATA",
  "LOGNAME",
  "PATHEXT",
  "ProgramData",
  "PROGRAMDATA",
  "ProgramFiles",
  "PROGRAMFILES",
  "ProgramFiles(x86)",
  "SHELL",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TERM",
  "TMP",
  "USER",
  "USERPROFILE",
  "WINDIR",
  "windir",
] as const;

export function isTtyEnvKeep(key: string): boolean {
  if (key.startsWith("LC_")) return true;

  return TTY_ENV_KEEP.some((kept) => kept === key);
}

export function unixStockPath(): string {
  return "/usr/local/bin:/usr/bin:/bin";
}

export function windowsStockPath(env: NodeJS.ProcessEnv): string {
  const root = nonEmpty(env.SYSTEMROOT) ?? nonEmpty(env.SystemRoot) ?? "C:\\Windows";

  // Windows PowerShell lives outside System32 proper, and the snapshot spawns it by name from this PATH
  return `${root}\\System32;${root};${root}\\System32\\WindowsPowerShell\\v1.0`;
}

/** Env for the TTY PATH spawn. Interactive rc applies the default toolchain on a stock PATH. */
/**
 * Unix: the keep-list, so leftover toolchain exports cannot pin a stale binary. Windows: everything but
 * PATH and PSModulePath, because the snapshot rebuilds PATH from the registry anyway and Windows
 * PowerShell needs its system variables to start promptly.
 */
export function ttySnapshotEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const keep = platform === WINDOWS_PLATFORM ? !WINDOWS_DROPPED_KEY.test(key) : isTtyEnvKeep(key);

    if (keep) out[key] = value;
  }

  const stock = platform === WINDOWS_PLATFORM ? windowsStockPath(env) : unixStockPath();
  out.PATH = stock;
  out.Path = stock;

  return out;
}

/** bash: interactive (`-ic`). zsh: login+interactive (`-lic`). Other Unix shells: `-ic`. */
export function unixPathSnapshotArgs(shell: string): readonly [string, string] {
  const name = basename(shell).replace(EXE_SUFFIX, "");

  if (name === ZSH) return ["-lic", PATH_PRINTF];

  return ["-ic", PATH_PRINTF];
}

/** Interactive rc may print MOTD on stdout; the PATH line is last. */
export function parsePathOutput(out: string): string {
  const lines = out.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");

  return lines.map((line) => line.trim()).findLast((line) => line !== "") ?? "";
}

/**
 * Snapshot PATH from a new interactive TTY once.
 * Unix bash: `$SHELL -ic` with stdin `/dev/null` (not login-only `-lc`).
 * Unix zsh: `$SHELL -lic` (`.zprofile` + `.zshrc`).
 * Windows: `powershell.exe` rebuilding PATH from the registry, then its profiles (WINDOWS_TTY_PATH_ARGS).
 * Spawn env is a keep-list (HOME/SHELL/locale/TERM) plus a stock PATH so leftover
 * parent PATH and toolchain exports cannot pin a stale binary.
 * Spawn failure or empty PATH → this process PATH (`source: "process"`).
 */
export function snapshotTtyPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = processEnv,
  execFile: ExecFile = defaultExecFile,
): PathSnapshot {
  try {
    const childEnv = ttySnapshotEnv(env, platform);

    const shell = nonEmpty(env.SHELL) ?? DEFAULT_SHELL;

    const raw =
      platform === WINDOWS_PLATFORM
        ? execFile(POWERSHELL, WINDOWS_TTY_PATH_ARGS, childEnv)
        : execFile(shell, unixPathSnapshotArgs(shell), childEnv);

    const path = parsePathOutput(raw);

    if (path !== "") return { path, source: "tty" };

    return { path: processPath(env), reason: "the shell printed no PATH", source: "process" };
  } catch (error) {
    return {
      path: processPath(env),
      reason: error instanceof Error ? error.message : String(error),
      source: "process",
    };
  }
}
