---
description: Shell environment and PATH
order: 60
---

# Shell environment

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
