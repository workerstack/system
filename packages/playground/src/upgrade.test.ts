import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { bunRead, bunWrite, fixture, inApp, output, runIn } from "./helpers.ts";

const STALE_PATH = /stale@9\.9\.9 \(expected 1\.0\.0\) \S+/;

test("matching install --upgrade still skips", async () => {
  const result = await inApp(["install", "present", "--upgrade"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Already installed");
  expect(result.stdout).not.toContain("Installed successfully");
  expect(result.stdout).not.toContain("installed-present");
});

test("mismatch install skips with path and --upgrade hint", async () => {
  const result = await inApp(["install", "stale"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Already installed (9.9.9)");
  expect(result.stdout).toMatch(/expected 1\.0\.0\) \S+/);
  expect(result.stdout).toContain("system install stale --upgrade");
  expect(result.stdout).not.toContain("Installed successfully");
});

test("mismatch install --upgrade runs the installer", async () => {
  const result = await inApp(["install", "stale", "--upgrade"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Installed successfully");
  expect(result.stdout).toContain("upgraded-stale");
  expect(result.stdout).not.toContain("Already installed");
});

test("install --upgrade warns when PATH still reports the old version", async () => {
  const result = await inApp(["install", "stale", "--upgrade"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(/PATH still has 9\.9\.9 \(expected 1\.0\.0\) \S+/);
});

test("install --upgrade does not warn when check version matches after install", async () => {
  const dir = fixture("system-upgrade-match-", {
    bump: {
      check: { command: bunRead("VERSION_FILE") },
      description: "mismatch then match",
      os: { all: bunWrite("VERSION_FILE", "1.0.0") },
      required: true,
      version: "1.0.0",
    },
  });

  const versionFile = join(dir, "version.txt");
  writeFileSync(versionFile, "9.9.9");
  const result = await runIn(dir, ["install", "bump", "--upgrade"], { VERSION_FILE: versionFile });
  expect(result.exitCode, output(result)).toBe(0);
  expect(result.stdout).toContain("Installed successfully");
  expect(result.stdout).not.toContain("PATH still has");
  expect(readFileSync(versionFile, "utf-8")).toBe("1.0.0");
});

test("install --dry-run --upgrade prints dry-run and does not skip", async () => {
  const result = await inApp(["install", "--dry-run", "--upgrade", "stale"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("dry-run:");
  expect(result.stdout).not.toContain("Already installed");
  expect(result.stdout).not.toContain("Installed successfully");
  expect(result.stdout).not.toContain("PATH still has");
});

test("check all mismatch includes a path and the --upgrade footer", async () => {
  const result = await inApp(["check"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(STALE_PATH);
  expect(result.stdout).toContain("system install --upgrade");
});

test("check named mismatch exits 0 and prints expected plus path", async () => {
  const result = await inApp(["check", "stale"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toMatch(STALE_PATH);
});

test("--upgrade on check is ignored, in either position", async () => {
  const runs = await Promise.all([
    inApp(["check", "stale"]),
    inApp(["check", "stale", "--upgrade"]),
    inApp(["check", "--upgrade", "stale"]),
    inApp(["check"]),
    inApp(["check", "--upgrade"]),
  ]);

  const [named, namedFlag, namedFlagBefore, all, allFlag] = runs.map(({ exitCode, stdout }) => ({ exitCode, stdout }));
  expect(named?.exitCode).toBe(0);
  expect(namedFlag).toStrictEqual(named);
  expect(namedFlagBefore).toStrictEqual(named);
  expect(allFlag).toStrictEqual(all);
});

test("install --upgrade accepts either flag order", async () => {
  const runs = await Promise.all([inApp(["install", "--upgrade", "stale"]), inApp(["install", "stale", "--upgrade"])]);

  for (const result of runs) {
    expect(result.exitCode, output(result)).toBe(0);
    expect(result.stdout).toContain("Installed successfully");
  }
});
