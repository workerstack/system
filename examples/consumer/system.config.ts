import { defineConfig } from "@workerstack/system"

/**
 * The whole workerstack catalog at the versions the workerstack repos pin. Built-ins take a version only;
 * brew and choco are added because other deps need them. just shows the custom form, atlas an override.
 */
export default defineConfig({
	deps: {
		/* runtimes: bun is the package manager */
		bun: "1.4.4",
		deno: "2.9.8",
		node: "24.21.0",

		/* every language the generated clients target */
		dotnet: "10.0.402",
		go: "1.27.2",
		"google-java-format": "1.37.0",
		gradle: "9.8.2",
		java: "21",
		mypy: "2.4.0",
		python: "3.14.8",
		ruff: "0.17.1",
		rust: "1.99.1",
		uv: "0.13.1",

		/* release and CI */
		cosign: "3.1.4",
		curl: "latest",
		gh: "2.102.0",
		git: "latest",
		goreleaser: "2.18.3",
		jq: "1.8.2",
		pwsh: "7.6.6",
		shellcheck: "0.11.0",

		/* cloudflare */
		cf: "1.0.0-beta.12",
		cloudflared: "2026.9.3",

		/* database */
		atlas: {
			description: "Atlas: after an upgrade, rehash every migrations dir and confirm atlas.sum is unchanged",
			version: "1.3.0",
		},
		sqld: "0.24.32",

		/* payments */
		stripe: "1.55.10",

		/* containers and browsers */
		chromium: "latest",
		docker: "latest",
		lightpanda: "latest",
		playwright: "1.65.0",

		/* agents */
		claude: "latest",
		codex: "0.160.0",
		ffmpeg: { required: false, version: "latest" },
		grok: "latest",
		rtk: "0.51.0",
		"sherpa-onnx": "2.0.1",

		/* not a workerstack tool: the full custom form, unchanged */
		just: {
			description: "just, a command runner for project recipes",
			os: {
				/* just names CPUs x86_64 and aarch64; macOS reports arm64 */
				all: 'tmp="$(mktemp -d)" && curl -fsSL "https://github.com/casey/just/releases/download/{{version}}/just-{{version}}-$(uname -m)-unknown-linux-musl.tar.gz" | tar -xz -C "$tmp" && mkdir -p "$HOME/.local/bin" && install -m 755 "$tmp/just" "$HOME/.local/bin/just" && rm -rf "$tmp"',
				macos:
					'tmp="$(mktemp -d)" && curl -fsSL "https://github.com/casey/just/releases/download/{{version}}/just-{{version}}-$(uname -m | sed s/arm64/aarch64/)-apple-darwin.tar.gz" | tar -xz -C "$tmp" && mkdir -p "$HOME/.local/bin" && install -m 755 "$tmp/just" "$HOME/.local/bin/just" && rm -rf "$tmp"',
				windows: false,
			},
			required: false,
			version: "1.59.0",
		},
	},
})
