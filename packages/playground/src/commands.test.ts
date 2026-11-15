import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SystemDepConfig } from "@workerstack/system";
import { expect, test } from "vitest";

import { bunAppend, bunLog, bunWrite, fixture, MISSING_CHECK, output, runIn } from "./helpers.ts";

const isWindows = process.platform === "win32";

function missingDep(description: string, install: string, extra: Partial<SystemDepConfig> = {}): SystemDepConfig {
  return { check: MISSING_CHECK, description, os: { all: install }, required: true, version: "1.0.0", ...extra };
}

test("install writes the command output for a missing dep", async () => {
  const dir = fixture("system-install-", { fresh: missingDep("fresh install", bunWrite("MARKER", "fresh-ok")) });
  const marker = join(dir, "installed.txt");
  const result = await runIn(dir, ["install", "fresh"], { MARKER: marker });
  expect(result.exitCode, output(result)).toBe(0);
  expect(result.stdout).toContain("Installed successfully");
  expect(result.stdout).not.toContain("PATH still has");
  expect(readFileSync(marker, "utf-8")).toBe("fresh-ok");
});

test("install respects dependsOn order", async () => {
  const dir = fixture("system-order-", {
    child: missingDep("child", bunAppend("MARKER", "child"), { dependsOn: ["parent"] }),
    parent: missingDep("parent", bunAppend("MARKER", "parent")),
  });

  const marker = join(dir, "order.txt");
  const result = await runIn(dir, ["install"], { MARKER: marker });
  expect(result.exitCode, output(result)).toBe(0);
  expect(readFileSync(marker, "utf-8")).toBe("parentchild");
});

test("sync-pm updates packageManager from the bun dep version", async () => {
  const bun = { description: "bun", os: { all: bunLog("bun") }, required: true, version: "1.3.11" };
  const dir = fixture("system-sync-", { bun });
  const pkgPath = join(dir, "package.json");
  writeFileSync(pkgPath, `${JSON.stringify({ name: "sync-fixture", packageManager: "bun@0.0.1" }, null, "\t")}\n`);
  const result = await runIn(dir, ["sync-pm"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Updated packageManager to bun@1.3.11");
  const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf-8"));
  expect(pkg).toMatchObject({ packageManager: "bun@1.3.11" });
});

function profileOf(home: string): string {
  const profile = isWindows
    ? join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1")
    : join(home, ".bashrc");

  return readFileSync(profile, "utf-8");
}

test("env writes markers into an isolated HOME", async () => {
  const home = mkdtempSync(join(tmpdir(), "system-home-"));
  const envVars = [{ key: "TOOL_HOME", value: "$HOME/tool" }, { path: "$HOME/tool/bin" }];

  const tool = {
    description: "env fixture",
    env: envVars,
    os: { all: bunLog("tool") },
    required: true,
    version: "1.0.0",
  };

  const dir = fixture("system-env-", { tool });
  const result = await runIn(dir, ["env"], { HOME: home, SHELL: "/bin/bash", USERPROFILE: home });
  expect(result.exitCode).toBe(0);
  const written = profileOf(home);
  expect(written).toContain("# tool environment (managed by @workerstack/system)");

  const lines = isWindows
    ? ['$env:TOOL_HOME = "$HOME/tool"', '$env:Path = "$HOME/tool/bin;" + $env:Path']
    : ['export TOOL_HOME="$HOME/tool"', 'export PATH="$HOME/tool/bin:$PATH"'];

  for (const line of lines) expect(written).toContain(line);
});
