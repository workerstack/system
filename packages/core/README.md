# @workerstack/system

Formerly [`@lovrozagar/crossdeps`](https://www.npmjs.com/package/@lovrozagar/crossdeps). Same code and history, new name.

Every OS dependency a workerstack repo needs, from one config file. Name a built-in tool and its version, `go: "1.27.2"`, and `system install` installs it on macOS, Linux (apt, dnf, pacman) and Windows, puts it first on PATH, and `system check` verifies the version. Anything outside the catalog keeps the full custom form with your own commands.

This README is the full usage contract. Agents: read it end to end before writing a config or running the CLI.

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Built-in catalog](#built-in-catalog)
- [Config](#config)
- [CLI](#cli)
- [Versions](#versions)
- [Shell environment](#shell-environment)
- [Library API](#library-api)
- [Gotchas](#gotchas)

## Requirements

| Need | Detail                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun  | The CLI is TypeScript with `#!/usr/bin/env bun`. bun is the only supported package manager.                                                 |
| OS   | macOS, Linux with apt, dnf or pacman, Windows (PowerShell).                                                                                 |
| CPU  | Built-ins ship x64 and arm64 recipes. Custom deps run anywhere.                                                                             |
| sudo | Only OS packages use it (`git`, `curl`, `chromium`, `ffmpeg`, `docker` on Linux, playwright's apt deps). Everything else installs per user. |

## Quick start

```bash
bun add -d @workerstack/system
```

`system.config.ts`:

```ts
import { defineConfig } from "@workerstack/system"

export default defineConfig({
	deps: {
		bun: "1.4.4",
		go: "1.27.2",
		uv: "0.13.1",
		ruff: "0.17.1",
		java: "21",
		ffmpeg: { required: false, version: "latest" },
		stripe: "1.55.10",
		just: {
			description: "just, a command runner",
			os: { macos: "brew install just", windows: false },
			required: false,
			version: "latest",
		},
	},
})
```

```bash
bunx system install          # everything, prerequisites first
bunx system check            # installed vs pinned, exit 1 when a required dep is missing
bunx system install go --upgrade
bunx system list             # the built-in catalog
```

## Built-in catalog

A built-in takes only a version. The catalog supplies install commands for every OS and CPU, the version check, PATH entries and prerequisites. `system list` prints this table.

| Name                 | Group      | Version         | Where                   | What                                                                                                                 |
| -------------------- | ---------- | --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `brew`               | bootstrap  | `latest` only   | macOS                   | Homebrew, the macOS package manager.                                                                                 |
| `choco`              | bootstrap  | `latest` only   | Windows                 | Chocolatey, the Windows package manager (needs an admin shell).                                                      |
| `bun`                | runtimes   | exact pin       | all                     | Bun: runtime and the only package manager (its version also pins packageManager).                                    |
| `deno`               | runtimes   | exact pin       | all                     | Deno, for the generated TypeScript SDK checks.                                                                       |
| `node`               | runtimes   | exact pin       | all                     | Node.js runtime, for tools that need it (bun stays the package manager).                                             |
| `dotnet`             | languages  | exact pin       | all                     | .NET SDK, for the generated C# SDK (dotnet format included).                                                         |
| `go`                 | languages  | exact pin       | all                     | Go toolchain (gofmt included), for the generated Go SDK and CLI.                                                     |
| `google-java-format` | languages  | exact pin       | all                     | google-java-format, the generated Java SDK's formatter. Needs `java`.                                                |
| `gradle`             | languages  | exact pin       | all                     | Gradle, the generated Java SDK's build. Needs `java`.                                                                |
| `java`               | languages  | exact pin       | all                     | Eclipse Temurin JDK: a feature major (21) or an exact release (21.0.13+9).                                           |
| `mypy`               | languages  | exact pin       | all                     | mypy, the generated Python SDK's type check (uv tool). Needs `uv`.                                                   |
| `python`             | languages  | exact pin       | all                     | Python, managed by uv (python and python3 shims). Needs `uv`.                                                        |
| `ruff`               | languages  | exact pin       | all                     | ruff, the generated Python SDK's formatter and linter (uv tool). Needs `uv`.                                         |
| `rust`               | languages  | exact pin       | all                     | Rust via rustup (rustfmt and clippy), for the generated Rust SDK.                                                    |
| `uv`                 | languages  | exact pin       | all                     | uv, the Python toolchain manager.                                                                                    |
| `curl`               | release    | `latest` only   | all                     | HTTP client the install commands use (the OS package manager's current build). Needs `brew`, `choco`.                |
| `git`                | release    | `latest` only   | all                     | Version control (the OS package manager's current build). Needs `brew`, `choco`.                                     |
| `gh`                 | release    | exact pin       | all                     | GitHub CLI, for releases, PRs and the API.                                                                           |
| `goreleaser`         | release    | exact pin       | all                     | Release automation for the generated Go CLI.                                                                         |
| `cosign`             | release    | exact pin       | all                     | Sigstore signing for release artifacts.                                                                              |
| `jq`                 | release    | exact pin       | all                     | JSON processor.                                                                                                      |
| `pwsh`               | release    | exact pin       | all                     | PowerShell 7, for the generated Windows install scripts.                                                             |
| `shellcheck`         | release    | exact pin       | all                     | Shell script linter, for the generated install scripts.                                                              |
| `cf`                 | cloudflare | exact pin       | all                     | Cloudflare CLI: deploy, workers types, account operations (bun global, runs on node). Needs `bun`, `node`.           |
| `cloudflared`        | cloudflare | exact pin       | all                     | Cloudflare Tunnel client, for remote bindings.                                                                       |
| `atlas`              | database   | exact pin       | all                     | Atlas schema migrations.                                                                                             |
| `sqld`               | database   | exact pin       | apt, dnf, pacman, macOS | libSQL server, for local database tests (no Windows build).                                                          |
| `stripe`             | payments   | exact pin       | all                     | Stripe CLI, for local webhooks, fixtures and API calls.                                                              |
| `chromium`           | browsers   | `latest` only   | apt, dnf, pacman        | Chromium, the browser rail fallback (Linux only: brew and choco ship no usable build).                               |
| `docker`             | browsers   | `latest` only   | all                     | Container engine with its daemon (Docker Engine on Linux, Docker Desktop elsewhere). Needs `brew`, `choco`.          |
| `lightpanda`         | browsers   | `latest` only   | apt, dnf, pacman, macOS | Lightpanda, the default headless browser rail (nightly; no Windows build).                                           |
| `playwright`         | browsers   | exact pin       | all                     | Playwright's Chromium for browser tests (version = your @playwright/test). Needs `bun`.                              |
| `claude`             | agents     | pin or `latest` | all                     | Claude Code CLI (native installer; self-updates unless DISABLE_AUTOUPDATER=1).                                       |
| `codex`              | agents     | exact pin       | all                     | OpenAI Codex CLI (bun global, runs on node). Needs `bun`, `node`.                                                    |
| `ffmpeg`             | agents     | `latest` only   | all                     | ffmpeg, for /listen mic capture and /speak playback (the OS package manager's current build). Needs `brew`, `choco`. |
| `grok`               | agents     | pin or `latest` | all                     | Grok Build CLI by xAI (native installer).                                                                            |
| `rtk`                | agents     | exact pin       | all                     | rtk, shell output compression behind the agent Bash hook.                                                            |
| `sherpa-onnx`        | agents     | exact pin       | all                     | sherpa-onnx, free local speech-to-text and text-to-speech for /listen and /speak (onnxruntime bundled).              |

Where things land:

- Single binaries: `$HOME/.local/bin`, or `%LOCALAPPDATA%\bin` on Windows (added to the user PATH).
- Toolchains that need their files together (go, node, java, gradle, dotnet, pwsh, sherpa-onnx): `$HOME/.local/share/<tool>`, or `%LOCALAPPDATA%\Programs\<tool>`.
- Installers with their own home keep it: bun `~/.bun`, deno `~/.deno`, rust `~/.cargo`, grok `~/.grok`, claude and uv's Python and tools `~/.local/bin`.
- Global JS CLIs (`cf`, `codex`) install with `bun i -g` into `~/.bun/bin`; their launchers run on `node`.

Version policy, checked when the config loads:

- **exact pin**: `"latest"` is an error.
- **`latest` only**: the source cannot pin (OS package managers, nightly builds). Any other version is an error.
- **pin or `latest`**: either.

Prerequisites: a built-in that needs `brew` or `choco` gets it added automatically. Any other missing prerequisite is an error that names the fix:

```
Invalid system config:
  - deps.ruff: needs uv; add uv: "<version>"
```

## Config

### Discovery

`system.config.ts`, `system.config.js` or `system.config.mjs` in the working directory, or `--config <path>`. Export the config as `export default defineConfig(...)`, or as any named export holding `deps`.

| Field             | Type   | Default          | Meaning                                                                                  |
| ----------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `deps`            | object | required         | One entry per dependency, by name                                                        |
| `packageJsonPath` | string | `"package.json"` | The package.json whose `packageManager` follows the bun pin, relative to the config file |

### Entry forms

A built-in name takes one of two forms:

```ts
go: "1.27.2"

go: {
	version: "1.27.2",
	required: false,                       // default true
	description: "Go for the CLI",          // replaces the catalog's
	os: { windows: false },                // merges per OS key over the catalog's commands
	check: { command: "go version" },      // replaces
	env: [{ path: "/opt/go/bin" }],        // replaces
	dependsOn: [],                         // replaces
}
```

Any other name is a custom dep and needs the full form. `defineConfig` checks each key: a version string under a custom name is a type error.

```ts
just: {
	description: "just, a command runner",          // required
	version: "1.59.0",                              // required; "latest" allowed
	required: false,                                // required
	os: {                                           // required, at least one key
		all: "curl … {{version}} …",                  // every OS not listed
		macos: "brew install just",
		windows: false,                               // explicitly unavailable
	},
	check: { command: "just --version", pattern: "(\\d+\\.\\d+\\.\\d+)" }, // default "{{name}} --version"
	dependsOn: ["curl"],
	env: [{ path: "$HOME/.just/bin" }],
}
```

`os` keys: `all`, `linux-apt`, `linux-dnf`, `linux-pacman`, `macos`, `windows`. An OS key overrides `all`, `false` makes the dep unavailable there, and a missing key without `all` means unavailable.

Templates in `os` commands and `check.command`: `{{name}}`, `{{version}}`, `{{major}}` (the first dot segment) and `{{arch}}` (`arm64`, else `amd64`).

`check.pattern` is a regex source whose first capture is the version, for tools whose output the default rule misreads.

### `env`

| Entry                                                                                                       | Writes                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `{ path: "$HOME/tool/bin" }`                                                                                | The directory first on PATH, so the pinned binary wins                             |
| `{ key: "GOPATH", value: "$HOME/go" }`                                                                      | The variable                                                                       |
| `{ key: "ANDROID_HOME", detect: ["$HOME/Android/Sdk", "/opt/android-sdk"], fallback: "$HOME/Android/Sdk" }` | The first `detect` path that exists, else `fallback`. Nothing when neither applies |

Values are written as-is; the shell expands `$HOME`. `detect` paths expand `$VAR`, `${VAR}` and `%VAR%` from the environment to test for existence.

### Validation

The config is validated before anything installs. Every problem is listed with its path:

```
Invalid system config:
  - deps.go.verison: unknown key (allowed: check, dependsOn, description, env, os, required, version)
  - deps.tool.os: must name at least one OS key or all
  - deps.tool.env[0]: appendToPath is gone; use { path: "/opt/tool/bin" } (it goes first on PATH)
```

A `dependsOn` name missing from the config and a dependency cycle (`dependency cycle: a → b → a`) are errors too.

## CLI

```
system <command> [args] [flags]
```

| Command          | Does                                                                                |
| ---------------- | ----------------------------------------------------------------------------------- |
| `install`        | Install every dep for this OS, prerequisites first                                  |
| `install <name>` | Install one dep                                                                     |
| `check`          | Report installed vs pinned for every dep, plus `packageManager` against the bun pin |
| `check <name>`   | Report one dep                                                                      |
| `env`            | Write every dep's env block into the shell rc files                                 |
| `sync-pm`        | Set package.json `packageManager` to `bun@<bun pin>`, keeping its formatting        |
| `list`           | Print the built-in catalog                                                          |

| Flag              | Meaning                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| `--config <path>` | Config file instead of discovery                                                      |
| `--os <target>`   | Use another OS's command set (or set `WORKERSTACK_SYSTEM_OS`). For dry-runs and tests |
| `--dry-run`       | Print the install commands without running them                                       |
| `--upgrade`       | Reinstall a dep whose installed version does not match                                |
| `--here`          | `check` with this process's PATH instead of a new interactive shell's                 |

`install` skips a dep already at the pinned version. A present but mismatched dep is skipped with a `run: system install <name> --upgrade` hint unless `--upgrade` is set. After a successful install, the dep's env block is written, and a warning appears if another binary still wins on PATH.

`check` reads PATH from a new interactive shell (`bash -ic`, `zsh -lic`, Windows PowerShell with its profile), so it sees what a fresh terminal sees, including blocks `install` just wrote. If that shell cannot start, it falls back to this process's PATH with one warning. A check command that runs longer than 30 seconds is killed and reported.

Exit codes:

| Command   | 0                                                    | 1                                                    |
| --------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `install` | every required dep installed, skipped or unavailable | a required dep failed                                |
| `check`   | no required dep missing (mismatches only warn)       | a required dep is missing                            |
| `env`     | every block written                                  | a dep's variables could not be resolved              |
| `sync-pm` | updated, already correct, or skipped                 | package.json could not be read or written            |
| any       |                                                      | bad flag, unknown command, missing or invalid config |

## Versions

The installed version is the first `N.N…` in the check output, or `check.pattern`'s capture. It matches the pin when:

- the pin is `latest`;
- the pin's dot segments prefix the installed ones: `22` matches `22.20.0`, and `1.27.1` matches `1.27.1` but never `1.27.10`;
- a prerelease (`-beta.12`) is exact on both sides;
- build metadata (`+9`) on the installed side is ignored unless the pin has some, so `java: "21"` matches `21.0.13+9`.

## Shell environment

`env` and `install` write one managed block per dep:

```bash
# go environment (managed by @workerstack/system)
export PATH="$HOME/.local/share/go/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"
# end go environment
```

| Shell      | File                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| bash       | `~/.bashrc`                                                                             |
| zsh        | `~/.zshrc`                                                                              |
| fish       | `$XDG_CONFIG_HOME/fish/conf.d/workerstack-system.fish` (default `~/.config/fish/...`)   |
| PowerShell | both `Documents\PowerShell\` (pwsh 7) and `Documents\WindowsPowerShell\` (5.1) profiles |

Rewriting a block replaces it in place, and re-running is idempotent. A block written by `crossdeps` (`(managed by crossdeps)`) is replaced, never duplicated.

## Library API

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

## Gotchas

- `choco` and the Windows `choco install` recipes need an admin shell.
- `docker` on Linux adds you to the `docker` group. Log out and back in before using it without sudo.
- `playwright` installs OS libraries only on apt (`--with-deps`); on dnf, pacman, macOS and Windows it installs the browser alone.
- `claude` and `grok` update themselves. Pin them only when you need a fixed version, and set `DISABLE_AUTOUPDATER=1` for claude.
- `chromium` is Linux-only, and on Ubuntu apt hands it to snap.
- A new terminal (or `source` of the rc file) picks up PATH changes; `system check` already reads a new shell's PATH.

## Changelog

[CHANGELOG.md](./CHANGELOG.md)

## License

MIT
