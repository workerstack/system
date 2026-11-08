/**
 * Release and CI tooling: git, gh, jq, curl, goreleaser, cosign, shellcheck, pwsh.
 */

import { archive, binary, localBinEnv, pick, tree, unix, winArchive, winBinary, winTree } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

const GH = "https://github.com"

export const RELEASE = {
	curl: {
		dependsOn: ["brew", "choco"],
		description: "HTTP client the install commands use (the OS package manager's current build)",
		os: () => ({
			"linux-apt": "sudo apt-get install -y curl",
			"linux-dnf": "sudo dnf install -y curl",
			"linux-pacman": "sudo pacman -S --noconfirm curl",
			macos: "brew install curl",
			windows: "choco install curl -y",
		}),
		versions: "latest",
	},
	git: {
		dependsOn: ["brew", "choco"],
		description: "Version control (the OS package manager's current build)",
		os: () => ({
			"linux-apt": "sudo apt-get install -y git",
			"linux-dnf": "sudo dnf install -y git",
			"linux-pacman": "sudo pacman -S --noconfirm git",
			macos: "brew install git",
			windows: "choco install git -y",
		}),
		versions: "latest",
	},
	gh: {
		description: "GitHub CLI, for releases, PRs and the API",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			const base = `${GH}/cli/cli/releases/download/v${version}/gh_${version}`
			return {
				...unix(
					archive(`${base}_linux_${a}.tar.gz`, `gh_${version}_linux_${a}/bin/gh`, "gh"),
					archive(`${base}_macOS_${a}.zip`, `gh_${version}_macOS_${a}/bin/gh`, "gh"),
				),
				windows: winArchive(`${base}_windows_amd64.zip`, "bin\\gh.exe", "gh"),
			}
		},
		versions: "pinned",
	},
	goreleaser: {
		check: { command: "goreleaser --version", pattern: "GitVersion:\\s+v?(\\d+\\.\\d+\\.\\d+)" },
		description: "Release automation for the generated Go CLI",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `${GH}/goreleaser/goreleaser/releases/download/v${version}/goreleaser`
			const a = pick(arch, { arm64: "arm64", x64: "x86_64" })
			return {
				...unix(
					archive(`${base}_Linux_${a}.tar.gz`, "goreleaser", "goreleaser"),
					archive(`${base}_Darwin_${a}.tar.gz`, "goreleaser", "goreleaser"),
				),
				windows: winArchive(`${base}_Windows_x86_64.zip`, "goreleaser.exe", "goreleaser"),
			}
		},
		versions: "pinned",
	},
	cosign: {
		check: { command: "cosign version", pattern: "GitVersion:\\s+v?(\\d+\\.\\d+\\.\\d+)" },
		description: "Sigstore signing for release artifacts",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `${GH}/sigstore/cosign/releases/download/v${version}/cosign`
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			return {
				...unix(binary(`${base}-linux-${a}`, "cosign"), binary(`${base}-darwin-${a}`, "cosign")),
				windows: winBinary(`${base}-windows-amd64.exe`, "cosign"),
			}
		},
		versions: "pinned",
	},
	jq: {
		description: "JSON processor",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `${GH}/jqlang/jq/releases/download/jq-${version}/jq`
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			return {
				...unix(binary(`${base}-linux-${a}`, "jq"), binary(`${base}-macos-${a}`, "jq")),
				windows: winBinary(`${base}-windows-amd64.exe`, "jq"),
			}
		},
		versions: "pinned",
	},
	pwsh: {
		check: { command: "pwsh --version" },
		description: "PowerShell 7, for the generated Windows install scripts",
		env: (os) => (os === "windows" ? [{ path: "$env:LOCALAPPDATA\\Programs\\pwsh" }] : localBinEnv(os)),
		os: ({ arch, version }) => {
			const base = `${GH}/PowerShell/PowerShell/releases/download/v${version}`
			const a = pick(arch, { arm64: "arm64", x64: "x64" })
			const dir = "$HOME/.local/share/pwsh"
			const linux = `${tree(`${base}/powershell-${version}-linux-${a}.tar.gz`, dir, { bins: ["pwsh"] })} && chmod +x "${dir}/pwsh"`
			return {
				...unix(
					linux,
					`${tree(`${base}/powershell-${version}-osx-${a}.tar.gz`, dir, { bins: ["pwsh"] })} && chmod +x "${dir}/pwsh"`,
				),
				/* Fedora images lack the ICU library PowerShell needs at startup */
				"linux-dnf": `sudo dnf install -y libicu && ${linux}`,
				windows: winTree(`${base}/PowerShell-${version}-win-x64.zip`, "$env:LOCALAPPDATA\\Programs\\pwsh"),
			}
		},
		versions: "pinned",
	},
	shellcheck: {
		description: "Shell script linter, for the generated install scripts",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `${GH}/koalaman/shellcheck/releases/download/v${version}/shellcheck-v${version}`
			const a = pick(arch, { arm64: "aarch64", x64: "x86_64" })
			const member = `shellcheck-v${version}/shellcheck`
			return {
				...unix(
					archive(`${base}.linux.${a}.tar.xz`, member, "shellcheck"),
					archive(`${base}.darwin.${a}.tar.xz`, member, "shellcheck"),
				),
				windows: winArchive(`${base}.zip`, "shellcheck.exe", "shellcheck"),
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
