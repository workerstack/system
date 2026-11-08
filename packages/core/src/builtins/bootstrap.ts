/**
 * Package-manager bootstraps other recipes depend on: Homebrew on macOS, Chocolatey on Windows.
 * Both are `latest`-only and added automatically when a dep needs them.
 */

import { ps } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const BOOTSTRAP = {
	brew: {
		description: "Homebrew, the macOS package manager",
		/* arm64 Macs install to /opt/homebrew, which is not on the default PATH */
		env: (os) => (os === "macos" ? [{ path: "/opt/homebrew/bin" }] : []),
		os: () => ({
			"linux-apt": false,
			"linux-dnf": false,
			"linux-pacman": false,
			macos:
				'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
			windows: false,
		}),
		versions: "latest",
	},
	choco: {
		description: "Chocolatey, the Windows package manager (needs an admin shell)",
		os: () => ({
			"linux-apt": false,
			"linux-dnf": false,
			"linux-pacman": false,
			macos: false,
			windows: ps(
				"Set-ExecutionPolicy Bypass -Scope Process -Force",
				"[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072",
				"iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))",
			),
		}),
		versions: "latest",
	},
} satisfies Record<string, BuiltinDep>
