import { describe, expect, it } from "vitest";

import {
  isTtyEnvKeep,
  PATH_PRINTF,
  parsePathOutput,
  pathEnv,
  processPath,
  TTY_PATH_FALLBACK_WARN,
  ttySnapshotEnv,
  UNIX_BASH_PATH_ARGS,
  UNIX_ZSH_PATH_ARGS,
  unixPathSnapshotArgs,
  unixStockPath,
  windowsStockPath,
} from "../../src/path.ts";

describe("processPath", () => {
  it("prefers PATH over Path", () => {
    expect(processPath({ PATH: "/a", Path: "/b" })).toBe("/a");
  });

  it("uses Path when PATH is missing", () => {
    expect(processPath({ Path: "C:\\Windows" })).toBe("C:\\Windows");
  });

  it("returns empty when neither is set", () => {
    expect(processPath({})).toBe("");
  });
});

describe("pathEnv", () => {
  it("sets PATH and Path on a copy of the base env", () => {
    const env = pathEnv("/tty/bin", { HOME: "/home/me", PATH: "/old" });
    expect(env.PATH).toBe("/tty/bin");
    expect(env.Path).toBe("/tty/bin");
    expect(env.HOME).toBe("/home/me");
  });
});

describe("isTtyEnvKeep", () => {
  it("keeps identity, locale, TERM, and Windows profile roots", () => {
    expect(isTtyEnvKeep("HOME")).toBe(true);
    expect(isTtyEnvKeep("USER")).toBe(true);
    expect(isTtyEnvKeep("SHELL")).toBe(true);
    expect(isTtyEnvKeep("LANG")).toBe(true);
    expect(isTtyEnvKeep("LC_TIME")).toBe(true);
    expect(isTtyEnvKeep("TERM")).toBe(true);
    expect(isTtyEnvKeep("USERPROFILE")).toBe(true);
  });

  it("keeps the Windows user-dir variables profiles expand ($env:LOCALAPPDATA\\bin)", () => {
    for (const key of ["LOCALAPPDATA", "APPDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "TEMP", "TMP"])
      expect(isTtyEnvKeep(key), key).toBe(true);

    expect(isTtyEnvKeep("PSModulePath")).toBe(false);
  });

  it("rejects PATH and leftover toolchain exports", () => {
    expect(isTtyEnvKeep("PATH")).toBe(false);
    expect(isTtyEnvKeep("Path")).toBe(false);
    expect(isTtyEnvKeep("NVM_BIN")).toBe(false);
    expect(isTtyEnvKeep("FNM_MULTISHELL_PATH")).toBe(false);
    expect(isTtyEnvKeep("COLORTERM")).toBe(false);
    expect(isTtyEnvKeep("TMPDIR")).toBe(false);
  });
});

describe("ttySnapshotEnv", () => {
  it("keeps HOME/SHELL/locale and uses a stock PATH", () => {
    const env = ttySnapshotEnv(
      {
        HOME: "/home/me",
        LANG: "C.UTF-8",
        LC_TIME: "C",
        NVM_BIN: "/stale/bin",
        PATH: "/stale/bin:/usr/bin",
        SHELL: "/bin/bash",
        TERM: "xterm",
        TERM_PROGRAM: undefined,
        USER: "me",
        USERPROFILE: undefined,
      },
      "linux",
    );

    expect(env.HOME).toBe("/home/me");
    expect(env.SHELL).toBe("/bin/bash");
    expect(env.USER).toBe("me");
    expect(env.LANG).toBe("C.UTF-8");
    expect(env.LC_TIME).toBe("C");
    expect(env.TERM).toBe("xterm");
    expect(env.PATH).toBe(unixStockPath());
    expect(env.NVM_BIN).toBeUndefined();
    expect("USERPROFILE" in env).toBe(false);
  });
});

describe("ttySnapshotEnv on unix", () => {
  it("drops parent PATH and leftover toolchain exports", () => {
    const env = ttySnapshotEnv(
      {
        ASDF_DIR: "/asdf",
        COLORTERM: "truecolor",
        FNM_MULTISHELL_PATH: "/fnm",
        HOME: "/home/me",
        NVM_BIN: "/stale/bin",
        NVM_INC: "/stale/include",
        PATH: "/poison",
        VOLTA_HOME: "/volta",
      },
      "linux",
    );

    expect(env.PATH).toBe("/usr/local/bin:/usr/bin:/bin");
    expect(env.NVM_BIN).toBeUndefined();
    expect(env.NVM_INC).toBeUndefined();
    expect(env.FNM_MULTISHELL_PATH).toBeUndefined();
    expect(env.VOLTA_HOME).toBeUndefined();
    expect(env.ASDF_DIR).toBeUndefined();
    expect(env.COLORTERM).toBeUndefined();
  });
});

describe("ttySnapshotEnv on Windows", () => {
  it("keeps the whole Windows env but PATH and PSModulePath (PATH is rebuilt from the registry)", () => {
    const env = ttySnapshotEnv(
      {
        COMPUTERNAME: "BOX",
        NVM_HOME: "C:\\nvm",
        PATH: "C:\\stale",
        PSModulePath: "C:\\pwsh7",
        SYSTEMROOT: "C:\\Windows",
      },
      "win32",
    );

    expect(env.COMPUTERNAME).toBe("BOX");
    expect(env.NVM_HOME).toBe("C:\\nvm");
    expect(env.PSModulePath).toBeUndefined();
    expect(env.PATH).toBe(windowsStockPath({ SYSTEMROOT: "C:\\Windows" }));
  });

  it("uses SystemRoot for the Windows stock PATH", () => {
    const env = ttySnapshotEnv({ SYSTEMROOT: "C:\\Windows", USERPROFILE: "C:\\Users\\me" }, "win32");
    expect(env.PATH).toBe(windowsStockPath({ SYSTEMROOT: "C:\\Windows" }));
    expect(env.Path).toBe(env.PATH);
    expect(env.USERPROFILE).toBe("C:\\Users\\me");
  });

  it("defaults Windows stock PATH to C:\\Windows when SystemRoot is missing", () => {
    // includes Windows PowerShell, which the snapshot spawns by name from this PATH
    expect(windowsStockPath({})).toBe(
      "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
    );
  });
});

describe("unixPathSnapshotArgs", () => {
  it("uses interactive -ic for bash and sh", () => {
    expect(unixPathSnapshotArgs("/bin/bash")).toStrictEqual([...UNIX_BASH_PATH_ARGS]);
    expect(unixPathSnapshotArgs("bash")).toStrictEqual(["-ic", PATH_PRINTF]);
    expect(unixPathSnapshotArgs("/bin/sh")).toStrictEqual(["-ic", PATH_PRINTF]);
    expect(unixPathSnapshotArgs("bash.exe")).toStrictEqual(["-ic", PATH_PRINTF]);
  });

  it("uses login+interactive -lic for zsh", () => {
    expect(unixPathSnapshotArgs("/usr/bin/zsh")).toStrictEqual([...UNIX_ZSH_PATH_ARGS]);
    expect(unixPathSnapshotArgs("zsh")).toStrictEqual(["-lic", PATH_PRINTF]);
    expect(unixPathSnapshotArgs("zsh.exe")).toStrictEqual(["-lic", PATH_PRINTF]);
  });
});

describe("parsePathOutput", () => {
  it("returns the last non-empty line so interactive rc MOTD is ignored", () => {
    expect(parsePathOutput("welcome\n/usr/bin:/bin")).toBe("/usr/bin:/bin");
    expect(parsePathOutput("C:\\Windows\r\n")).toBe("C:\\Windows");
  });

  it("returns empty when stdout has no path line", () => {
    expect(parsePathOutput("")).toBe("");
    expect(parsePathOutput("   \n\n")).toBe("");
  });
});

describe("TTY_PATH_FALLBACK_WARN", () => {
  it("is a stable warning string", () => {
    expect(TTY_PATH_FALLBACK_WARN).toContain("interactive-shell PATH");
  });
});
