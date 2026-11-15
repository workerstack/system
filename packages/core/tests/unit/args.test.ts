import { describe, expect, it } from "vitest";

import { parseArgs } from "../../src/args.ts";

function parsed(argv: string[]) {
  const result = parseArgs(argv);

  if (!result.ok) throw new Error(result.error);

  return result.value;
}

describe("parseArgs", () => {
  it("defaults every flag off with no args", () => {
    expect(parsed([])).toStrictEqual({
      command: undefined,
      config: undefined,
      dryRun: false,
      here: false,
      os: undefined,
      target: undefined,
      upgrade: false,
    });
  });

  it("reads the command, target, and every flag in any position", () => {
    expect(
      parsed(["--dry-run", "install", "--config", "x.ts", "go", "--upgrade", "--os", "macos", "--here"]),
    ).toStrictEqual({
      command: "install",
      config: "x.ts",
      dryRun: true,
      here: true,
      os: "macos",
      target: "go",
      upgrade: true,
    });
  });
});

describe("parseArgs errors", () => {
  it("rejects a value flag with no value", () => {
    expect(parseArgs(["check", "--config"])).toStrictEqual({ error: "--config requires a path argument", ok: false });
    expect(parseArgs(["--os"])).toStrictEqual({ error: "--os requires a target argument", ok: false });
  });

  it("rejects a value flag followed by another flag", () => {
    expect(parseArgs(["--config", "--dry-run"])).toStrictEqual({
      error: "--config requires a path argument",
      ok: false,
    });
  });

  it("rejects an unknown OS target", () => {
    const result = parseArgs(["--os", "freebsd"]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Unknown OS target: freebsd. Expected one of: linux-apt/);
  });

  it("rejects an unknown flag", () => {
    expect(parseArgs(["install", "--force"])).toStrictEqual({ error: "Unknown flag: --force", ok: false });
  });
});
