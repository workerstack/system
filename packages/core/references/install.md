---
description: Install and quick start
order: 10
---

# @workerstack/system

Formerly [`@lovrozagar/crossdeps`](https://www.npmjs.com/package/@lovrozagar/crossdeps). Same code and history, new name.

Every OS dependency a workerstack repo needs, from one config file. Name a built-in tool and its version, `go: "1.27.2"`, and `system install` installs it on macOS, Linux (apt, dnf, pacman) and Windows, puts it first on PATH, and `system check` verifies the version. Anything outside the catalog keeps the full custom form with your own commands.

These references are the full usage contract. Agents: read them end to end before writing a config or running the CLI.

## Requirements

| Need | Detail                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun  | The CLI is TypeScript with `#!/usr/bin/env bun`. bun is the only supported package manager.                                                                                               |
| OS   | macOS, Linux with apt, dnf or pacman, Windows (PowerShell).                                                                                                                               |
| CPU  | Built-ins ship x64 and arm64 recipes. Custom deps run anywhere.                                                                                                                           |
| sudo | Only OS packages use it (`git`, `curl`, `ffmpeg`, `docker` on Linux, the Linux browsers, `vscode` and `t3code` on apt and dnf, playwright's apt deps). Everything else installs per user. |

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
