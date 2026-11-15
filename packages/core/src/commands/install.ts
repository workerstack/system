import { resolveOsCommand } from "../config.ts";
import { type Context, type NamedDep, probeInstalled } from "../probe.ts";
import { expandPath } from "../shell-env.ts";
import { sortByDependencies } from "../sort-by-dependencies.ts";
import { versionsMatch } from "../version.ts";
import { configureEnvVars } from "./env-command.ts";
import { badge, header, RULE, targetDep } from "./report.ts";

export type InstallOptions = {
  dryRun: boolean;
  upgrade: boolean;
};

type Outcome = "failed" | "installed" | "planned" | "skipped" | "unavailable";

/**
 * Write the dep's env block whenever it is present, installed now or before: an already-installed tool
 * (a CI image's rust, a setup action's bun) is otherwise missing from a new shell's PATH.
 */
function writeEnv(ctx: Context, [name, config]: NamedDep): void {
  if (config.env !== undefined && config.env.length > 0) configureEnvVars(ctx.rt, name, config.env);
}

/** True when an installed copy stays: it matches the pin, or `--upgrade` is off. */
function keepInstalled(ctx: Context, dep: NamedDep, { upgrade }: InstallOptions): boolean {
  const { rt } = ctx;
  const [name, config] = dep;
  const installed = probeInstalled(rt, dep);

  if (installed === null) return false;

  if (versionsMatch(installed.version, config.version)) {
    rt.log(`   Already installed (${installed.version}), skipping`);
  } else if (upgrade) {
    return false;
  } else {
    rt.log(`   Already installed (${installed.version}), skipping (expected ${config.version}) ${installed.path}`);
    rt.log(`   run: system install ${name} --upgrade`);
  }

  writeEnv(ctx, dep);

  return true;
}

/** Run the install command, then warn when PATH still resolves another version. */
function runInstall(ctx: Context, dep: NamedDep, command: string): Outcome {
  const { rt } = ctx;
  const [, config] = dep;

  if (!rt.run(command)) {
    rt.error(`\nCommand failed: ${command}`);
    rt.error("   Installation failed");

    return "failed";
  }

  rt.log("   Installed successfully");
  writeEnv(ctx, dep);
  // Installer often does not win PATH — brew/nvm/fnm still first.
  const after = probeInstalled(rt, dep);

  if (after !== null && !versionsMatch(after.version, config.version)) {
    rt.log(`   PATH still has ${after.version} (expected ${config.version}) ${after.path}`);
    rt.log("   Unpin/unlink that binary or put the pinned one first on PATH");
  }

  return "installed";
}

function installOne(ctx: Context, dep: NamedDep, opts: InstallOptions): Outcome {
  const { rt } = ctx;
  const [name, config] = dep;
  const command = resolveOsCommand(name, config, ctx.os);

  if (command === null) {
    rt.log(`${name}@${config.version} — not available on ${ctx.os}`);

    return "unavailable";
  }

  rt.log(`${name}@${config.version}`);
  rt.log(`   ${config.description}`);

  if (opts.dryRun) {
    rt.log(`   dry-run: ${command}`);

    return "planned";
  }

  return keepInstalled(ctx, dep, opts) ? "skipped" : runInstall(ctx, dep, command);
}

/**
 * Put every dep's `{ path }` dirs first on this run's PATH, so a dep finds a prerequisite installed earlier
 * in the same run (ruff needs uv) and the skip check sees the pinned binary before a system one.
 */
function prependDepPaths(ctx: Context): void {
  for (const config of Object.values(ctx.deps)) {
    for (const entry of config.env ?? [])
      if ("path" in entry) ctx.rt.prependPath(expandPath(entry.path, ctx.rt.home, ctx.rt.env));
  }
}

/** Print what the run installs, in install order. */
function printPlan(ctx: Context, entries: readonly NamedDep[], { dryRun }: InstallOptions): void {
  const { rt } = ctx;
  rt.log(`\nFound ${entries.length} dependencies to install:\n`);

  for (const [name, config] of entries) {
    const isAvailable = resolveOsCommand(name, config, ctx.os) !== null;
    rt.log(`  ${badge(config)} ${name}@${config.version}${isAvailable ? "" : ` (not available on ${ctx.os})`}`);
  }

  rt.log(`\n${RULE}`);
  rt.log(dryRun ? "Dry-run — commands only, nothing installed" : "Installing dependencies...");
  rt.log(RULE);
}

/** Print the outcome counts and what they mean. 1 when a required dep failed. */
function printSummary(ctx: Context, counts: Readonly<Record<Outcome, number>>, { dryRun }: InstallOptions): number {
  const { rt } = ctx;
  rt.log(`\n${RULE}`);
  rt.log("Installation Summary");
  rt.log(RULE);

  if (dryRun) rt.log(`Planned: ${counts.planned}`);
  else rt.log(`Installed: ${counts.installed}`);
  rt.log(`Skipped: ${counts.skipped}`);
  rt.log(`Unavailable on ${ctx.os}: ${counts.unavailable}`);
  rt.log(`Failed: ${counts.failed}`);

  if (counts.failed > 0) {
    rt.log("\nSome required dependencies failed to install");

    return 1;
  }

  rt.log(dryRun ? "\nDry-run complete" : "\nAll required system dependencies are ready!");

  return 0;
}

/** Install every dep in dependency order. */
function installAll(ctx: Context, opts: InstallOptions): number {
  header(ctx, "install");

  const entries = sortByDependencies(Object.entries(ctx.deps));
  printPlan(ctx, entries, opts);

  const counts: Record<Outcome, number> = { failed: 0, installed: 0, planned: 0, skipped: 0, unavailable: 0 };

  for (const [name, config] of entries) {
    const outcome = installOne(ctx, [name, config], opts);
    // an optional dep that fails does not fail the run
    counts[outcome === "failed" && !config.required ? "skipped" : outcome]++;
  }

  return printSummary(ctx, counts, opts);
}

/** `system install [target]`: install the deps that are missing, or off their pin with `--upgrade`. */
export function installCommand(ctx: Context, target: string | undefined, opts: InstallOptions): number {
  prependDepPaths(ctx);

  if (target === undefined) return installAll(ctx, opts);
  const config = targetDep(ctx, target);

  if (config === undefined) return 1;
  ctx.rt.log(`Detected OS: ${ctx.os}`);

  return installOne(ctx, [target, config], opts) === "failed" ? 1 : 0;
}
