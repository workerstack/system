/**
 * Containers and browsers: docker, chromium, lightpanda, playwright.
 */

import { binary, LOCAL_BIN, localBinEnv, pick } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

/**
 * Prints the version only when Playwright's Chromium is on disk. `bunx playwright@<v> --version` alone
 * always succeeds (bunx fetches the CLI), which would make `install` skip the browser download.
 */
const PLAYWRIGHT_CHECK =
	"bun -e \"const r=Bun.spawnSync(['bunx','playwright@{{version}}','install','--dry-run','chromium']);" +
	"const m=r.stdout.toString().match(/Install location:\\s*(.+)/);" +
	"if(m&&require('fs').existsSync(m[1].trim()))console.log('{{version}}');else process.exit(1)\""

export const BROWSERS = {
	chromium: {
		description: "Chromium, the browser rail fallback (Linux only: brew and choco ship no usable build)",
		env: localBinEnv,
		os: () => ({
			"linux-apt": "sudo apt-get install -y chromium || sudo snap install chromium",
			/* Fedora names the binary chromium-browser; link the name check and the browser rail use */
			"linux-dnf": `sudo dnf install -y chromium && mkdir -p "${LOCAL_BIN}" && ln -sf /usr/bin/chromium-browser "${LOCAL_BIN}/chromium"`,
			"linux-pacman": "sudo pacman -S --noconfirm chromium",
			macos: false,
			windows: false,
		}),
		versions: "latest",
	},
	docker: {
		dependsOn: ["brew", "choco"],
		description: "Container engine with its daemon (Docker Engine on Linux, Docker Desktop elsewhere)",
		os: () => ({
			"linux-apt": 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"',
			"linux-dnf": 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"',
			"linux-pacman":
				'sudo pacman -S --noconfirm docker docker-buildx docker-compose && sudo systemctl enable --now docker.service && sudo usermod -aG docker "$USER"',
			macos: "brew install --cask docker-desktop",
			windows: "choco install docker-desktop -y",
		}),
		versions: "latest",
	},
	lightpanda: {
		check: { command: "lightpanda version" },
		description: "Lightpanda, the default headless browser rail (nightly; no Windows build)",
		env: localBinEnv,
		os: ({ arch }) => {
			const base = "https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda"
			const cpu = pick(arch, { arm64: "aarch64", x64: "x86_64" })
			const linux = binary(`${base}-${cpu}-linux`, "lightpanda")
			return {
				"linux-apt": linux,
				"linux-dnf": linux,
				"linux-pacman": linux,
				macos: binary(`${base}-${cpu}-macos`, "lightpanda"),
				windows: false,
			}
		},
		versions: "latest",
	},
	playwright: {
		check: { command: PLAYWRIGHT_CHECK },
		dependsOn: ["bun"],
		description: "Playwright's Chromium for browser tests (version = your @playwright/test)",
		os: ({ version }) => {
			const browserOnly = `bunx playwright@${version} install chromium`
			return {
				/* --with-deps installs the shared libraries through apt; other distros only get the browser */
				"linux-apt": `bunx playwright@${version} install --with-deps chromium`,
				"linux-dnf": browserOnly,
				"linux-pacman": browserOnly,
				macos: browserOnly,
				windows: browserOnly,
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
