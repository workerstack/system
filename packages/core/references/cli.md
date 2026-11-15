---
description: The system CLI
order: 40
---

# CLI

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
