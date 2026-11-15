import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defineConfig,
  detectOs,
  interpolate,
  OS_TARGETS,
  resolveCheckCommand,
  resolveOsCommand,
  sortByDependencies,
  versionsMatch,
  whichBinary,
} from "@workerstack/system";
import { expect, test } from "vitest";

import config from "../system.config.ts";
import { appDir, inApp, runCli } from "./helpers.ts";

const FIXTURE_NAMES = ["absent", "present", "stale", "unix-only"];

test("defineConfig export has fixture deps", () => {
  expect(Object.keys(config.deps).toSorted()).toStrictEqual(FIXTURE_NAMES);
  expect(config.packageJsonPath).toBe("package.json");
});

test("library helpers resolve against the consumer config", () => {
  const { present } = config.deps;
  expect(resolveCheckCommand("present", present)).toContain("1.0.0");
  expect(resolveOsCommand("present", present, detectOs())).toContain("installed-present");
  expect(
    sortByDependencies(Object.entries(config.deps))
      .map(([name]) => name)
      .toSorted(),
  ).toStrictEqual(FIXTURE_NAMES);
  expect(interpolate("{{name}}@{{version}}", "present", "1.0.0")).toBe("present@1.0.0");
  expect(versionsMatch("1.0.0", present.version)).toBe(true);
  expect(whichBinary("bun")).toBeTruthy();
});

test("defineConfig keeps a custom dep's fields", () => {
  const extra = defineConfig({
    deps: {
      jq: { description: "JSON processor", os: { all: "echo jq-{{version}}" }, required: true, version: "1.8.1" },
    },
  });

  expect(extra.deps.jq.version).toBe("1.8.1");
});

test("detectOs returns a known target", () => {
  expect([...OS_TARGETS]).toContain(detectOs());
});

test("check reports the present fixture dep", async () => {
  const result = await inApp(["check", "present"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("present@1.0.0");
});

test("check exits 1 for a missing required dep when targeted", async () => {
  const result = await inApp(["check", "absent"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("not installed");
});

test("check all succeeds because the only required dep is present", async () => {
  const result = await inApp(["check"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("@workerstack/system — check");
  expect(result.stdout).toContain("present@1.0.0");
  expect(result.stdout).toContain("absent");
});

test("install skips an already-present dep", async () => {
  const result = await inApp(["install", "present"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Already installed");
  expect(result.stdout).not.toContain("--upgrade");
  expect(result.stdout).not.toContain("Installed successfully");
});

test("install --config uses the given file", async () => {
  const result = await inApp(["check", "present", "--config", join(appDir, "system.config.ts")]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("present@1.0.0");
});

test("missing config file fails", async () => {
  const result = await runCli(["check"], { cwd: tmpdir() });
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("No system config found");
});

test("unknown command prints usage and fails", async () => {
  const result = await inApp(["wat"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain("Usage: system");
  expect(result.stderr).toContain("Unknown command: wat");
});

test("unknown dep fails with available names", async () => {
  const result = await inApp(["check", "nope"]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown dependency: nope");
  expect(result.stdout).toContain("present");
});
