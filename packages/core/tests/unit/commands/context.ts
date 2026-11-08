import type { OsTarget, SystemDepConfig } from "../../../src/config.ts"
import type { Context } from "../../../src/probe.ts"
import { type FakeOptions, type FakeRuntime, fakeRuntime } from "../fake-runtime.ts"

export function dep(overrides: Partial<SystemDepConfig> = {}): SystemDepConfig {
	return {
		description: "a tool",
		os: { all: "install {{name}}@{{version}}" },
		required: true,
		version: "1.2.3",
		...overrides,
	}
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
	}
}
