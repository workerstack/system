import { spawnSync } from "node:child_process";

import { env as processEnv } from "./env.ts";
import { nonEmpty } from "./non-empty.ts";
import { WINDOWS_PLATFORM } from "./platform.constants.ts";
import { POWERSHELL, PS_MODULE_PATH_KEY } from "./shell.constants.ts";

/** One process spawn: `verbatim` passes args to cmd.exe unquoted, as Node does for `shell: true`. */
export type ShellInvocation = {
  args: string[];
  file: string;
  verbatim: boolean;
};

const POWERSHELL_MARKERS = [
  /\birm\b/i,
  /\biex\b/i,
  /\$env:/,
  /Invoke-WebRequest/i,
  /Invoke-Expression/i,
  /New-Item\b/i,
  /Test-Path\b/i,
  /Out-Null/i,
  /Get-Command\b/i,
  /\$LASTEXITCODE/,
];

export function needsPowerShell(command: string): boolean {
  return POWERSHELL_MARKERS.some((re) => re.test(command));
}

export function shellInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = processEnv,
): ShellInvocation {
  if (platform !== WINDOWS_PLATFORM) return { args: ["-c", command], file: "/bin/bash", verbatim: false };

  if (needsPowerShell(command))
    return { args: ["-NoProfile", "-NonInteractive", "-Command", command], file: POWERSHELL, verbatim: false };

  // cmd.exe so bun -e / choco / || keep working
  return { args: ["/d", "/s", "/c", `"${command}"`], file: nonEmpty(env.ComSpec) ?? "cmd.exe", verbatim: true };
}

/**
 * The env for spawning `file`. Windows PowerShell 5.1 gets no PSModulePath: one inherited from a pwsh 7
 * parent points it at 7's modules and breaks autoload (`Get-FileHash` "not recognized"); 5.1 rebuilds
 * its own default.
 */
export function shellEnv(file: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (file !== POWERSHELL) return env;

  return Object.fromEntries(Object.entries(env).filter(([key]) => !PS_MODULE_PATH_KEY.test(key)));
}

/** Run `command` with inherited stdio. Throws when the shell cannot start or exits non-zero. */
export function runShellCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = processEnv,
): void {
  const { args, file, verbatim } = shellInvocation(command, platform, env);

  const result = spawnSync(file, args, {
    env: shellEnv(file, env),
    stdio: "inherit",
    windowsVerbatimArguments: verbatim,
  });

  if (result.error !== undefined) throw result.error;

  if (result.status !== 0) throw new Error(`exit ${result.status ?? result.signal}: ${command}`);
}
