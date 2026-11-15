---
description: Gotchas
order: 80
---

# Gotchas

- `choco` and the Windows `choco install` recipes need an admin shell.
- `docker` on Linux adds you to the `docker` group. Log out and back in before using it without sudo.
- `playwright` installs OS libraries only on apt (`--with-deps`); on dnf, pacman, macOS and Windows it installs the browser alone.
- `claude` and `grok` update themselves. Pin them only when you need a fixed version, and set `DISABLE_AUTOUPDATER=1` for claude.
- `chromium` on Ubuntu apt hands the install to snap. On macOS and Windows it is the newest official snapshot, which never updates itself: run `install chromium --upgrade` for a new one.
- `google-chrome` on Arch builds the AUR package with `makepkg`, which refuses root. Run it as a normal user with sudo.
- Safari has no built-in. It ships with macOS, and only macOS updates change it.
- `vscode` and `t3code` update themselves, so a pin is where they start, not where they stay. `check` reports the newer version after an update.
- `vscode` refuses to run as root, so `check` finds nothing in a root shell.
- `t3code` on dnf and pacman is the release AppImage, which needs FUSE to start.
- A new terminal (or `source` of the rc file) picks up PATH changes; `system check` already reads a new shell's PATH.
