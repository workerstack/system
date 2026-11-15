import type { EnvVar } from "../config.ts";
import type { Context } from "../probe.ts";
import type { Runtime } from "../runtime.ts";
import {
  applyEnvBlock,
  type EnvLine,
  expandPath,
  hasEnvBlock,
  reloadHint,
  renderEnvBlock,
  shellConfigPaths,
  shellKind,
} from "../shell-env.ts";
import { RULE } from "./report.ts";

/** Everything up to the last path separator, either style. */
const DIRECTORY = /^.*[\\/]/;

/** The shell kind and the rc files its managed block goes into. */
type RcFiles = { kind: ReturnType<typeof shellKind>; paths: string[] };

/** The line `env` renders to, or null when a `detect` entry finds nothing and has no fallback. */
function resolveEnvLine(rt: Runtime, env: EnvVar): EnvLine | null {
  if ("path" in env) return { path: env.path };

  if ("value" in env) return { key: env.key, value: env.value };

  for (const path of env.detect) {
    const expanded = expandPath(path, rt.home, rt.env);

    if (rt.exists(expanded)) {
      rt.log(`   Detected ${env.key} at: ${expanded}`);

      return { key: env.key, value: path };
    }
  }

  if (env.fallback !== undefined) {
    rt.log(`   Using fallback for ${env.key}: ${env.fallback}`);

    return { key: env.key, value: env.fallback };
  }

  rt.log(`   Could not detect ${env.key}, no fallback specified`);

  return null;
}

function rcFiles(rt: Runtime): RcFiles {
  const shell = rt.env.SHELL ?? "";
  const kind = shellKind(rt.platform, shell);

  return { kind, paths: shellConfigPaths(rt.home, kind, { env: rt.env, shell }) };
}

function fileName(path: string): string {
  return path.replace(DIRECTORY, "");
}

/** Write `tool`'s managed block into the shell rc. True when a block was written. */
export function configureEnvVars(rt: Runtime, tool: string, envVars: readonly EnvVar[]): boolean {
  if (envVars.length === 0) return true;

  const { kind, paths } = rcFiles(rt);
  const names = paths.map(fileName).join(", ");
  rt.log(`\n   Configuring environment variables in ${names}...`);

  const lines = envVars.map((env) => resolveEnvLine(rt, env)).filter((line) => line !== null);

  if (lines.length === 0) {
    rt.log("   No environment variables to configure");

    return false;
  }

  try {
    for (const path of paths) {
      const existing = rt.exists(path) ? rt.readFile(path) : "";

      if (hasEnvBlock(existing, tool))
        rt.log(`   Updating existing ${tool} environment config in ${fileName(path)}...`);
      rt.writeFile(path, applyEnvBlock(existing, renderEnvBlock(tool, lines, kind), tool));
    }
  } catch (error) {
    rt.error(`   Failed to configure env vars: ${error instanceof Error ? error.message : String(error)}`);

    return false;
  }

  rt.log(`   Added to ${names}:`);

  for (const line of lines)
    rt.log("path" in line ? `      PATH=${line.path}:$PATH` : `      ${line.key}=${line.value}`);
  rt.log(`\n   ${reloadHint(kind, paths[0] /* shellConfigPaths names at least one rc file */ as string)}`);

  return true;
}

export function envCommand(ctx: Context): number {
  const { rt } = ctx;
  rt.log("Setting up environment variables");
  rt.log(RULE);

  const envDeps = Object.entries(ctx.deps).flatMap(([tool, config]) =>
    config.env !== undefined && config.env.length > 0 ? [[tool, config.env] as const] : [],
  );

  if (envDeps.length === 0) {
    rt.log("\nNo dependencies with environment variables configured.");

    return 0;
  }

  let failed = 0;

  for (const [tool, env] of envDeps) {
    rt.log(`\n${tool}`);

    if (!configureEnvVars(rt, tool, env)) failed++;
  }

  const { kind, paths } = rcFiles(rt);
  rt.log(`\n${RULE}`);
  rt.log(`Environment variables configured in ${paths.join(", ")}`);
  rt.log(`\n${reloadHint(kind, paths[0] /* shellConfigPaths names at least one rc file */ as string)}`);

  return failed > 0 ? 1 : 0;
}
