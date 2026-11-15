import { describe, expect, it } from "vitest";

import {
  PATH_PRINTF,
  snapshotTtyPath,
  unixStockPath,
  WINDOWS_TTY_PATH_ARGS,
  windowsStockPath,
} from "../../src/path.ts";

function spawnFail(): never {
  throw new Error("spawn ENOENT");
}

function throwNonError(): never {
  throw "killed";
}

function emptyPath(): string {
  return "   \n";
}

function bashInteractive(file: string, args: readonly string[]): string {
  expect(file).toBe("/bin/bash");
  expect([...args]).toStrictEqual(["-ic", PATH_PRINTF]);
  expect(args[0]).not.toContain("l");

  return "/interactive/bin:/usr/bin\n";
}

function zshLoginInteractive(file: string, args: readonly string[]): string {
  expect(file).toBe("/bin/zsh");
  expect([...args]).toStrictEqual(["-lic", PATH_PRINTF]);

  return "/zsh/bin:/usr/bin\n";
}

function defaultSh(file: string, args: readonly string[]): string {
  expect(file).toBe("/bin/sh");
  expect([...args]).toStrictEqual(["-ic", PATH_PRINTF]);

  return "/usr/bin";
}

function windowsProfilePath(file: string, args: readonly string[]): string {
  expect(file).toBe("powershell.exe");
  expect([...args]).toStrictEqual([...WINDOWS_TTY_PATH_ARGS]);
  // a new terminal: PATH from the registry (Machine, then User), then every profile in startup order
  const script = args.at(-1) ?? "";
  expect(script).toMatch(/^\$env:Path = \[Environment\]::GetEnvironmentVariable\('Path', 'Machine'\)/);
  expect(script).toContain("GetEnvironmentVariable('Path', 'User')");
  expect(script.indexOf("AllUsersAllHosts")).toBeLessThan(script.indexOf("CurrentUserCurrentHost"));
  expect(script.trimEnd().endsWith("$env:Path")).toBe(true);

  return "C:\\tty;C:\\Windows\r\n";
}

describe("snapshotTtyPath spawn env", () => {
  it("does not pass parent toolchain exports or PATH into the TTY spawn", () => {
    let seen: NodeJS.ProcessEnv | undefined;

    function spy(_file: string, _args: readonly string[], env: NodeJS.ProcessEnv): string {
      seen = env;

      return "/tty/bin\n";
    }

    const stale = { NVM_BIN: "/stale/bin", NVM_INC: "/stale/include", PATH: "/stale/bin:/usr/bin" };
    snapshotTtyPath("linux", { ...stale, HOME: "/home/me", SHELL: "/bin/bash" }, spy);
    expect(seen?.NVM_BIN).toBeUndefined();
    expect(seen?.NVM_INC).toBeUndefined();
    expect(seen?.PATH).toBe(unixStockPath());
    expect(seen?.HOME).toBe("/home/me");
    expect(seen?.SHELL).toBe("/bin/bash");

    snapshotTtyPath("win32", { PATH: "C:\\stale", SYSTEMROOT: "D:\\Win", USERPROFILE: "C:\\Users\\me" }, spy);
    expect(seen?.PATH).toBe(windowsStockPath({ SYSTEMROOT: "D:\\Win" }));
    expect(seen?.USERPROFILE).toBe("C:\\Users\\me");
  });
});

describe("snapshotTtyPath shells", () => {
  it("spawns bash with -ic, not login-only -lc", () => {
    expect(snapshotTtyPath("linux", { PATH: "/process", SHELL: "/bin/bash" }, bashInteractive)).toStrictEqual({
      path: "/interactive/bin:/usr/bin",
      source: "tty",
    });
  });

  it("spawns zsh with -lic", () => {
    expect(snapshotTtyPath("darwin", { PATH: "/process", SHELL: "/bin/zsh" }, zshLoginInteractive)).toStrictEqual({
      path: "/zsh/bin:/usr/bin",
      source: "tty",
    });
  });

  it("uses /bin/sh -ic when SHELL is unset", () => {
    expect(snapshotTtyPath("linux", { PATH: "/process" }, defaultSh)).toStrictEqual({
      path: "/usr/bin",
      source: "tty",
    });
  });

  it("reads Path from PowerShell with a profile", () => {
    expect(snapshotTtyPath("win32", { PATH: "C:\\process" }, windowsProfilePath)).toStrictEqual({
      path: "C:\\tty;C:\\Windows",
      source: "tty",
    });
  });
});

describe("snapshotTtyPath fallback", () => {
  it("falls back when the TTY spawn throws", () => {
    expect(snapshotTtyPath("linux", { PATH: "/process", SHELL: "/bin/bash" }, spawnFail)).toStrictEqual({
      path: "/process",
      reason: "spawn ENOENT",
      source: "process",
    });
    expect(snapshotTtyPath("win32", { PATH: "C:\\process" }, spawnFail)).toStrictEqual({
      path: "C:\\process",
      reason: "spawn ENOENT",
      source: "process",
    });
    expect(snapshotTtyPath("linux", { PATH: "/p" }, throwNonError).reason).toBe("killed");
  });
});

describe("snapshotTtyPath with an empty TTY PATH", () => {
  it("falls back when the TTY PATH is empty", () => {
    expect(snapshotTtyPath("linux", { PATH: "/process" }, emptyPath)).toStrictEqual({
      path: "/process",
      reason: "the shell printed no PATH",
      source: "process",
    });
    expect(snapshotTtyPath("win32", { Path: "C:\\process" }, emptyPath)).toStrictEqual({
      path: "C:\\process",
      reason: "the shell printed no PATH",
      source: "process",
    });
  });

  it("falls back to empty process PATH when that is empty too", () => {
    expect(snapshotTtyPath("linux", {}, emptyPath)).toStrictEqual({
      path: "",
      reason: "the shell printed no PATH",
      source: "process",
    });
  });
});
