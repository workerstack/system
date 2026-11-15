---
description: Library API
order: 70
---

# Library API

```ts
import {
	BUILTINS,
	BUILTIN_GROUPS,
	BUILTIN_NAMES, // the catalog
	resolveDeps, // entries → full SystemDepConfig for { arch, os }
	validateConfig, // throws ConfigError listing every problem
	defineConfig,
	resolveOsCommand,
	resolveCheckCommand,
	interpolate,
	sortByDependencies, // install order; throws on cycles and unknown names
	versionsMatch,
	parseVersion,
	detectOs,
	detectOsFromPlatform,
	detectLinuxDistro,
	parseOsTarget,
	OS_TARGETS,
	whichBinary,
	commandExists,
	ConfigError,
} from "@workerstack/system";

const config = validateConfig(defineConfig({ deps: { go: "1.27.2" } }), BUILTIN_NAMES);
const target = parseOsTarget(OS_TARGETS[3]);
const deps = resolveDeps(config.deps, { arch: "arm64", os: target }, BUILTINS);
const go = deps.go!;

resolveOsCommand("go", go, "macos");
// tmp="$(mktemp -d)" && curl -fsSL "https://go.dev/dl/go1.27.2.darwin-arm64.tar.gz" ...

const order = sortByDependencies(Object.entries(deps)); // install order
const check = resolveCheckCommand("go", go); // "go version"
const output = interpolate("{{name}} {{version}}", "go", go.version);
const installed = parseVersion("go version go1.27.2 darwin/arm64", go.check?.pattern);

const ok = installed !== null && versionsMatch(installed, go.version);
const here = [detectOs(), detectOsFromPlatform("darwin"), detectLinuxDistro()];
const found = [whichBinary("go"), commandExists("go")];
const groups = Object.keys(BUILTIN_GROUPS);

try {
	validateConfig({ deps: { go: { verison: "1.27.2" } } }, BUILTIN_NAMES);
} catch (error) {
	if (!(error instanceof ConfigError)) throw error; // the message lists every problem
}

export { order, check, output, ok, here, found, groups };
```

Types: `SystemConfig`, `DepEntry`, `SystemDepConfig`, `OsCommands`, `OsTarget`, `EnvVar`, `BuiltinDep`, `BuiltinOverride`, `BuiltinName`, `RecipeContext`, `Arch`, `RawEntry`.
