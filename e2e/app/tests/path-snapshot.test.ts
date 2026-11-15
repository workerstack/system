import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import { expect, test } from "vitest";

import { env } from "../env.ts";
import { type ChildEnv, type CliResult, fixture, inApp, output, runIn } from "./helpers.ts";

const PATH_PROBE = "system-path-probe";
const TTY_PATH_WARN = "could not read interactive-shell PATH; using this process PATH";
const NO_SHELL = "/no/such/system-shell";
const isWindows = process.platform === "win32";

function writePathProbe(dir: string, version: string): void {
  if (isWindows) {
    writeFileSync(join(dir, `${PATH_PROBE}.cmd`), `@echo off\r\necho ${version}\r\n`);

    return;
  }

  const file = join(dir, PATH_PROBE);
  writeFileSync(file, `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  chmodSync(file, 0o755);
}

/** A fixture dir whose one required dep, probe, checks the PATH_PROBE script against `version`. */
function probeFixture(prefix: string, version = "4.4.4"): string {
  const check = { command: `${PATH_PROBE} --version` };

  return fixture(prefix, {
    probe: { check, description: "path probe", os: { all: "echo unused" }, required: true, version },
  });
}

/** `dirs` ahead of this process's PATH. */
function pathWith(...dirs: string[]): string {
  return [...dirs, env.PATH ?? ""].join(delimiter);
}

function writeFakeTtyShell(dir: string, ttyPath: string): string {
  const file = join(dir, "fake-tty-shell");

  const script = [
    "#!/bin/sh",
    'case "$1" in',
    "  -*c*)",
    `    PATH=${JSON.stringify(ttyPath)} eval "$2"`,
    "    exit $?",
    "    ;;",
  ];

  writeFileSync(file, `${[...script, "esac", "exit 1"].join("\n")}\n`, { mode: 0o755 });
  chmodSync(file, 0o755);

  return file;
}

/** What a `check probe` run showed: its exit code, whether it found the probe at the version, whether it warned. */
type ProbeOutcome = { exitCode: number; isFound: boolean; isWarned: boolean };

function probeOutcome(result: CliResult, version: string): ProbeOutcome {
  return {
    exitCode: result.exitCode,
    isFound: result.stdout.includes(`probe@${version}`),
    isWarned: result.stderr.includes(TTY_PATH_WARN),
  };
}

const FOUND: ProbeOutcome = { exitCode: 0, isFound: true, isWarned: false };
const FOUND_WARNED: ProbeOutcome = { exitCode: 0, isFound: true, isWarned: true };

/** A probe at 4.4.4 first on PATH, checked with `args`. */
async function probeOnPath(prefix: string, args: readonly string[], childEnv: ChildEnv = {}): Promise<CliResult> {
  const dir = probeFixture(prefix);
  writePathProbe(dir, "4.4.4");

  return await runIn(dir, args, { PATH: pathWith(dir), ...childEnv });
}

test("--here uses this process PATH, before or after the dep name", async () => {
  expect(probeOutcome(await probeOnPath("system-path-here-", ["check", "--here", "probe"]), "4.4.4")).toStrictEqual(
    FOUND,
  );
  expect(probeOutcome(await probeOnPath("system-path-here-", ["check", "probe", "--here"]), "4.4.4")).toStrictEqual(
    FOUND,
  );
});

test("install uses process PATH and ignores --here", async () => {
  const installed = await probeOnPath("system-path-install-", ["install", "probe", "--here"], { SHELL: NO_SHELL });
  expect(installed.exitCode, output(installed)).toBe(0);
  expect(installed.stdout).toContain("Already installed (4.4.4)");
  expect(installed.stderr).not.toContain(TTY_PATH_WARN);
});

test("check --here still works when TTY spawn would fail", async () => {
  const result = await inApp(["check", "--here", "present"], { SHELL: NO_SHELL });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("present@1.0.0");
  expect(result.stderr).not.toContain(TTY_PATH_WARN);
});

test.skipIf(process.platform === "win32")("check sees interactive rc PATH, not login-only files", async () => {
  const dir = probeFixture("system-path-rc-", "3.2.1");
  const home = join(dir, "home");

  const interactiveDir = join(home, "interactive-bin");
  const loginDir = join(home, "login-bin");
  const poisonDir = join(home, "poison-bin");

  for (const [bin, version] of [
    [interactiveDir, "3.2.1"],
    [loginDir, "9.9.9"],
    [poisonDir, "9.9.9"],
  ] as const) {
    mkdirSync(bin, { recursive: true });
    writePathProbe(bin, version);
  }

  writeFileSync(join(home, ".bashrc"), `export PATH=${JSON.stringify(interactiveDir)}":$PATH"\n`);

  for (const file of [".profile", ".bash_profile"])
    writeFileSync(join(home, file), `export PATH=${JSON.stringify(loginDir)}":$PATH"\n`);

  const childEnv = { HOME: home, NVM_BIN: poisonDir, PATH: pathWith(poisonDir), SHELL: "/bin/bash" };
  const result = await runIn(dir, ["check", "probe"], childEnv);
  expect(probeOutcome(result, "3.2.1")).toStrictEqual(FOUND);
  expect(result.stdout).not.toContain("9.9.9");
});

test.skipIf(process.platform === "win32")("check uses the PATH printed by an interactive $SHELL", async () => {
  const dir = probeFixture("system-path-login-", "3.2.1");
  const [loginDir, processDir] = [join(dir, "login"), join(dir, "proc")];
  mkdirSync(loginDir);
  mkdirSync(processDir);
  writePathProbe(loginDir, "3.2.1");
  writePathProbe(processDir, "9.9.9");
  const shell = writeFakeTtyShell(dir, loginDir);
  const result = await runIn(dir, ["check", "probe"], { PATH: pathWith(processDir), SHELL: shell });
  expect(probeOutcome(result, "3.2.1")).toStrictEqual(FOUND);
  expect(result.stdout).not.toContain("9.9.9");
});

test.skipIf(process.platform === "win32")("TTY spawn fail falls back to process PATH with one warning", async () => {
  expect(
    probeOutcome(await probeOnPath("system-path-fail-", ["check", "probe"], { SHELL: NO_SHELL }), "4.4.4"),
  ).toStrictEqual(FOUND_WARNED);
});

test.skipIf(process.platform === "win32")("empty TTY PATH falls back to process PATH with one warning", async () => {
  const dir = probeFixture("system-path-empty-");
  writePathProbe(dir, "4.4.4");
  const shell = writeFakeTtyShell(dir, "");
  expect(
    probeOutcome(await runIn(dir, ["check", "probe"], { PATH: pathWith(dir), SHELL: shell }), "4.4.4"),
  ).toStrictEqual(FOUND_WARNED);
});
