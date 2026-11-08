/**
 * Every language the generated clients target: Go, Rust, Python, C#, Java, with their formatters.
 * (TypeScript runs on bun, in the runtimes group.)
 */

import type { OsTarget } from "../config.ts"
import {
	binary,
	LOCAL_BIN,
	LOCAL_SHARE,
	localBinEnv,
	pick,
	ps,
	tree,
	unix,
	WIN_PROGRAMS,
	winBinary,
	winPathDir,
	winTree,
} from "./recipes.ts"
import type { Arch, BuiltinDep } from "./types.ts"

/** uv puts Python and tool shims in `~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows). */
function uvBinEnv(os: OsTarget) {
	return [{ path: os === "windows" ? "$HOME\\.local\\bin" : LOCAL_BIN }]
}

/**
 * A uv command whose shims land in the bin dir `uvBinEnv` puts on PATH. On unix uv derives that dir from
 * XDG_BIN_HOME / XDG_DATA_HOME, which can point anywhere, so the dir is named explicitly.
 */
function uvCommand(variable: "UV_PYTHON_BIN_DIR" | "UV_TOOL_BIN_DIR", command: string) {
	const pinned = `${variable}="${LOCAL_BIN}" ${command}`
	return { ...unix(pinned, pinned), windows: command }
}

/** Adoptium download for a feature major (`21`, latest GA) or an exact release (`21.0.13+9`). */
function temurin(version: string, os: "linux" | "mac" | "windows", arch: Arch): string {
	const api = "https://api.adoptium.net/v3/binary"
	const a = pick(arch, { arm64: "aarch64", x64: "x64" })
	const tail = `${os}/${a}/jdk/hotspot/normal/eclipse`
	return /^\d+$/.test(version)
		? `${api}/latest/${version}/ga/${tail}`
		: `${api}/version/jdk-${encodeURIComponent(version)}/${tail}`
}

const JAVA_DIR = `${LOCAL_SHARE}/java`
/** macOS JDKs keep their home under Contents/Home. */
const javaHome = (os: OsTarget) =>
	os === "windows" ? `${WIN_PROGRAMS}\\java` : os === "macos" ? `${JAVA_DIR}/Contents/Home` : JAVA_DIR

const GJF_JAR = `${LOCAL_SHARE}/google-java-format/google-java-format.jar`

export const LANGUAGES = {
	dotnet: {
		description: ".NET SDK, for the generated C# SDK (dotnet format included)",
		env: (os) => {
			const dir = os === "windows" ? `${WIN_PROGRAMS}\\dotnet` : `${LOCAL_SHARE}/dotnet`
			return [{ key: "DOTNET_ROOT", value: dir }, { path: dir }]
		},
		os: ({ version }) => {
			const sh = `curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --version ${version} --install-dir "${LOCAL_SHARE}/dotnet" --no-path`
			return {
				...unix(sh, sh),
				windows: ps(
					'$s = Join-Path $env:TEMP "dotnet-install.ps1"',
					"Invoke-WebRequest -UseBasicParsing https://dot.net/v1/dotnet-install.ps1 -OutFile $s",
					`& $s -Version ${version} -InstallDir "${WIN_PROGRAMS}\\dotnet" -NoPath`,
					winPathDir(`${WIN_PROGRAMS}\\dotnet`),
				),
			}
		},
		versions: "pinned",
	},
	go: {
		check: { command: "go version", pattern: "go(\\d+\\.\\d+(?:\\.\\d+)?)" },
		description: "Go toolchain (gofmt included), for the generated Go SDK and CLI",
		env: (os) =>
			os === "windows"
				? [{ path: `${WIN_PROGRAMS}\\go\\bin` }, { path: "$HOME\\go\\bin" }]
				: [{ path: `${LOCAL_SHARE}/go/bin` }, { path: "$HOME/go/bin" }],
		os: ({ arch, version }) => {
			const base = `https://go.dev/dl/go${version}`
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			const dir = `${LOCAL_SHARE}/go`
			return {
				...unix(
					tree(`${base}.linux-${a}.tar.gz`, dir, { nested: true }),
					tree(`${base}.darwin-${a}.tar.gz`, dir, { nested: true }),
				),
				windows: winTree(`${base}.windows-amd64.zip`, `${WIN_PROGRAMS}\\go`, { bin: "bin", nested: true }),
			}
		},
		versions: "pinned",
	},
	"google-java-format": {
		check: { command: "google-java-format --version 2>&1" },
		dependsOn: ["java"],
		description: "google-java-format, the generated Java SDK's formatter",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/google/google-java-format/releases/download/v${version}`
			/* no native macOS x64 build: run the all-deps jar on the java dep */
			const jar = [
				`mkdir -p "$(dirname "${GJF_JAR}")" "${LOCAL_BIN}"`,
				`curl -fsSL "${base}/google-java-format-${version}-all-deps.jar" -o "${GJF_JAR}"`,
				`printf '#!/bin/sh\\nexec java -jar "${GJF_JAR}" "$@"\\n' > "${LOCAL_BIN}/google-java-format"`,
				`chmod +x "${LOCAL_BIN}/google-java-format"`,
			].join(" && ")
			return {
				...unix(
					binary(
						`${base}/google-java-format_linux-${pick(arch, { arm64: "arm64", x64: "x86-64" })}`,
						"google-java-format",
					),
					arch === "arm64" ? binary(`${base}/google-java-format_darwin-arm64`, "google-java-format") : jar,
				),
				windows: winBinary(`${base}/google-java-format_windows-x86-64.exe`, "google-java-format"),
			}
		},
		versions: "pinned",
	},
	gradle: {
		check: { command: "gradle --version", pattern: "Gradle (\\d+\\.\\d+(?:\\.\\d+)?)" },
		dependsOn: ["java"],
		description: "Gradle, the generated Java SDK's build",
		env: (os) => [{ path: os === "windows" ? `${WIN_PROGRAMS}\\gradle\\bin` : `${LOCAL_SHARE}/gradle/bin` }],
		os: ({ version }) => {
			const zip = `https://services.gradle.org/distributions/gradle-${version}-bin.zip`
			const sh = tree(zip, `${LOCAL_SHARE}/gradle`, { nested: true })
			return {
				...unix(sh, sh),
				windows: winTree(zip, `${WIN_PROGRAMS}\\gradle`, { bin: "bin", nested: true }),
			}
		},
		versions: "pinned",
	},
	java: {
		/* `java -version` prints to stderr; the build line carries the full release (21.0.13+9) */
		check: { command: "java -version 2>&1", pattern: "build (\\d+[\\d.]*\\+\\d+)" },
		description: "Eclipse Temurin JDK: a feature major (21) or an exact release (21.0.13+9)",
		env: (os) => [
			{ key: "JAVA_HOME", value: javaHome(os) },
			{ path: os === "windows" ? `${javaHome(os)}\\bin` : `${javaHome(os)}/bin` },
		],
		os: ({ arch, version }) => ({
			...unix(
				tree(temurin(version, "linux", arch), JAVA_DIR, { nested: true }),
				tree(temurin(version, "mac", arch), JAVA_DIR, { nested: true }),
			),
			windows: winTree(temurin(version, "windows", arch), `${WIN_PROGRAMS}\\java`, { bin: "bin", nested: true }),
		}),
		versions: "pinned",
	},
	mypy: {
		dependsOn: ["uv"],
		description: "mypy, the generated Python SDK's type check (uv tool)",
		env: uvBinEnv,
		os: ({ version }) => uvCommand("UV_TOOL_BIN_DIR", `uv tool install --force mypy==${version}`),
		versions: "pinned",
	},
	python: {
		check: { command: "python --version" },
		dependsOn: ["uv"],
		description: "Python, managed by uv (python and python3 shims)",
		env: uvBinEnv,
		os: ({ version }) => uvCommand("UV_PYTHON_BIN_DIR", `uv python install ${version} --default`),
		versions: "pinned",
	},
	ruff: {
		dependsOn: ["uv"],
		description: "ruff, the generated Python SDK's formatter and linter (uv tool)",
		env: uvBinEnv,
		os: ({ version }) => uvCommand("UV_TOOL_BIN_DIR", `uv tool install --force ruff==${version}`),
		versions: "pinned",
	},
	rust: {
		check: { command: "rustc --version" },
		description: "Rust via rustup (rustfmt and clippy), for the generated Rust SDK",
		env: (os) => [{ path: os === "windows" ? "$HOME\\.cargo\\bin" : "$HOME/.cargo/bin" }],
		os: ({ arch, version }) => {
			const flags = `-y --default-toolchain ${version} --profile minimal -c rustfmt -c clippy`
			return {
				...unix(
					`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- ${flags} --no-modify-path`,
					`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- ${flags} --no-modify-path`,
				),
				/* rustup-init adds cargo\bin to the user PATH itself on Windows */
				windows: ps(
					'$r = Join-Path $env:TEMP "rustup-init.exe"',
					`Invoke-WebRequest -UseBasicParsing "https://static.rust-lang.org/rustup/dist/${pick(arch, { arm64: "aarch64", x64: "x86_64" })}-pc-windows-msvc/rustup-init.exe" -OutFile $r`,
					`& $r ${flags}`,
					"if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
				),
			}
		},
		versions: "pinned",
	},
	uv: {
		description: "uv, the Python toolchain manager",
		env: localBinEnv,
		os: ({ version }) => ({
			...unix(
				`curl -LsSf https://astral.sh/uv/${version}/install.sh | env UV_INSTALL_DIR="${LOCAL_BIN}" UV_NO_MODIFY_PATH=1 sh`,
				`curl -LsSf https://astral.sh/uv/${version}/install.sh | env UV_INSTALL_DIR="${LOCAL_BIN}" UV_NO_MODIFY_PATH=1 sh`,
			),
			windows: ps(
				winPathDir("$env:LOCALAPPDATA\\bin"),
				'$env:UV_INSTALL_DIR = "$env:LOCALAPPDATA\\bin"',
				'$env:UV_NO_MODIFY_PATH = "1"',
				`irm https://astral.sh/uv/${version}/install.ps1 | iex`,
			),
		}),
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
