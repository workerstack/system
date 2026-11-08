/**
 * Cloudflare: the cf CLI and the cloudflared tunnel client.
 */

import { archive, binary, localBinEnv, pick, unix, winBinary } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const CLOUDFLARE = {
	cf: {
		dependsOn: ["bun"],
		description: "Cloudflare CLI: deploy, workers types, account operations (bun global)",
		os: ({ version }) => ({ all: `bun i -g cf@${version}` }),
		versions: "pinned",
	},
	cloudflared: {
		description: "Cloudflare Tunnel client, for remote bindings",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/cloudflare/cloudflared/releases/download/${version}/cloudflared`
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			return {
				...unix(
					binary(`${base}-linux-${a}`, "cloudflared"),
					archive(`${base}-darwin-${a}.tgz`, "cloudflared", "cloudflared"),
				),
				windows: winBinary(`${base}-windows-amd64.exe`, "cloudflared"),
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
