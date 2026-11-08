import type { PathSnapshot } from "../../src/path.ts"
import type { CaptureResult, Runtime } from "../../src/runtime.ts"

export interface FakeOptions {
	arch?: string
	/** check command → stdout; a missing key fails the capture */
	capture?: Record<string, string>
	cwd?: string
	env?: NodeJS.ProcessEnv
	files?: Record<string, string>
	home?: string
	/** config path → module namespace */
	modules?: Record<string, Record<string, unknown>>
	platform?: NodeJS.Platform
	/** install commands that fail; every other command succeeds */
	failing?: string[]
	/** check commands that time out */
	timeouts?: string[]
	tty?: PathSnapshot
	/** binary token → resolved path */
	which?: Record<string, string>
}

export interface FakeRuntime extends Runtime {
	readonly captured: Array<{ command: string; searchPath: string | undefined }>
	readonly errors: string[]
	readonly files: Map<string, string>
	readonly logs: string[]
	readonly ran: string[]
	readonly warnings: string[]
	/** logs, errors and warnings joined, for `toContain` assertions */
	output(): string
}

export function fakeRuntime(opts: FakeOptions = {}): FakeRuntime {
	const files = new Map(Object.entries(opts.files ?? {}))
	const logs: string[] = []
	const errors: string[] = []
	const warnings: string[] = []
	const ran: string[] = []
	const captured: Array<{ command: string; searchPath: string | undefined }> = []
	const capture = { ...opts.capture }
	const which = { ...opts.which }

	return {
		arch: opts.arch ?? "x64",
		capture(command, searchPath): CaptureResult {
			captured.push({ command, searchPath })
			if (opts.timeouts?.includes(command)) return { ok: false, stdout: "", timedOut: true }
			const stdout = capture[command]
			return stdout === undefined ? { ok: false, stdout: "", timedOut: false } : { ok: true, stdout, timedOut: false }
		},
		captured,
		cwd: opts.cwd ?? "/work",
		env: opts.env ?? {},
		error: (line) => errors.push(line),
		errors,
		exists: (path) => files.has(path),
		files,
		home: opts.home ?? "/home/me",
		async importModule(path) {
			const mod = opts.modules?.[path]
			if (!mod) throw new Error(`no module at ${path}`)
			return mod
		},
		log: (line) => logs.push(line),
		logs,
		output: () => [...logs, ...errors, ...warnings].join("\n"),
		platform: opts.platform ?? "linux",
		ran,
		readFile(path) {
			const content = files.get(path)
			if (content === undefined) throw new Error(`ENOENT: ${path}`)
			return content
		},
		run(command) {
			ran.push(command)
			return !(opts.failing ?? []).includes(command)
		},
		ttyPath: () => opts.tty ?? { path: "/tty/bin", source: "tty" },
		warn: (line) => warnings.push(line),
		warnings,
		which: (token) => which[token] ?? null,
		writeFile(path, content) {
			files.set(path, content)
		},
	}
}
