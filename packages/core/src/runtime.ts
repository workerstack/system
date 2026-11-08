/**
 * Every side effect the CLI performs, behind one interface. Commands take a `Runtime` and return an exit
 * code, so tests drive them with a fake and only `bin.ts` touches `process`.
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { runShellCommand } from "./exec.ts"
import { type PathSnapshot, pathEnv, snapshotTtyPath } from "./path.ts"
import { whichBinary } from "./platform.ts"

export interface CaptureResult {
	ok: boolean
	stdout: string
}

export interface Runtime {
	readonly arch: string
	readonly cwd: string
	readonly env: NodeJS.ProcessEnv
	readonly home: string
	readonly platform: NodeJS.Platform
	/** Run a check command and capture stdout. `searchPath` replaces PATH for the child. */
	capture(command: string, searchPath?: string): CaptureResult
	error(line: string): void
	exists(path: string): boolean
	importModule(path: string): Promise<Record<string, unknown>>
	log(line: string): void
	readFile(path: string): string
	/** Run an install command with inherited stdio. True on exit 0. */
	run(command: string): boolean
	ttyPath(): PathSnapshot
	warn(line: string): void
	/** Resolved path of the first token, or null. `searchPath` replaces PATH for the lookup. */
	which(token: string, searchPath?: string): string | null
	/** Write a file, creating parent directories. */
	writeFile(path: string, content: string): void
}

export function nodeRuntime(): Runtime {
	return {
		arch: process.arch,
		capture(command, searchPath) {
			try {
				const stdout = execSync(command, {
					encoding: "utf-8",
					env: searchPath === undefined ? process.env : pathEnv(searchPath),
					stdio: ["pipe", "pipe", "pipe"],
				})
				return { ok: true, stdout: stdout.trim() }
			} catch {
				return { ok: false, stdout: "" }
			}
		},
		cwd: process.cwd(),
		env: process.env,
		error: (line) => console.error(line),
		exists: (path) => existsSync(path),
		home: homedir(),
		importModule: async (path) => (await import(pathToFileURL(path).href)) as Record<string, unknown>,
		log: (line) => console.log(line),
		platform: process.platform,
		readFile: (path) => readFileSync(path, "utf-8"),
		run(command) {
			try {
				runShellCommand(command)
				return true
			} catch {
				return false
			}
		},
		ttyPath: () => snapshotTtyPath(),
		warn: (line) => console.warn(line),
		which: (token, searchPath) => whichBinary(token, process.platform, searchPath),
		writeFile(path, content) {
			mkdirSync(dirname(path), { recursive: true })
			writeFileSync(path, content)
		},
	}
}
