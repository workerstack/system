/**
 * Cloudflare: the cf CLI and the cloudflared tunnel client.
 */

import { archive, binary, bunGlobal, localBinEnv, pick, unix, winBinary } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const CLOUDFLARE = {
	cf: {
		/* installed by bun; its launcher is a node script */
		dependsOn: ["bun", "node"],
		description: "Cloudflare CLI: deploy, workers types, account operations (bun global, runs on node)",
		os: ({ version }) => bunGlobal("cf", version),
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
