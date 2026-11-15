---
description: The built-in catalog
order: 20
---

# Built-in catalog

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
| `chromium`           | browsers   | `latest` only   | all                     | Chromium, the browser rail fallback (distro package on Linux, the official snapshot elsewhere).                      |
| `docker`             | browsers   | `latest` only   | all                     | Container engine with its daemon (Docker Engine on Linux, Docker Desktop elsewhere). Needs `brew`, `choco`.          |
| `epiphany`           | browsers   | `latest` only   | apt, dnf, pacman        | GNOME Web (Epiphany), the WebKit browser on Linux; Safari ships with macOS and cannot be installed.                  |
| `firefox`            | browsers   | `latest` only   | all                     | Mozilla Firefox (Mozilla's own APT repo on Debian and Ubuntu, never the snap). Needs `brew`, `choco`.                |
| `google-chrome`      | browsers   | `latest` only   | all                     | Google Chrome (Google's package on Linux, built from the AUR on Arch). Needs `brew`, `choco`.                        |
| `lightpanda`         | browsers   | `latest` only   | apt, dnf, pacman, macOS | Lightpanda, the default headless browser rail (nightly; no Windows build).                                           |
| `playwright`         | browsers   | exact pin       | all                     | Playwright's Chromium for browser tests (version = your @playwright/test). Needs `bun`.                              |
| `t3code`             | editors    | exact pin       | all                     | T3 Code, the desktop GUI for coding agents (pin a release; it updates itself after that).                            |
| `vscode`             | editors    | pin or `latest` | all                     | Visual Studio Code, any release or latest (it updates itself on macOS and Windows).                                  |
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
