import { expect, it } from "vitest";

import { OS_TARGETS } from "../../../src/config.ts";
import { builtin, BUILTINS, command } from "./catalog-fixtures.ts";

const OTHER_PACKAGE_MANAGERS = /\bnpm (i|install)\b|\bpnpm\b|\byarn\b/;

it("verified recipes gh picks the release asset for each platform", () => {
  expect(command("gh", "linux-apt", { arch: "x64", version: "2.102.0" })).toContain(
    "https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_amd64.tar.gz",
  );
  expect(command("gh", "macos", { arch: "arm64", version: "2.102.0" })).toContain("gh_2.102.0_macOS_arm64.zip");
  expect(command("gh", "windows", { arch: "x64", version: "2.102.0" })).toContain("gh_2.102.0_windows_amd64.zip");
});

it("verified recipes rtk uses the static musl build on x64 Linux and glibc on arm64", () => {
  expect(command("rtk", "linux-dnf", { arch: "x64", version: "0.51.0" })).toContain(
    "rtk-x86_64-unknown-linux-musl.tar.gz",
  );
  expect(command("rtk", "linux-dnf", { arch: "arm64", version: "0.51.0" })).toContain(
    "rtk-aarch64-unknown-linux-gnu.tar.gz",
  );
});

it("verified recipes sherpa-onnx unpacks the shared CPU build per platform and puts its bin dir on PATH", () => {
  const base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-v2.0.1";
  expect(command("sherpa-onnx", "linux-apt", { arch: "x64", version: "2.0.1" })).toContain(
    `${base}-linux-x64-shared.tar.bz2`,
  );
  expect(command("sherpa-onnx", "linux-pacman", { arch: "arm64", version: "2.0.1" })).toContain(
    `${base}-linux-aarch64-shared-cpu.tar.bz2`,
  );
  expect(command("sherpa-onnx", "macos", { arch: "arm64", version: "2.0.1" })).toContain(
    `${base}-osx-arm64-shared.tar.bz2`,
  );
  expect(command("sherpa-onnx", "macos", { arch: "x64", version: "2.0.1" })).toContain(
    `${base}-osx-x64-shared.tar.bz2`,
  );
  expect(command("sherpa-onnx", "windows", { arch: "x64", version: "2.0.1" })).toContain(
    `${base}-win-x64-shared-MT-Release.tar.bz2`,
  );
  expect(command("sherpa-onnx", "windows", { arch: "arm64", version: "2.0.1" })).toContain(
    `${base}-win-arm64-shared-MT-Release.tar.bz2`,
  );
  const sherpa = builtin("sherpa-onnx");
  expect(sherpa.check).toStrictEqual({ command: "sherpa-onnx-version" });
  expect(sherpa.env?.("linux-apt")).toStrictEqual([{ path: "$HOME/.local/share/sherpa-onnx/bin" }]);
  expect(sherpa.env?.("windows")).toStrictEqual([{ path: "$env:LOCALAPPDATA\\Programs\\sherpa-onnx\\bin" }]);
});

it("verified recipes stripe picks the release asset, with the x64 zip on Windows arm64", () => {
  const base = "https://github.com/stripe/stripe-cli/releases/download/v1.55.10/stripe_1.55.10";
  expect(command("stripe", "linux-dnf", { arch: "arm64", version: "1.55.10" })).toContain(`${base}_linux_arm64.tar.gz`);
  expect(command("stripe", "linux-apt", { arch: "x64", version: "1.55.10" })).toContain(`${base}_linux_x86_64.tar.gz`);
  expect(command("stripe", "macos", { arch: "x64", version: "1.55.10" })).toContain(`${base}_mac-os_x86_64.tar.gz`);
  expect(command("stripe", "windows", { arch: "arm64", version: "1.55.10" })).toContain(`${base}_windows_x86_64.zip`);
});

it("verified recipes java takes a feature major or an exact, URL-encoded release", () => {
  expect(command("java", "linux-apt", { arch: "x64", version: "21" })).toContain(
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse",
  );
  expect(command("java", "macos", { arch: "arm64", version: "21.0.13+9" })).toContain(
    "https://api.adoptium.net/v3/binary/version/jdk-21.0.13%2B9/mac/aarch64/jdk/hotspot/normal/eclipse",
  );
});

it("verified recipes google-java-format falls back to the jar on x64 macOS only", () => {
  expect(command("google-java-format", "macos", { arch: "x64", version: "1.37.0" })).toContain(
    "google-java-format-1.37.0-all-deps.jar",
  );
  expect(command("google-java-format", "macos", { arch: "arm64", version: "1.37.0" })).toContain(
    "google-java-format_darwin-arm64",
  );
  expect(command("google-java-format", "linux-apt", { arch: "arm64", version: "1.37.0" })).toContain(
    "google-java-format_linux-arm64",
  );
});

it("verified recipes pins uv's bin dirs to the PATH entry it writes, whatever XDG_* says", () => {
  expect(command("ruff", "linux-apt", { arch: "x64", version: "0.17.1" })).toBe(
    'UV_TOOL_BIN_DIR="$HOME/.local/bin" uv tool install --force ruff==0.17.1',
  );
  expect(command("mypy", "macos", { arch: "x64", version: "2.4.0" })).toContain(
    'UV_TOOL_BIN_DIR="$HOME/.local/bin" uv tool install',
  );
  expect(command("python", "linux-pacman", { arch: "x64", version: "3.14.8" })).toBe(
    'UV_PYTHON_BIN_DIR="$HOME/.local/bin" uv python install 3.14.8 --default',
  );
  expect(command("ruff", "windows", { arch: "x64", version: "0.17.1" })).toBe("uv tool install --force ruff==0.17.1");
});

it("verified recipes installs global JS CLIs with bun, never npm", () => {
  // bun's global bin follows XDG_CACHE_HOME unless pinned; the launchers are node scripts
  expect(command("cf", "linux-apt", { arch: "x64", version: "1.0.0-beta.12" })).toBe(
    'BUN_INSTALL_BIN="$HOME/.bun/bin" bun i -g cf@1.0.0-beta.12',
  );
  expect(command("codex", "windows", { arch: "x64", version: "0.160.0" })).toBe("bun i -g @openai/codex@0.160.0");
  expect(BUILTINS.cf?.dependsOn).toStrictEqual(["bun", "node"]);
  expect(BUILTINS.codex?.dependsOn).toStrictEqual(["bun", "node"]);

  for (const name of Object.keys(BUILTINS))
    for (const os of OS_TARGETS) expect(command(name, os) ?? "").not.toMatch(OTHER_PACKAGE_MANAGERS);
});

it("verified recipes passes the version to self-updating installers only when pinned", () => {
  expect(command("claude", "linux-apt", { arch: "x64", version: "2.1.89" })).toBe(
    "curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89",
  );
  expect(command("claude", "linux-apt", { arch: "x64", version: "latest" })).toBe(
    "curl -fsSL https://claude.ai/install.sh | bash -s",
  );
  expect(command("grok", "windows", { arch: "x64", version: "1.0.77" })).toContain("-Version 1.0.77");
});
