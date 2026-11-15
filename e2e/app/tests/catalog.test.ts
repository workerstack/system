import { createRequire } from "node:module";
import { dirname } from "node:path";

import {
  BUILTIN_NAMES,
  OS_TARGETS,
  resolveCheckCommand,
  resolveOsCommand,
  sortByDependencies,
} from "@workerstack/system";
import catalog from "@workerstack/system-example-consumer";
import { expect, test } from "vitest";

import { runCli } from "./helpers.ts";
import { depOf, resolvedOn } from "./resolved.ts";

const catalogPath = createRequire(import.meta.url).resolve("@workerstack/system-example-consumer");
const catalogDir = dirname(catalogPath);

test("declares every built-in except the auto-added bootstraps, plus one custom dep", () => {
  const declared = Object.keys(catalog.deps);
  expect(declared.filter((name) => BUILTIN_NAMES.has(name))).toHaveLength(BUILTIN_NAMES.size - 2);
  expect(declared.filter((name) => !BUILTIN_NAMES.has(name))).toStrictEqual(["just"]);
});

test("resolves to 44 deps with brew and choco added", () => {
  const deps = resolvedOn("linux-apt");
  expect(Object.keys(deps)).toHaveLength(44);
  expect(depOf(deps, "brew").version).toBe("latest");
  expect(depOf(deps, "choco").version).toBe("latest");
});

/** Every command the catalog resolves to, as `[label, command]`, across each OS target and CPU. */
function everyCommand(): Array<[string, string]> {
  return OS_TARGETS.flatMap((os) =>
    ["x64", "arm64"].flatMap((arch) =>
      Object.entries(resolvedOn(os, arch)).flatMap(([name, dep]): Array<[string, string]> => {
        const cmd = resolveOsCommand(name, dep, os);

        return cmd === null ? [] : [[`${name} on ${os}/${arch}`, cmd]];
      }),
    ),
  );
}

test("every resolved command on every OS and CPU is interpolated", () => {
  const commands = everyCommand();
  expect(commands.length).toBeGreaterThan(300);

  for (const [label, cmd] of commands) expect(cmd, label).not.toContain("{{");
});

test("dependsOn puts prerequisites first", () => {
  const order = sortByDependencies(Object.entries(resolvedOn("macos"))).map(([name]) => name);

  const prerequisites = {
    brew: ["git", "curl", "docker", "ffmpeg", "google-chrome", "firefox"],
    bun: ["cf", "codex", "playwright"],
    java: ["gradle", "google-java-format"],
    uv: ["ruff", "mypy", "python"],
  };

  for (const [first, deps] of Object.entries(prerequisites))
    for (const dep of deps) expect(order.indexOf(first), `${first} before ${dep}`).toBeLessThan(order.indexOf(dep));
});

test("the atlas override keeps the catalog's commands and replaces the description", () => {
  const atlas = depOf(resolvedOn("linux-apt"), "atlas");
  expect(atlas.description).toMatch(/^Atlas: after an upgrade/);
  expect(resolveOsCommand("atlas", atlas, "linux-apt")).toContain("atlas-linux-amd64-v1.3.0");
});

test("check commands come from the catalog or default to name --version", () => {
  const deps = resolvedOn("linux-apt");

  const expected = {
    go: "go version",
    java: "java -version 2>&1",
    just: "just --version",
    "sherpa-onnx": "sherpa-onnx-version",
    stripe: "stripe --version",
    uv: "uv --version",
  };

  for (const [name, command] of Object.entries(expected))
    expect(resolveCheckCommand(name, depOf(deps, name))).toBe(command);
});

test("windows commands never use apt or brew, macOS never apt or choco", () => {
  const banned = { macos: /apt-get|choco install/, windows: /apt-get|brew install/ } as const;

  for (const os of ["macos", "windows"] as const) {
    for (const [name, dep] of Object.entries(resolvedOn(os)))
      expect(resolveOsCommand(name, dep, os) ?? "", name).not.toMatch(banned[os]);
  }
});

test("CLI dry-run prints every dep for the native OS", async () => {
  const result = await runCli(["install", "--dry-run", "--config", catalogPath], { cwd: catalogDir });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Dry-run complete");
  expect(result.stdout).toContain("Found 44 dependencies");
});

/** `--os` must win, so the harness's own override is unset in the child. */
async function dryRunOn(os: string) {
  const args = ["install", "--dry-run", "--os", os, "--config", catalogPath];

  return await runCli(args, { cwd: catalogDir, env: { WORKERSTACK_SYSTEM_OS: undefined } });
}

test("CLI dry-run walks every OS target", async () => {
  const results = await Promise.all(OS_TARGETS.map(async (os) => ({ os, result: await dryRunOn(os) })));

  for (const { os, result } of results) {
    expect(result.exitCode, os).toBe(0);
    expect(result.stdout).toContain(`Detected OS: ${os}`);
  }
});

test("CLI dry-run --os windows installs into LOCALAPPDATA and marks Linux-only deps unavailable", async () => {
  const { stdout } = await dryRunOn("windows");
  expect(stdout).toContain("epiphany@latest — not available on windows");
  expect(stdout).toContain("sqld@0.24.32 — not available on windows");
  expect(stdout).toContain("$env:LOCALAPPDATA\\bin");
  expect(stdout).toContain("choco install git -y");
});

test("CLI list prints the catalog", async () => {
  const result = await runCli(["list"], { cwd: catalogDir });
  expect(result.exitCode).toBe(0);

  for (const name of BUILTIN_NAMES) expect(result.stdout).toContain(`  ${name} `);
});

test("CLI check git succeeds on CI images that have git", async () => {
  const result = await runCli(["check", "git", "--config", catalogPath], { cwd: catalogDir });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("git@");
});
