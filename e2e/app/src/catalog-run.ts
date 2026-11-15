import { resolveOsCommand, type OsTarget, type SystemDepConfig, versionsMatch } from "@workerstack/system";

import { env } from "../env.ts";

export type Outcome = "failed" | "ok" | "timeout" | "unavailable";

export type Result = { detail: string; outcome: Outcome };

/** What every install and check of one catalog-install run shares. */
export type Run = {
  bin: string;
  configPath: string;
  deps: Readonly<Record<string, SystemDepConfig>>;
  isInContainer: boolean;
  os: OsTarget;
  perDepMs: number;
};

type CliResult = { code: number; isTimedOut: boolean; out: string };

// the Fedora and Arch jobs run in containers, which have no systemd to run a daemon
const NEEDS_SERVICE_MANAGER: readonly string[] = ["docker"];

export function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

async function cli(run: Run, args: readonly string[]): Promise<CliResult> {
  const proc = Bun.spawn(["bun", run.bin, ...args, "--config", run.configPath], {
    env: {
      ...env,
      DEBIAN_FRONTEND: "noninteractive",
      HOMEBREW_NO_AUTO_UPDATE: "1",
      HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK: "1",
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  let isTimedOut = false;

  const killer = setTimeout(() => {
    isTimedOut = true;
    proc.kill();
  }, run.perDepMs);

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(killer);
  const out = `${stdout}\n${stderr}`.trim();

  if (out !== "") print(out);

  return { code, isTimedOut, out };
}

function unavailableReason(run: Run, name: string, dep: SystemDepConfig): string | null {
  if (resolveOsCommand(name, dep, run.os) === null) return `not available on ${run.os}`;

  if (run.isInContainer && NEEDS_SERVICE_MANAGER.includes(name)) return "needs systemd, which a container lacks";

  return null;
}

/** check reads a new interactive shell's PATH, so it sees what install wrote into the rc file. */
async function verify(run: Run, name: string, dep: SystemDepConfig): Promise<Result> {
  const check = await cli(run, ["check", name]);
  const found = new RegExp(`^${name}@(\\S+) \\(expected `, "m").exec(check.out)?.[1];

  if (found === undefined) return { detail: "installed, but check finds nothing", outcome: "failed" };

  if (!versionsMatch(found, dep.version))
    return { detail: `check finds ${found}, expected ${dep.version}`, outcome: "failed" };

  return { detail: found, outcome: "ok" };
}

/** Install one dep with --upgrade, then require check to find its version. */
export async function tryOne(run: Run, name: string, dep: SystemDepConfig): Promise<Result> {
  const reason = unavailableReason(run, name, dep);

  if (reason !== null) return { detail: reason, outcome: "unavailable" };
  const install = await cli(run, ["install", name, "--upgrade"]);

  if (install.isTimedOut) return { detail: "install timed out", outcome: "timeout" };

  if (install.code !== 0) return { detail: `install exit ${install.code}`, outcome: "failed" };

  return await verify(run, name, dep);
}
