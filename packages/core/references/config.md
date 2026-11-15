---
description: Config file and entry forms
order: 30
---

# Config

## Discovery

`system.config.ts`, `system.config.js` or `system.config.mjs` in the working directory, or `--config <path>`. Export the config as `export default defineConfig(...)`, or as any named export holding `deps`.

| Field             | Type   | Default          | Meaning                                                                                  |
| ----------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `deps`            | object | required         | One entry per dependency, by name                                                        |
| `packageJsonPath` | string | `"package.json"` | The package.json whose `packageManager` follows the bun pin, relative to the config file |

## Entry forms

A built-in name takes one of two forms:

```ts
import { defineConfig } from "@workerstack/system";

export default defineConfig({
	deps: {
		bun: "1.4.4",
	},
});
```

The long form overrides parts of the catalog entry:

```ts
import { defineConfig } from "@workerstack/system";

export default defineConfig({
	deps: {
		go: {
			version: "1.27.2",
			required: false, // default true
			description: "Go for the CLI", // replaces the catalog's
			os: { windows: false }, // merges per OS key over the catalog's commands
			check: { command: "go version" }, // replaces
			env: [{ path: "/opt/go/bin" }], // replaces
			dependsOn: [], // replaces
		},
	},
});
```

Any other name is a custom dep and needs the full form. `defineConfig` checks each key: a version string under a custom name is a type error.

```ts
import { defineConfig } from "@workerstack/system";

export default defineConfig({
	deps: {
		just: {
			description: "just, a command runner", // required
			version: "1.59.0", // required; "latest" allowed
			required: false, // required
			os: {
				// required, at least one key
				all: 'curl -fsSL "https://github.com/casey/just/releases/download/{{version}}/just-{{version}}-x86_64-unknown-linux-musl.tar.gz" | tar -xz -C "$HOME/.local/bin" just', // every OS not listed
				macos: "brew install just",
				windows: false, // explicitly unavailable
			},
			check: { command: "just --version", pattern: "(\\d+\\.\\d+\\.\\d+)" }, // default "{{name}} --version"
			dependsOn: ["curl"],
			env: [{ path: "$HOME/.local/bin" }],
		},
	},
});
```

`os` keys: `all`, `linux-apt`, `linux-dnf`, `linux-pacman`, `macos`, `windows`. An OS key overrides `all`, `false` makes the dep unavailable there, and a missing key without `all` means unavailable.

Templates in `os` commands and `check.command`: `{{name}}`, `{{version}}`, `{{major}}` (the first dot segment) and `{{arch}}` (`arm64`, else `amd64`).

`check.pattern` is a regex source whose first capture is the version, for tools whose output the default rule misreads.

## `env`

| Entry                                                                                                       | Writes                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `{ path: "$HOME/tool/bin" }`                                                                                | The directory first on PATH, so the pinned binary wins                             |
| `{ key: "GOPATH", value: "$HOME/go" }`                                                                      | The variable                                                                       |
| `{ key: "ANDROID_HOME", detect: ["$HOME/Android/Sdk", "/opt/android-sdk"], fallback: "$HOME/Android/Sdk" }` | The first `detect` path that exists, else `fallback`. Nothing when neither applies |

Values are written as-is; the shell expands `$HOME`. `detect` paths expand `$VAR`, `${VAR}` and `%VAR%` from the environment to test for existence.

## Validation

The config is validated before anything installs. Every problem is listed with its path:

```
Invalid system config:
  - deps.go.verison: unknown key (allowed: check, dependsOn, description, env, os, required, version)
  - deps.tool.os: must name at least one OS key or all
  - deps.tool.env[0]: appendToPath is gone; use { path: "/opt/tool/bin" } (it goes first on PATH)
```

A `dependsOn` name missing from the config and a dependency cycle (`dependency cycle: a → b → a`) are errors too.
