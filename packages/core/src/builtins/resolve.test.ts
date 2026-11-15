import { expect, it } from "vitest";

import { ConfigError } from "../config-error.ts";
import { resolveDeps } from "./resolve.ts";
import type { BuiltinDep } from "./types.ts";

const catalog = {
  brew: { description: "brew", os: () => ({ macos: "install brew" }), versions: "latest" },
  claude: { description: "claude", os: ({ version }) => ({ all: `install claude ${version}` }), versions: "any" },
  ruff: {
    dependsOn: ["uv"],
    description: "ruff",
    os: ({ version }) => ({ all: `uv tool install ruff==${version}` }),
    versions: "pinned",
  },
  tool: {
    check: { command: "tool -v" },
    dependsOn: ["brew"],
    description: "a tool",
    env: (os) => [{ path: os === "windows" ? "%LOCALAPPDATA%\\tool" : "$HOME/.tool/bin" }],
    os: ({ arch, version }) => ({ all: `get tool-${version}-${arch}`, macos: `brew install tool@${version}` }),
    versions: "pinned",
  },
  uv: { description: "uv", os: ({ version }) => ({ all: `get uv ${version}` }), versions: "pinned" },
} satisfies Record<string, BuiltinDep>;

const custom = { description: "mine", os: { all: "make install" }, required: false, version: "2.0.0" };

it("resolveDeps expands a version string into the catalog's config for this arch", () => {
  const deps = resolveDeps({ tool: "1.2.3" }, { arch: "arm64", os: "linux-apt" }, catalog);
  expect(deps.tool).toStrictEqual({
    check: { command: "tool -v" },
    dependsOn: ["brew"],
    description: "a tool",
    env: [{ path: "$HOME/.tool/bin" }],
    os: { all: "get tool-1.2.3-arm64", macos: "brew install tool@1.2.3" },
    required: true,
    version: "1.2.3",
  });
  expect(resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "linux-apt" }, catalog).tool?.os.all).toBe(
    "get tool-1.2.3-x64",
  );
  expect(resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "windows" }, catalog).tool?.env).toStrictEqual([
    { path: "%LOCALAPPDATA%\\tool" },
  ]);
});

it("resolveDeps resolves a per-OS check for the target OS, and an override's check wins", () => {
  const perOs = {
    app: {
      check: (os) => ({ command: os === "windows" ? "app-win --ver" : "app --version" }),
      description: "an app",
      os: () => ({ all: "get app" }),
      versions: "latest",
    },
  } satisfies Record<string, BuiltinDep>;

  expect(resolveDeps({ app: "latest" }, { arch: "x64", os: "windows" }, perOs).app?.check).toStrictEqual({
    command: "app-win --ver",
  });
  expect(resolveDeps({ app: "latest" }, { arch: "x64", os: "macos" }, perOs).app?.check).toStrictEqual({
    command: "app --version",
  });
  const override = { check: { command: "mine" }, version: "latest" };
  expect(resolveDeps({ app: override }, { arch: "x64", os: "windows" }, perOs).app?.check).toStrictEqual({
    command: "mine",
  });
});

it("resolveDeps merges an override's os per key and replaces every other field", () => {
  const deps = resolveDeps(
    {
      tool: {
        check: { command: "tool version" },
        dependsOn: [],
        description: "mine",
        env: [],
        os: { macos: false, windows: "choco install tool" },
        required: false,
        version: "1.2.3",
      },
    },
    { arch: "x64", os: "linux-apt" },
    catalog,
  );

  expect(deps.tool).toStrictEqual({
    check: { command: "tool version" },
    dependsOn: [],
    description: "mine",
    env: [],
    os: { all: "get tool-1.2.3-x64", macos: false, windows: "choco install tool" },
    required: false,
    version: "1.2.3",
  });
});

it("resolveDeps passes custom deps through untouched", () => {
  expect(resolveDeps({ mine: custom }, { arch: "x64", os: "linux-apt" }, catalog)).toStrictEqual({ mine: custom });
});

it("resolveDeps adds a missing latest-only prerequisite", () => {
  const deps = resolveDeps({ tool: "1.2.3" }, { arch: "x64", os: "linux-apt" }, catalog);
  expect(Object.keys(deps)).toStrictEqual(["tool", "brew"]);
  expect(deps.brew).toMatchObject({ os: { macos: "install brew" }, required: true, version: "latest" });
});

it("resolveDeps keeps a prerequisite the config already declares", () => {
  const deps = resolveDeps({ ruff: "0.17.1", uv: "0.13.1" }, { arch: "x64", os: "linux-apt" }, catalog);
  expect(Object.keys(deps)).toStrictEqual(["ruff", "uv"]);
});

it("resolveDeps rejects a missing pinned prerequisite with the fix", () => {
  expect(() => resolveDeps({ ruff: "0.17.1" }, { arch: "x64", os: "linux-apt" }, catalog)).toThrow(
    new ConfigError('Invalid system config:\n  - deps.ruff: needs uv; add uv: "<version>"'),
  );
});

it("resolveDeps rejects latest on a pinned built-in and a pin on a latest-only one", () => {
  expect(() => resolveDeps({ brew: "4.0.0", tool: "latest" }, { arch: "x64", os: "linux-apt" }, catalog)).toThrow(
    new ConfigError(
      'Invalid system config:\n  - deps.brew: brew only installs "latest"' +
        '\n  - deps.tool: tool needs a pinned version, not "latest"',
    ),
  );
});

it("resolveDeps accepts a pin or latest on an any-version built-in", () => {
  expect(resolveDeps({ claude: "2.1.89" }, { arch: "x64", os: "linux-apt" }, catalog).claude?.os.all).toBe(
    "install claude 2.1.89",
  );
  expect(resolveDeps({ claude: "latest" }, { arch: "x64", os: "linux-apt" }, catalog).claude?.os.all).toBe(
    "install claude latest",
  );
});

it("resolveDeps rejects an unsupported CPU only when a built-in is used", () => {
  expect(resolveDeps({ mine: custom }, { arch: "ia32", os: "linux-apt" }, catalog)).toStrictEqual({ mine: custom });
  expect(() => resolveDeps({ tool: "1.2.3" }, { arch: "ia32", os: "linux-apt" }, catalog)).toThrow(
    new ConfigError("Invalid system config:\n  - built-in deps support x64 and arm64; this machine is ia32"),
  );
});

it("resolveDeps rejects an unsupported CPU when a custom dep pulls in a latest-only built-in", () => {
  expect(() =>
    resolveDeps({ mine: { ...custom, dependsOn: ["brew"] } }, { arch: "ia32", os: "linux-apt" }, catalog),
  ).toThrow(new ConfigError("Invalid system config:\n  - built-in deps support x64 and arm64; this machine is ia32"));
});
