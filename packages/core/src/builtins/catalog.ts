/**
 * The built-in catalog: every tool workerstack supports by name. A config gives `name: "<version>"`;
 * the catalog supplies the install commands, check, env and prerequisites.
 */

import { AGENTS } from "./agents.ts";
import { BOOTSTRAP } from "./bootstrap.ts";
import { BROWSERS } from "./browsers.ts";
import { CLOUDFLARE } from "./cloudflare.ts";
import { DATABASE } from "./database.ts";
import { EDITORS } from "./editors.ts";
import { LANGUAGES } from "./languages.ts";
import { PAYMENTS } from "./payments.ts";
import { RELEASE } from "./release.ts";
import { RUNTIMES } from "./runtimes.ts";
import type { BuiltinDep } from "./types.ts";

/** The built-in groups by name: each holds the tools of one concern. */
type BuiltinGroups = {
  /** The package managers other built-ins install through: Homebrew on macOS, Chocolatey on Windows. */
  readonly bootstrap: typeof BOOTSTRAP;
  /** JavaScript runtimes: bun, deno and node. */
  readonly runtimes: typeof RUNTIMES;
  /** The language toolchains the generated clients target. */
  readonly languages: typeof LANGUAGES;
  /** Release and CI tools: git, curl, gh, signing and script linters. */
  readonly release: typeof RELEASE;
  /** The Cloudflare CLI and tunnel client. */
  readonly cloudflare: typeof CLOUDFLARE;
  /** Schema migrations and the local database server. */
  readonly database: typeof DATABASE;
  /** The Stripe CLI. */
  readonly payments: typeof PAYMENTS;
  /** Browsers and the container engine browser tests run in. */
  readonly browsers: typeof BROWSERS;
  /** Desktop editors. */
  readonly editors: typeof EDITORS;
  /** Coding agent CLIs and the tools their hooks run. */
  readonly agents: typeof AGENTS;
};

/** The catalog by group, for docs and per-group CI installs; a group's keys are the built-in names it holds. */
export const BUILTIN_GROUPS: BuiltinGroups = {
  agents: AGENTS,
  bootstrap: BOOTSTRAP,
  browsers: BROWSERS,
  cloudflare: CLOUDFLARE,
  database: DATABASE,
  editors: EDITORS,
  languages: LANGUAGES,
  payments: PAYMENTS,
  release: RELEASE,
  runtimes: RUNTIMES,
};

/** Every name a config may give with only a version: the keys of all the groups. */
export type BuiltinName = {
  [Group in keyof BuiltinGroups]: keyof BuiltinGroups[Group];
}[keyof BuiltinGroups];

/** Every built-in by name, all groups merged; `resolveDeps` expands config entries against it. */
export const BUILTINS: Readonly<Record<BuiltinName, BuiltinDep>> = {
  ...BOOTSTRAP,
  ...RUNTIMES,
  ...LANGUAGES,
  ...RELEASE,
  ...CLOUDFLARE,
  ...DATABASE,
  ...PAYMENTS,
  ...BROWSERS,
  ...EDITORS,
  ...AGENTS,
};

/** The built-in names as a set, for telling a built-in entry from a custom one while validating a config. */
export const BUILTIN_NAMES: ReadonlySet<string> = /* @__PURE__ */ new Set(/* @__PURE__ */ Object.keys(BUILTINS));
