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
} from "@workerstack/system"

const deps = resolveDeps(config.deps, { arch: process.arch, os: detectOs() }, BUILTINS)
resolveOsCommand("go", deps.go!, "macos")
// tmp="$(mktemp -d)" && curl -fsSL "https://go.dev/dl/go1.27.2.darwin-arm64.tar.gz" ...
```

Types: `SystemConfig`, `DepEntry`, `SystemDepConfig`, `OsCommands`, `OsTarget`, `EnvVar`, `BuiltinDep`, `BuiltinOverride`, `BuiltinName`, `RecipeContext`, `Arch`, `RawEntry`.
