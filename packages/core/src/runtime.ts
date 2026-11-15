/**
 * Every side effect the CLI performs, behind one interface. Commands take a `Runtime` and return an exit
 * code, so tests drive them with a fake and only `bin.ts` touches `process`.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { env as processEnv } from "./env.ts";
import { runShellCommand } from "./exec.ts";
import { type PathSnapshot, pathEnv, snapshotTtyPath } from "./path.ts";
import { whichBinary } from "./platform.ts";
import { TIMED_OUT_CODE } from "./timed-out-code.constants.ts";

/** A module's exports by name, `default` among them. */
export type ModuleExports = ReadonlyMap<string, unknown>;

/** The result of one check command. */
export type CaptureResult = {
  ok: boolean;
  stdout: string;
  /** the command was killed after the check timeout */
  timedOut: boolean;
};

/** What a `nodeRuntime` runs with in place of its defaults. */
export type RuntimeOptions = {
  /** Kill a check command after this long. Default 30s, so a hanging `--version` cannot hang a run. */
  checkTimeoutMs?: number;
  /** The environment commands run in and PATH changes go to. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
};

/** Every side effect a command performs: the process it runs in, its files, its children and its output. */
export type Runtime = {
  readonly arch: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly platform: NodeJS.Platform;
  /** Run a check command and capture stdout. `searchPath` replaces PATH for the child. */
  capture(command: string, searchPath?: string): CaptureResult;
  error(line: string): void;
  exists(path: string): boolean;
  importModule(path: string): Promise<ModuleExports>;
  log(line: string): void;
  /** Put `dir` first on this process's PATH (once), so later commands in the run find what it holds. */
  prependPath(dir: string): void;
  readFile(path: string): string;
  /** Run an install command with inherited stdio. True on exit 0. */
  run(command: string): boolean;
  ttyPath(): PathSnapshot;
  warn(line: string): void;
  /** Resolved path of the first token, or null. `searchPath` replaces PATH for the lookup. */
  which(token: string, searchPath?: string): string | null;
  /** Write a file, creating parent directories. */
  writeFile(path: string, content: string): void;
};

/** Kill a check command after this long by default, so a hanging `--version` cannot hang a run. */
const CHECK_TIMEOUT_MS = 30_000;

/** What a check command runs with: the environment, and how long it may take. */
type CaptureOptions = { env: NodeJS.ProcessEnv; timeoutMs: number };

function capture(command: string, searchPath: string | undefined, { env, timeoutMs }: CaptureOptions): CaptureResult {
  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      env: searchPath === undefined ? env : pathEnv(searchPath, env),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs,
    });

    return { ok: true, stdout: stdout.trim(), timedOut: false };
  } catch (error) {
    const { code } = error /* execSync throws an Error carrying the spawn's errno code */ as NodeJS.ErrnoException;

    return { ok: false, stdout: "", timedOut: code === TIMED_OUT_CODE };
  }
}

function run(command: string, env: NodeJS.ProcessEnv): boolean {
  try {
    runShellCommand(command, process.platform, env);

    return true;
  } catch {
    return false;
  }
}

/** Put `dir` first on `env`'s PATH, once. */
function prependPath(env: NodeJS.ProcessEnv, dir: string): void {
  const parts = (env.PATH ?? "").split(delimiter).filter(Boolean);

  if (!parts.includes(dir)) env.PATH = [dir, ...parts].join(delimiter);
}

async function importModule(path: string): Promise<ModuleExports> {
  const namespace: unknown = await import(pathToFileURL(path).href);

  return new Map<string, unknown>(Object.entries(namespace /* import() resolves to a module namespace */ as object));
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** The runtime of this process: its platform, cwd and home, real files and children, and its stdout and stderr. */
export function nodeRuntime({ checkTimeoutMs = CHECK_TIMEOUT_MS, env = processEnv }: RuntimeOptions = {}): Runtime {
  return {
    arch: process.arch,
    capture: (command, searchPath) => capture(command, searchPath, { env, timeoutMs: checkTimeoutMs }),
    cwd: process.cwd(),
    env,
    error: (line) => process.stderr.write(`${line}\n`),
    exists: (path) => existsSync(path),
    home: homedir(),
    importModule,
    log: (line) => process.stdout.write(`${line}\n`),
    platform: process.platform,
    prependPath: (dir) => prependPath(env, dir),
    readFile: (path) => readFileSync(path, "utf-8"),
    run: (command) => run(command, env),
    ttyPath: () => snapshotTtyPath(),
    warn: (line) => process.stderr.write(`${line}\n`),
    which: (token, searchPath) => whichBinary(token, process.platform, searchPath),
    writeFile,
  };
}
