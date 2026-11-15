import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { OS_TARGETS } from "../config.ts";
import { env } from "../env.ts";
import { ARCHES, BUILTINS, command } from "./catalog-fixtures.ts";
import { launcher, winTree } from "./recipes.ts";

const BASH_ERROR_LINE = /line (\d+)/;
const FUNCTION_HEADER = /^f\d+\(\) \{$/;

it("unix commands all parse in bash", () => {
  // one bash for every command, each in its own function, so a syntax error names its line
  const labels: string[] = [];
  const script: string[] = [];

  for (const name of Object.keys(BUILTINS)) {
    for (const os of OS_TARGETS.filter((target) => target !== "windows")) {
      for (const arch of ARCHES) {
        const cmd = command(name, os, { arch });

        if (cmd === undefined) continue;
        labels.push(`${name} on ${os} ${arch}`);
        script.push(`f${labels.length}() {\n${cmd}\n}`);
      }
    }
  }

  const result = spawnSync("bash", ["-n"], { encoding: "utf-8", input: script.join("\n") });
  const line = Number(result.stderr.match(BASH_ERROR_LINE)?.[1] ?? 0);

  const fn = script
    .join("\n")
    .split("\n")
    .slice(0, line)
    .findLast((text) => FUNCTION_HEADER.test(text));

  expect(result.status, `${labels[Number(fn?.slice(1, -5)) - 1]}: ${result.stderr}`).toBe(0);
});

it("unix commands launcher writes a script that runs its target with every argument", () => {
  const home = mkdtempSync(join(tmpdir(), "launcher-"));

  try {
    function run(cmd: string): SpawnSyncReturns<string> {
      return spawnSync("bash", ["-c", cmd], { encoding: "utf-8", env: { ...env, HOME: home } });
    }

    expect(run(launcher("hello", "/bin/echo")).status).toBe(0);
    expect(readFileSync(join(home, ".local/bin/hello"), "utf-8")).toBe('#!/bin/sh\nexec "/bin/echo" "$@"\n');
    expect(run('"$HOME/.local/bin/hello" a "b c"').stdout).toBe("a b c\n");
  } finally {
    rmSync(home, { force: true, recursive: true });
  }
});

it("winTree unpacks tarballs with the system tar.exe and zips with Expand-Archive", () => {
  const tarball = winTree("https://example.com/tool.tar.bz2", "$env:LOCALAPPDATA\\Programs\\tool", { nested: true });
  expect(tarball).toContain(
    'Invoke-WebRequest -UseBasicParsing "https://example.com/tool.tar.bz2" -OutFile "$t\\archive"',
  );
  expect(tarball).toContain('& "$env:SystemRoot\\System32\\tar.exe" -xf "$t\\archive" -C "$t\\x"');
  expect(tarball).not.toContain("Expand-Archive");
  const zip = winTree("https://example.com/tool.zip", "$env:LOCALAPPDATA\\Programs\\tool");
  expect(zip).toContain('-OutFile "$t\\archive.zip"; Expand-Archive "$t\\archive.zip" "$t\\x"');
  expect(zip).not.toContain("tar.exe");
});
