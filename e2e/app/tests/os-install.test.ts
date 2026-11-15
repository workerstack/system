import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectOs, OS_TARGETS, resolveOsCommand, type SystemDepConfig } from "@workerstack/system";
import { expect, test } from "vitest";

import { env } from "../env.ts";
import { bunLog, bunWrite, fixture, MISSING_CHECK, output, perOs, runIn } from "./helpers.ts";

const marker: SystemDepConfig = {
  check: MISSING_CHECK,
  description: "per-OS install marker",
  os: perOs((os) => bunWrite("MARKER", os)),
  required: true,
  version: "1.0.0",
};

const unixOnly: SystemDepConfig = {
  check: { command: bunLog("0.1.0") },
  description: "unavailable on Windows",
  os: { ...perOs(() => bunLog("unix")), windows: false },
  required: false,
  version: "0.1.0",
};

function osFixture(prefix: string): string {
  return fixture(prefix, { marker, "unix-only": unixOnly });
}

/** `--os` must win, so the harness's own override is unset in the child. */
const NO_OS_OVERRIDE = { WORKERSTACK_SYSTEM_OS: undefined };

test("detectOs matches EXPECT_OS when the docker harness sets it", () => {
  const expected = env.EXPECT_OS;

  const allowed: readonly string[] = expected === undefined || expected === "" ? OS_TARGETS : [expected];
  expect(allowed).toContain(detectOs());
});

test("install runs the command for the active OS", async () => {
  const dir = osFixture("system-os-");
  const markerFile = join(dir, "os.txt");
  const os = detectOs();
  expect(resolveOsCommand("marker", marker, os)).toContain(os);
  const result = await runIn(dir, ["install", "marker"], { MARKER: markerFile });
  expect(result.exitCode, output(result)).toBe(0);
  expect(result.stdout).toContain("Installed successfully");
  expect(readFileSync(markerFile, "utf-8")).toBe(os);
});

test("--os forces the windows command on this host", async () => {
  const dir = osFixture("system-os-flag-");
  const markerFile = join(dir, "os.txt");
  const childEnv = { MARKER: markerFile, ...NO_OS_OVERRIDE };
  const result = await runIn(dir, ["install", "marker", "--os", "windows"], childEnv);
  expect(result.exitCode, output(result)).toBe(0);
  expect(result.stdout).toContain("Installed successfully");
  expect(readFileSync(markerFile, "utf-8")).toBe("windows");
});

test("windows marks unix-only as unavailable", async () => {
  const dir = osFixture("system-os-unavail-");
  const result = await runIn(dir, ["install", "unix-only", "--os", "windows"], NO_OS_OVERRIDE);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("not available on windows");
});

test("unknown --os fails", async () => {
  const result = await runIn(osFixture("system-os-bad-"), ["install", "--os", "freebsd"], NO_OS_OVERRIDE);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Unknown OS target: freebsd");
});
