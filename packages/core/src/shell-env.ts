/**
 * Shell rc blocks: which file each shell reads, and the managed block written into it.
 */

import { basename, resolve } from "node:path";

import { env as processEnv } from "./env.ts";
import { WINDOWS_PLATFORM } from "./platform.constants.ts";
import { FISH } from "./shell.constants.ts";

export type ShellKind = "fish" | "posix" | "powershell";

/** One rendered line: a directory put first on PATH, or a variable set to a value. */
export type EnvLine = { path: string } | { key: string; value: string };

/** Where a shell's rc lives beyond `home`: its `SHELL` (zsh reads `.zshrc`) and the env (fish's `XDG_CONFIG_HOME`). */
export type ShellConfigOptions = { env?: NodeJS.ProcessEnv; shell?: string };

/** A managed block's first and last lines. */
type Markers = { end: string; start: string };

/** The names `expandPath` reads from `home`, in any case. */
const HOME_NAME = /^(home|userprofile)$/i;

/** `$env:VAR`, `${VAR}`, `$VAR` and `%VAR%`, one capture group each. */
const VARIABLE = /\$env:(\w+)|\$\{(\w+)\}|\$(\w+)|%(\w+)%/g;

/** How many capture groups `VARIABLE` has: one per form, of which a match fills one. */
const VARIABLE_GROUPS = 4;

/** A character a regex reads as syntax. */
const REGEX_SYNTAX = /[.*+?^${}()|[\]\\]/g;

const MARKER_OWNER = "@workerstack/system";

/** Owner tag written before the rename; blocks carrying it are replaced, never duplicated. */
const LEGACY_MARKER_OWNER = "crossdeps";

/** PowerShell on Windows; fish when `SHELL` is fish; posix (bash/zsh) otherwise. */
export function shellKind(platform: NodeJS.Platform, shell = ""): ShellKind {
  if (platform === WINDOWS_PLATFORM) return "powershell";

  return basename(shell) === FISH ? "fish" : "posix";
}

/**
 * The rc files the managed block goes into. On Windows both profiles: PowerShell 7 (`pwsh`) reads
 * `Documents\PowerShell`, Windows PowerShell 5.1 (`powershell.exe`, which `check` snapshots) reads
 * `Documents\WindowsPowerShell`.
 */
export function shellConfigPaths(
  home: string,
  kind: ShellKind,
  { env = {}, shell = "" }: ShellConfigOptions = {},
): string[] {
  if (kind === "powershell") {
    return ["PowerShell", "WindowsPowerShell"].map((dir) =>
      resolve(home, "Documents", dir, "Microsoft.PowerShell_profile.ps1"),
    );
  }

  if (kind === "fish")
    return [resolve(env.XDG_CONFIG_HOME ?? resolve(home, ".config"), "fish", "conf.d", "workerstack-system.fish")];

  return [resolve(home, shell.includes("zsh") ? ".zshrc" : ".bashrc")];
}

/**
 * Expand `$env:VAR`, `$VAR`, `${VAR}` and `%VAR%`. `HOME` and `USERPROFILE` are `home`; every other name comes from
 * `env`. Names `env` does not define stay literal, so a later shell can still expand them.
 */
export function expandPath(path: string, home: string, env: NodeJS.ProcessEnv = processEnv): string {
  function lookup(name: string): string | undefined {
    return HOME_NAME.test(name) ? home : env[name];
  }

  // the groups past the captures are the offset and the whole string; the one capture a match fills is the name
  return path.replaceAll(
    VARIABLE,
    (token: string, ...groups: Array<string | undefined>) => lookup(groups.slice(0, VARIABLE_GROUPS).join("")) ?? token,
  );
}

function envMarkers(tool: string, owner: string = MARKER_OWNER): Markers {
  return {
    end: `# end ${tool} environment`,
    start: `# ${tool} environment (managed by ${owner})`,
  };
}

function escapeRegExp(text: string): string {
  return text.replaceAll(REGEX_SYNTAX, "\\$&");
}

function stripBlock(existing: string, tool: string, owner: string): string {
  const { end, start } = envMarkers(tool, owner);

  if (!existing.includes(start)) return existing;

  return existing.replaceAll(
    new RegExp(`\\r?\\n?${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\r?\\n?`, "g"),
    "",
  );
}

function renderLine(line: EnvLine, kind: ShellKind): string {
  if ("path" in line) {
    if (kind === "powershell") return `$env:Path = "${line.path};" + $env:Path`;

    if (kind === "fish") return `set -gx PATH "${line.path}" $PATH`;

    return `export PATH="${line.path}:$PATH"`;
  }

  if (kind === "powershell") return `$env:${line.key} = "${line.value}"`;

  if (kind === "fish") return `set -gx ${line.key} "${line.value}"`;

  return `export ${line.key}="${line.value}"`;
}

/** The managed block for `tool`. PATH entries go first on PATH so a pinned toolchain wins. */
export function renderEnvBlock(tool: string, lines: readonly EnvLine[], kind: ShellKind): string {
  const { end, start } = envMarkers(tool);
  const nl = kind === "powershell" ? "\r\n" : "\n";

  return ["", start, ...lines.map((line) => renderLine(line, kind)), end, ""].join(nl);
}

/** Replace `tool`'s block (current or legacy marker) with `block`; other content is kept. */
export function applyEnvBlock(existing: string, block: string, tool: string): string {
  const withoutLegacy = stripBlock(existing, tool, LEGACY_MARKER_OWNER);

  return stripBlock(withoutLegacy, tool, MARKER_OWNER) + block;
}

/** True when the rc already holds a block for `tool`, current or legacy. */
export function hasEnvBlock(existing: string, tool: string): boolean {
  return existing.includes(envMarkers(tool).start) || existing.includes(envMarkers(tool, LEGACY_MARKER_OWNER).start);
}

export function reloadHint(kind: ShellKind, configPath: string): string {
  if (kind === "powershell") return "Restart PowerShell or run: . $PROFILE";

  if (kind === "fish") return `Run: source ${configPath}   (or restart fish)`;

  return `Run: source ~/${basename(configPath)}   (or restart terminal)`;
}
