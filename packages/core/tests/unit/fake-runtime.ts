import type { PathSnapshot } from "../../src/path.ts";
import type { CaptureResult, ModuleExports, Runtime } from "../../src/runtime.ts";

export type FakeOptions = {
  arch?: string;
  /** check command → stdout; a missing key fails the capture */
  capture?: Record<string, string>;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  files?: Record<string, string>;
  home?: string;
  /** config path → module namespace, as `exportsOf` builds one */
  modules?: Record<string, ModuleExports>;
  platform?: NodeJS.Platform;
  /** install commands that fail; every other command succeeds */
  failing?: string[];
  /** check commands that time out */
  timeouts?: string[];
  tty?: PathSnapshot;
  /** binary token → resolved path */
  which?: Record<string, string>;
};

export type FakeRuntime = Runtime & {
  readonly captured: Array<{ command: string; searchPath: string | undefined }>;
  readonly errors: string[];
  readonly files: Map<string, string>;
  readonly logs: string[];
  readonly prepended: string[];
  readonly ran: string[];
  readonly warnings: string[];
  /** logs, errors and warnings joined, for `toContain` assertions */
  output(): string;
};

/** A module namespace with `namespace`'s exports, as `importModule` resolves one. */
export function exportsOf(namespace: Parameters<typeof Object.entries>[0]): ModuleExports {
  return new Map(Object.entries(namespace));
}

/** The lines the runtime printed, by stream. */
function streams(): Pick<FakeRuntime, "error" | "errors" | "log" | "logs" | "output" | "warn" | "warnings"> {
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  return {
    error: (line) => errors.push(line),
    errors,
    log: (line) => logs.push(line),
    logs,
    output: () => [...logs, ...errors, ...warnings].join("\n"),
    warn: (line) => warnings.push(line),
    warnings,
  };
}

/** Files in a map, and modules from `opts.modules`. */
function fileSystem(
  opts: FakeOptions,
): Pick<FakeRuntime, "exists" | "files" | "importModule" | "readFile" | "writeFile"> {
  const files = new Map(Object.entries(opts.files ?? {}));

  return {
    exists: (path) => files.has(path),
    files,
    importModule(path) {
      const mod = opts.modules?.[path];

      return mod === undefined ? Promise.reject(new Error(`no module at ${path}`)) : Promise.resolve(mod);
    },
    readFile(path) {
      const content = files.get(path);

      if (content === undefined) throw new Error(`ENOENT: ${path}`);

      return content;
    },
    writeFile(path, content) {
      files.set(path, content);
    },
  };
}

/** Check and install commands, as recorded and answered from `opts`. */
function children(opts: FakeOptions): Pick<FakeRuntime, "capture" | "captured" | "ran" | "run" | "ttyPath" | "which"> {
  const captured: Array<{ command: string; searchPath: string | undefined }> = [];
  const ran: string[] = [];
  const capture = { ...opts.capture };
  const which = { ...opts.which };

  return {
    capture(command, searchPath): CaptureResult {
      captured.push({ command, searchPath });

      if (opts.timeouts?.includes(command) === true) return { ok: false, stdout: "", timedOut: true };
      const stdout = capture[command];

      return stdout === undefined ? { ok: false, stdout: "", timedOut: false } : { ok: true, stdout, timedOut: false };
    },
    captured,
    ran,
    run(command) {
      ran.push(command);

      return !(opts.failing ?? []).includes(command);
    },
    ttyPath: () => opts.tty ?? { path: "/tty/bin", source: "tty" },
    which: (token) => which[token] ?? null,
  };
}

export function fakeRuntime(opts: FakeOptions = {}): FakeRuntime {
  const prepended: string[] = [];
  const env = opts.env ?? {};

  return {
    ...streams(),
    ...fileSystem(opts),
    ...children(opts),
    arch: opts.arch ?? "x64",
    cwd: opts.cwd ?? "/work",
    env,
    home: opts.home ?? "/home/me",
    platform: opts.platform ?? "linux",
    prependPath(dir) {
      prepended.push(dir);
      env.PATH = env.PATH === undefined || env.PATH === "" ? dir : `${dir}:${env.PATH}`;
    },
    prepended,
  };
}
