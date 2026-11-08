/**
 * Database tooling: Atlas migrations and the libSQL server.
 */

import { archive, binary, localBinEnv, pick, unix, winBinary } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const DATABASE = {
	atlas: {
		check: { command: "atlas version" },
		description: "Atlas schema migrations",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = "https://release.ariga.io/atlas/atlas"
			const a = pick(arch, { arm64: "arm64", x64: "amd64" })
			return {
				...unix(binary(`${base}-linux-${a}-v${version}`, "atlas"), binary(`${base}-darwin-${a}-v${version}`, "atlas")),
				windows: winBinary(`${base}-windows-amd64-v${version}.exe`, "atlas"),
			}
		},
		versions: "pinned",
	},
	sqld: {
		description: "libSQL server, for local database tests (no Windows build)",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/tursodatabase/libsql/releases/download/libsql-server-v${version}/libsql-server`
			const cpu = pick(arch, { arm64: "aarch64", x64: "x86_64" })
			const linux = `${cpu}-unknown-linux-gnu`
			const mac = `${cpu}-apple-darwin`
			return {
				...unix(
					archive(`${base}-${linux}.tar.xz`, `libsql-server-${linux}/sqld`, "sqld"),
					archive(`${base}-${mac}.tar.xz`, `libsql-server-${mac}/sqld`, "sqld"),
				),
				windows: false,
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
