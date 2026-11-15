import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { exportsOf, fakeRuntime } from "./fake-runtime.ts";
import { findConfig, importConfig } from "./load.ts";

const config = { deps: {} };

function at(name: string): string {
  return resolve("/work", name);
}

describe("findConfig", () => {
  it("resolves --config against cwd", () => {
    const rt = fakeRuntime({ cwd: "/work", files: { [at("cfg/x.ts")]: "" } });
    expect(findConfig(rt, "cfg/x.ts")).toStrictEqual({ ok: true, value: at("cfg/x.ts") });
  });

  it("fails when --config points at nothing", () => {
    expect(findConfig(fakeRuntime(), "missing.ts")).toStrictEqual({
      error: `Config file not found: ${at("missing.ts")}`,
      ok: false,
    });
  });

  it("takes the first convention name present", () => {
    const rt = fakeRuntime({ files: { [at("system.config.js")]: "", [at("system.config.mjs")]: "" } });
    expect(findConfig(rt, undefined)).toStrictEqual({ ok: true, value: at("system.config.js") });
  });

  it("names every convention when none exists", () => {
    expect(findConfig(fakeRuntime(), undefined)).toStrictEqual({
      error: "No system config found. Create one of: system.config.ts, system.config.js, system.config.mjs",
      ok: false,
    });
  });
});

describe("importConfig", () => {
  it("prefers the default export", async () => {
    const rt = fakeRuntime({ modules: { "/c.ts": exportsOf({ default: config, other: { deps: { x: 1 } } }) } });
    expect(await importConfig(rt, "/c.ts")).toStrictEqual({ ok: true, value: config });
  });

  it("falls back to a named export holding deps", async () => {
    const rt = fakeRuntime({ modules: { "/c.ts": exportsOf({ default: 1, junk: null, named: config }) } });
    expect(await importConfig(rt, "/c.ts")).toStrictEqual({ ok: true, value: config });
  });

  it("throws a ConfigError for an invalid config", async () => {
    const rt = fakeRuntime({ modules: { "/c.ts": exportsOf({ default: { deps: { mytool: { version: "1" } } } }) } });
    await expect(importConfig(rt, "/c.ts")).rejects.toThrow(/^Invalid system config:\n  - deps.mytool.description/);
  });

  it("fails when no export holds deps", async () => {
    const rt = fakeRuntime({ modules: { "/c.ts": exportsOf({ default: { nope: true } }) } });
    expect(await importConfig(rt, "/c.ts")).toStrictEqual({
      error: "Config file must export an object with a `deps` field (use defineConfig)",
      ok: false,
    });
  });
});
