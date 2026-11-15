import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { env as processEnv } from "../../src/env.ts";
import { snapshotTtyPath } from "../../src/path.ts";

/** A shell that prints a marker when a parent toolchain export or PATH reaches it, else `/isolated`. */
const LEAK_PROBE = [
  "#!/bin/sh",
  'if [ -n "${NVM_BIN-}" ] || [ -n "${FNM_MULTISHELL_PATH-}" ]; then',
  '  printf %s "LEAKED_VM"',
  "  exit 0",
  "fi",
  'case "$PATH" in',
  '  *poison*) printf %s "LEAKED_PATH"; exit 0 ;;',
  "esac",
  'printf %s "/isolated"',
  "",
].join("\n");

/** A shell that prints whether its stdin is a TTY. */
const STDIN_PROBE = `#!/bin/sh
if [ -t 0 ]; then
  echo "/tty-stdin"
  exit 0
fi
printf %s "/no-tty-stdin"
`;

/** An executable shell script in a new temp dir. */
function probeShell(prefix: string, script: string): string {
  const shell = join(mkdtempSync(join(tmpdir(), prefix)), "shell");
  writeFileSync(shell, script, { mode: 0o755 });
  chmodSync(shell, 0o755);

  return shell;
}

describe("snapshotTtyPath in a real unix shell", () => {
  it("TTY spawn env has no parent PATH or leftover toolchain exports", () => {
    if (process.platform === "win32") return;
    const shell = probeShell("system-tty-isolate-", LEAK_PROBE);

    const snap = snapshotTtyPath("linux", {
      FNM_MULTISHELL_PATH: "/fnm",
      HOME: join(shell, ".."),
      NVM_BIN: "/poison/bin",
      PATH: "/poison/bin:/usr/bin",
      SHELL: shell,
      USER: "me",
    });

    expect(snap).toStrictEqual({ path: "/isolated", source: "tty" });
  });

  it("does not treat stdin as a TTY", () => {
    if (process.platform === "win32") return;
    const shell = probeShell("system-tty-stdin-", STDIN_PROBE);
    const snap = snapshotTtyPath("linux", { ...processEnv, PATH: "/process", SHELL: shell });
    expect(snap).toStrictEqual({ path: "/no-tty-stdin", source: "tty" });
  });

  it("snapshots a non-empty PATH from the real interactive shell on this OS", () => {
    const snap = snapshotTtyPath();
    expect(snap.path.length).toBeGreaterThan(0);
    expect(["tty", "process"]).toContain(snap.source);
  });
});

describe("snapshotTtyPath in real bash", () => {
  it("takes PATH from bash interactive rc, not login-only files", () => {
    if (process.platform === "win32") return;
    const bash = existsSync("/bin/bash") ? "/bin/bash" : "bash";
    const home = mkdtempSync(join(tmpdir(), "system-tty-bash-"));
    const interactiveDir = join(home, "interactive-bin");
    const loginDir = join(home, "login-bin");
    const poisonDir = join(home, "poison-bin");
    mkdirSync(interactiveDir);
    mkdirSync(loginDir);
    mkdirSync(poisonDir);
    writeFileSync(join(home, ".bashrc"), `export PATH=${JSON.stringify(interactiveDir)}":$PATH"\n`);
    writeFileSync(join(home, ".profile"), `export PATH=${JSON.stringify(loginDir)}":$PATH"\n`);
    writeFileSync(join(home, ".bash_profile"), `export PATH=${JSON.stringify(loginDir)}":$PATH"\n`);

    const { BASH_ENV: _bashEnv, ENV: _env, ...inherited } = processEnv;
    const env = { ...inherited, HOME: home, NVM_BIN: poisonDir, PATH: `${poisonDir}:/usr/bin`, SHELL: bash };
    const snap = snapshotTtyPath(process.platform, env);
    expect(snap.source).toBe("tty");
    expect(snap.path.split(":").includes(interactiveDir)).toBe(true);
    expect(snap.path.split(":").includes(loginDir)).toBe(false);
    expect(snap.path.split(":").includes(poisonDir)).toBe(false);
  });
});
