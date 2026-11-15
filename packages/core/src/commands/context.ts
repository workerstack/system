import type { OsTarget, SystemDepConfig } from "../config.ts";
import { type FakeOptions, type FakeRuntime, fakeRuntime } from "../fake-runtime.ts";
import type { Context } from "../probe.ts";

export function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
  return {
    description: "a tool",
    os: { all: "install {{name}}@{{version}}" },
    required: true,
    version: "1.2.3",
    ...overrides,
  };
}

export function context(
  deps: Record<string, SystemDepConfig>,
  opts: FakeOptions & { os?: OsTarget } = {},
): Context & { rt: FakeRuntime } {
  return {
    configDir: "/work",
    deps,
    os: opts.os ?? "linux-apt",
    packageJsonPath: "package.json",
    rt: fakeRuntime(opts),
  };
}
