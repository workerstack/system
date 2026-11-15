import { describe, expect, it } from "vitest";

import type { BuiltinDep } from "../builtins/types.ts";
import { fakeRuntime } from "../fake-runtime.ts";
import { listCommand } from "./list-command.ts";

const catalog = {
  brew: { description: "Homebrew", os: () => ({ macos: "install" }), versions: "latest" },
  go: {
    description: "Go toolchain",
    os: ({ version }) => ({ all: `get ${version}`, windows: false }),
    versions: "pinned",
  },
} satisfies Readonly<Record<string, BuiltinDep>>;

describe("list", () => {
  it("prints each built-in with its version policy, OS availability and description", () => {
    const rt = fakeRuntime();
    expect(listCommand(rt, catalog)).toBe(0);
    expect(rt.logs).toStrictEqual([
      'Built-in deps (give a version: go: "1.27.2")',
      "",
      "  brew  latest  macos                                   Homebrew",
      "  go    pinned  linux-apt linux-dnf linux-pacman macos  Go toolchain",
    ]);
  });
});
