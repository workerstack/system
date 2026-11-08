# Changelog

## Unreleased

### Breaking

- `env` entries are `{ path }`, `{ key, value }` or `{ key, detect, fallback? }`. `appendToPath` is gone: `{ path: "<dir>" }` puts the directory first on PATH, so the pinned binary wins over one already installed. A config still using `appendToPath` fails with the replacement spelled out
- Configs are validated on load. Unknown keys, wrong types and missing fields fail before anything installs, every problem listed with its path (`deps.go.verison: unknown key`)
- `dependsOn` naming a dep missing from the config, and dependency cycles, fail with the dep or the cycle named instead of a warning
- Unknown flags fail instead of being ignored
- `commandLookup` is no longer exported; `whichBinary` and `commandExists` cover it

### Fixed

- Version matching compared substrings, so `1.0.0` matched `11.0.0` and `1.2` matched `1.27.1`. Expected dot segments must now prefix the installed ones (`22` matches `22.20.0`, `1.27.1` never matches `1.27.10`), and a prerelease or build tag must match exactly
- `check.pattern` (a regex with one capture) parses versions the default rule misreads
- A check command that hangs is killed after 30s and reported as `check timed out` instead of hanging the run
- `sync-pm` parses `package.json` and keeps its indent, line endings, trailing newline and key order. Compact JSON was silently left unchanged while the command reported success
- `env` expands any `$VAR`, `${VAR}` or `%VAR%` when detecting paths, not only `HOME` and `ANDROID_HOME`
- fish users get `~/.config/fish/conf.d/workerstack-system.fish` (respecting `XDG_CONFIG_HOME`) instead of `.bashrc`
- `--dry-run` reports `Planned: N` instead of counting every dep as installed
- `env` exits 1 when a dep's variables cannot be resolved
- On Windows, cmd.exe commands run through one `execFileSync`-equivalent spawn with Node's `/d /s /c` quoting

## 0.2.3 (as @workerstack/system) - 2026-11-08

First publish under the new name. `@lovrozagar/crossdeps` is deprecated and points here.

- Renamed the package to `@workerstack/system`, the bin to `system`, the config to `system.config.{ts,js,mjs}`, and the env vars to `WORKERSTACK_SYSTEM_*` (`WORKERSTACK_SYSTEM_OS`)
- Shell rc blocks are marked `(managed by @workerstack/system)`. `env` replaces an old `(managed by crossdeps)` block for the same tool instead of adding a second one

## 0.2.3 - 2026-08-20

- TTY PATH snapshot spawn no longer inherits the caller's PATH or leftover toolchain exports. Child gets HOME/SHELL/locale/TERM plus a stock PATH so interactive rc can apply the default toolchain
- `check` in a long-lived agent session matches a new TTY instead of a stale parent toolchain

## 0.2.2 - 2026-08-19

- `check` snapshots PATH from a new interactive TTY (bash: `$SHELL -ic` with stdin `/dev/null`; zsh: `$SHELL -lic`; Windows: PowerShell with profile), not a login-only shell
- Interactive rc files (`.bashrc`, `.zshrc`) now load, so version-manager PATH matches a new desktop TTY
- Spawn failure or empty PATH still falls back to this process PATH with one warning
- `--here`, `install`, and `--upgrade` still use this process PATH

## 0.2.1 - 2026-08-19

- `check` / `check <name>` snapshot PATH once from a login shell (Unix: `$SHELL -lc 'printf %s "$PATH"'`; Windows: `powershell.exe` with profile, `$env:Path`) and run every version probe with that PATH
- `check --here` uses this process PATH instead
- Login spawn failure or empty PATH falls back to this process PATH with one warning (does not crash)
- `install` / `--upgrade` still use this process PATH

## 0.2.0 - 2026-08-19

- `install --upgrade` re-runs the install command when the detected version does not match the pin (`latest` still matches any parsed version)
- `install` without `--upgrade` still skips a present binary, but mismatch now prints the resolved path and `run: crossdeps install <name> --upgrade`
- After `--upgrade`, if PATH still reports the old version, print a shadow warning (brew/nvm/fnm winning over the installer)
- `check` mismatch lines include the resolved binary path
- Export `versionsMatch` and `whichBinary`

## 0.1.0 - 2026-08-15

First public release of `@lovrozagar/crossdeps`.

- Config-driven system dependency manager (`install`, `check`, `env`, `sync-pm`)
- CLI flags: `--config`, `--os`, `--dry-run`
- OS targets: macOS, Linux (apt / dnf / pacman), Windows
- Windows: PowerShell for `irm` / `$env:` commands, `cmd.exe` otherwise
- `env` writes `~/.bashrc` / `~/.zshrc` on Unix and the PowerShell 7 profile on Windows
- Catalog proven on GitHub-hosted Ubuntu, macOS, and Windows (24/24)
