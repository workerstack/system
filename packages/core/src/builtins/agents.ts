/**
 * Agent tooling: claude, codex, grok, rtk, plus ffmpeg and sherpa-onnx for /listen and /speak.
 */

import {
	archive,
	bunGlobal,
	LOCAL_BIN,
	LOCAL_SHARE,
	localBinEnv,
	pick,
	ps,
	tree,
	unix,
	WIN_PROGRAMS,
	winArchive,
	winTree,
} from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

/** The installer's version argument: none for latest, so it takes its default channel. */
function versionArg(version: string, flag = ""): string {
	return version === "latest" ? "" : ` ${flag}${version}`
}

export const AGENTS = {
	claude: {
		description: "Claude Code CLI (native installer; self-updates unless DISABLE_AUTOUPDATER=1)",
		env: (os) => [{ path: os === "windows" ? "$HOME\\.local\\bin" : LOCAL_BIN }],
		os: ({ version }) => ({
			...unix(
				`curl -fsSL https://claude.ai/install.sh | bash -s${versionArg(version)}`,
				`curl -fsSL https://claude.ai/install.sh | bash -s${versionArg(version)}`,
			),
			windows: ps(`& ([scriptblock]::Create((irm https://claude.ai/install.ps1)))${versionArg(version)}`),
		}),
		versions: "any",
	},
	codex: {
		/* installed by bun; its launcher is a node script */
		dependsOn: ["bun", "node"],
		description: "OpenAI Codex CLI (bun global, runs on node)",
		os: ({ version }) => bunGlobal("@openai/codex", version),
		versions: "pinned",
	},
	ffmpeg: {
		check: { command: "ffmpeg -version" },
		dependsOn: ["brew", "choco"],
		description: "ffmpeg, for /listen mic capture and /speak playback (the OS package manager's current build)",
		os: () => ({
			"linux-apt": "sudo apt-get install -y ffmpeg",
			"linux-dnf": "sudo dnf install -y ffmpeg-free",
			"linux-pacman": "sudo pacman -S --noconfirm ffmpeg",
			macos: "brew install ffmpeg",
			windows: "choco install ffmpeg -y",
		}),
		versions: "latest",
	},
	grok: {
		description: "Grok Build CLI by xAI (native installer)",
		env: (os) => [{ path: os === "windows" ? "$HOME\\.grok\\bin" : "$HOME/.grok/bin" }],
		os: ({ version }) => ({
			...unix(
				`curl -fsSL https://x.ai/cli/install.sh | bash -s${versionArg(version)}`,
				`curl -fsSL https://x.ai/cli/install.sh | bash -s${versionArg(version)}`,
			),
			windows: ps(`& ([scriptblock]::Create((irm https://x.ai/cli/install.ps1)))${versionArg(version, "-Version ")}`),
		}),
		versions: "any",
	},
	rtk: {
		description: "rtk, shell output compression behind the agent Bash hook",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/rtk-ai/rtk/releases/download/v${version}/rtk`
			/* x64 Linux ships a static musl build; arm64 Linux only a glibc one */
			const linux = pick(arch, { arm64: "aarch64-unknown-linux-gnu", x64: "x86_64-unknown-linux-musl" })
			const mac = pick(arch, { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" })
			return {
				...unix(archive(`${base}-${linux}.tar.gz`, "rtk", "rtk"), archive(`${base}-${mac}.tar.gz`, "rtk", "rtk")),
				windows: winArchive(`${base}-x86_64-pc-windows-msvc.zip`, "rtk.exe", "rtk"),
			}
		},
		versions: "pinned",
	},
	"sherpa-onnx": {
		check: { command: "sherpa-onnx-version" },
		description:
			"sherpa-onnx, free local speech-to-text and text-to-speech for /listen and /speak (onnxruntime bundled)",
		env: (os) => [{ path: os === "windows" ? `${WIN_PROGRAMS}\\sherpa-onnx\\bin` : `${LOCAL_SHARE}/sherpa-onnx/bin` }],
		os: ({ arch, version }) => {
			const base = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${version}/sherpa-onnx-v${version}`
			/* the shared CPU builds: small, and the binaries find lib/ next to bin/; MT links the C runtime statically */
			const linux = pick(arch, { arm64: "linux-aarch64-shared-cpu", x64: "linux-x64-shared" })
			const mac = pick(arch, { arm64: "osx-arm64-shared", x64: "osx-x64-shared" })
			const win = pick(arch, { arm64: "win-arm64-shared-MT-Release", x64: "win-x64-shared-MT-Release" })
			const dir = `${LOCAL_SHARE}/sherpa-onnx`
			return {
				...unix(
					tree(`${base}-${linux}.tar.bz2`, dir, { nested: true }),
					tree(`${base}-${mac}.tar.bz2`, dir, { nested: true }),
				),
				windows: winTree(`${base}-${win}.tar.bz2`, `${WIN_PROGRAMS}\\sherpa-onnx`, { bin: "bin", nested: true }),
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
