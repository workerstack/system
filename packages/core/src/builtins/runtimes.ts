/**
 * JavaScript runtimes. bun is the package manager; node and deno are runtimes only.
 */

import { LOCAL_SHARE, pick, ps, tree, unix, winArchive, WIN_BIN, WIN_PROGRAMS, winTree } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const RUNTIMES = {
	bun: {
		description: "Bun: runtime and the only package manager (its version also pins packageManager)",
		env: (os) => [{ path: os === "windows" ? "$HOME\\.bun\\bin" : "$HOME/.bun/bin" }],
		os: ({ version }) => ({
			...unix(
				`curl -fsSL https://bun.sh/install | bash -s "bun-v${version}"`,
				`curl -fsSL https://bun.sh/install | bash -s "bun-v${version}"`,
			),
			windows: ps(`& ([scriptblock]::Create((irm https://bun.sh/install.ps1))) -Version ${version}`),
		}),
		versions: "pinned",
	},
	deno: {
		description: "Deno, for the generated TypeScript SDK checks",
		env: (os) => (os === "windows" ? [{ path: WIN_BIN }] : [{ path: "$HOME/.deno/bin" }]),
		os: ({ version }) => {
			const zip = `https://dl.deno.land/release/v${version}/deno-x86_64-pc-windows-msvc.zip`
			return {
				/* CI=1 keeps the installer from prompting for shell setup */
				...unix(
					`curl -fsSL https://deno.com/install.sh | CI=1 sh -s v${version}`,
					`curl -fsSL https://deno.com/install.sh | CI=1 sh -s v${version}`,
				),
				windows: winArchive(zip, "deno.exe", "deno"),
			}
		},
		versions: "pinned",
	},
	node: {
		description: "Node.js runtime, for tools that need it (bun stays the package manager)",
		env: (os) => [{ path: os === "windows" ? `${WIN_PROGRAMS}\\node` : `${LOCAL_SHARE}/node/bin` }],
		os: ({ arch, version }) => {
			const base = `https://nodejs.org/dist/v${version}/node-v${version}`
			const a = pick(arch, { arm64: "arm64", x64: "x64" })
			const dir = `${LOCAL_SHARE}/node`
			return {
				...unix(
					tree(`${base}-linux-${a}.tar.xz`, dir, { nested: true }),
					tree(`${base}-darwin-${a}.tar.gz`, dir, { nested: true }),
				),
				windows: winTree(`${base}-win-x64.zip`, `${WIN_PROGRAMS}\\node`, { nested: true }),
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
