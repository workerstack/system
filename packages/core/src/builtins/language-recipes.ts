/**
 * Recipe helpers the language toolchains share: uv's shim dir, and where Temurin JDKs come from and unpack to.
 */

import type { EnvVar, OsCommands, OsTarget } from "../config.ts";
import { LOCAL_BIN, LOCAL_SHARE, pick, unix, WIN_PROGRAMS } from "./recipes.ts";
import type { Arch } from "./types.ts";

/** A bare feature major such as `21`, which Adoptium serves as that major's latest GA release. */
const FEATURE_MAJOR = /^\d+$/;

/** uv puts Python and tool shims in `~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows). */
export function uvBinEnv(os: OsTarget): readonly EnvVar[] {
  return [{ path: os === "windows" ? "$HOME\\.local\\bin" : LOCAL_BIN }];
}

/**
 * A uv command whose shims land in the bin dir `uvBinEnv` puts on PATH. On unix uv derives that dir from
 * XDG_BIN_HOME / XDG_DATA_HOME, which can point anywhere, so the dir is named explicitly.
 */
export function uvCommand(variable: "UV_PYTHON_BIN_DIR" | "UV_TOOL_BIN_DIR", command: string): OsCommands {
  const pinned = `${variable}="${LOCAL_BIN}" ${command}`;

  return { ...unix(pinned, pinned), windows: command };
}

/** Adoptium download for a feature major (`21`, latest GA) or an exact release (`21.0.13+9`). */
export function temurin(version: string, os: "linux" | "mac" | "windows", arch: Arch): string {
  const api = "https://api.adoptium.net/v3/binary";
  const a = pick(arch, { arm64: "aarch64", x64: "x64" });
  const tail = `${os}/${a}/jdk/hotspot/normal/eclipse`;

  return FEATURE_MAJOR.test(version)
    ? `${api}/latest/${version}/ga/${tail}`
    : `${api}/version/jdk-${encodeURIComponent(version)}/${tail}`;
}

export const JAVA_DIR: string = `${LOCAL_SHARE}/java`;

/** macOS JDKs keep their home under Contents/Home. */
export function javaHome(os: OsTarget): string {
  if (os === "windows") return `${WIN_PROGRAMS}\\java`;

  return os === "macos" ? `${JAVA_DIR}/Contents/Home` : JAVA_DIR;
}

export const GJF_JAR: string = `${LOCAL_SHARE}/google-java-format/google-java-format.jar`;
