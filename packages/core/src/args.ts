/**
 * CLI argument parsing. Pure: returns the parsed invocation or an error message, never exits.
 */

import { type OsTarget, OS_TARGETS } from "./config.ts";

export type Invocation = {
  command: string | undefined;
  config: string | undefined;
  dryRun: boolean;
  here: boolean;
  os: OsTarget | undefined;
  target: string | undefined;
  upgrade: boolean;
};

export type ParseResult = { ok: true; value: Invocation } | { error: string; ok: false };

const VALUE_FLAGS = { "--config": "a path", "--os": "a target" } as const;
const BOOL_FLAGS = ["--dry-run", "--here", "--upgrade"] as const;

type ValueFlag = keyof typeof VALUE_FLAGS;

/** The flags, values and positionals of an argv, before the OS target is checked. */
type Scanned = {
  bools: Set<string>;
  positional: string[];
  values: Partial<Record<ValueFlag, string>>;
};

function isOsTarget(value: string): value is OsTarget {
  return OS_TARGETS.some((target) => target === value);
}

function isValueFlag(arg: string): arg is ValueFlag {
  return Object.hasOwn(VALUE_FLAGS, arg);
}

function isBoolFlag(arg: string): boolean {
  return BOOL_FLAGS.some((flag) => flag === arg);
}

/** Sort `argv` into flags with values, bare flags and positionals; an error on an unknown or valueless flag. */
function scan(argv: readonly string[]): { error: string; ok: false } | { ok: true; value: Scanned } {
  const scanned: Scanned = { bools: new Set(), positional: [], values: {} };
  const args = argv[Symbol.iterator]();

  for (const arg of args) {
    if (isValueFlag(arg)) {
      const value = args.next().value;

      if (value === undefined || value.startsWith("--"))
        return { error: `${arg} requires ${VALUE_FLAGS[arg]} argument`, ok: false };

      scanned.values[arg] = value;
    } else if (isBoolFlag(arg)) {
      scanned.bools.add(arg);
    } else if (arg.startsWith("--")) {
      return { error: `Unknown flag: ${arg}`, ok: false };
    } else {
      scanned.positional.push(arg);
    }
  }

  return { ok: true, value: scanned };
}

/** Parse the arguments past the script into an invocation, or the error to print. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const scanned = scan(argv);

  if (!scanned.ok) return scanned;
  const { bools, positional, values } = scanned.value;
  const os = values["--os"];

  if (os !== undefined && !isOsTarget(os))
    return { error: `Unknown OS target: ${os}. Expected one of: ${OS_TARGETS.join(", ")}`, ok: false };
  const [command, target] = positional;

  return {
    ok: true,
    value: {
      command,
      config: values["--config"],
      dryRun: bools.has("--dry-run"),
      here: bools.has("--here"),
      os,
      target,
      upgrade: bools.has("--upgrade"),
    },
  };
}
