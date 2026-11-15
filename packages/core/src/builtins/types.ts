import type { EnvVar, OsCommands, OsTarget, SystemDepConfig } from "../config.ts";

/** CPU architectures built-ins ship recipes for. */
export type Arch = "arm64" | "x64";

/** What a built-in's install commands are built for. */
export type RecipeContext = {
  /** The CPU to download for. */
  arch: Arch;
  /** The config's version: an exact pin, or `"latest"` when the built-in allows it. */
  version: string;
};

/** A tool workerstack supports by name: the config gives a version, the catalog gives the rest. */
export type BuiltinDep = {
  /**
   * `check` runs this; default `<name> --version`. A function gives the check for the OS the config resolves on,
   * for apps whose version lives in a bundle or file, not on stdout.
   */
  check?: SystemDepConfig["check"] | ((os: OsTarget) => SystemDepConfig["check"]);
  /** Other deps installed first. A `latest`-only built-in missing from the config is added; any other is an error. */
  dependsOn?: readonly string[];
  /** One line on what the tool is, shown by `system list` and in the README catalog. */
  description: string;
  /** Shell env entries for the OS the config resolves on (PATH dirs differ between unix and Windows). */
  env?: (os: OsTarget) => readonly EnvVar[];
  /** Per-OS install commands for this version and CPU. */
  os: (ctx: RecipeContext) => OsCommands;
  /**
   * `pinned`: needs an exact version, rejects `"latest"`. `latest`: only `"latest"` (the source cannot pin).
   * `any`: a pin or `"latest"`.
   */
  versions: "any" | "latest" | "pinned";
};

/** The object form of a built-in entry: a version plus anything to override. `os` merges per key. */
export type BuiltinOverride = {
  /** Replaces the built-in's version check. */
  check?: SystemDepConfig["check"];
  /** Replaces the built-in's prerequisites. */
  dependsOn?: readonly string[];
  /** Replaces the built-in's description. */
  description?: string;
  /** Replaces the built-in's env entries. */
  env?: readonly EnvVar[];
  /** Install commands merged over the built-in's, per OS key. */
  os?: OsCommands;
  /** `false` lets the dep be missing without failing `check`; default `true`. */
  required?: boolean;
  /** An exact pin, or `"latest"` when the built-in allows it. */
  version: string;
};
