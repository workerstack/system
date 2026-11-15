import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { env } from "./env.ts";
import { processPath } from "./path.ts";
import { nodeRuntime } from "./runtime.ts";

const rt = nodeRuntime();
const node = JSON.stringify(process.execPath);

describe("nodeRuntime", () => {
  it("reflects this process", () => {
    expect(rt.platform).toBe(process.platform);
    expect(rt.arch).toBe(process.arch);
    expect(rt.cwd).toBe(process.cwd());
    expect(rt.env).toBe(env);
  });

  it("captures trimmed stdout, and fails on a non-zero exit", () => {
    expect(rt.capture(`${node} -e "console.log(' 1.2.3 ')"`)).toStrictEqual({
      ok: true,
      stdout: "1.2.3",
      timedOut: false,
    });
    expect(rt.capture(`${node} -e "process.exit(3)"`)).toStrictEqual({ ok: false, stdout: "", timedOut: false });
  });

  it("kills a check that outlives the timeout and reports it", () => {
    const slow = nodeRuntime({ checkTimeoutMs: 200 });
    expect(slow.capture(`${node} -e "setTimeout(() => {}, 10000)"`)).toStrictEqual({
      ok: false,
      stdout: "",
      timedOut: true,
    });
  });
});

describe("nodeRuntime run and files", () => {
  it("captures with a replaced PATH", () => {
    const out = rt.capture(`${node} -e "console.log(process.env.PATH)"`, `/only/here`);
    expect(out).toStrictEqual({ ok: true, stdout: "/only/here", timedOut: false });
  });

  it("runs a command and reports its exit status", () => {
    expect(rt.run(`${node} -e "process.exit(0)"`)).toBe(true);
    expect(rt.run(`${node} -e "process.exit(1)"`)).toBe(false);
  });

  it("reads, writes with parents, and checks files", () => {
    const path = join(mkdtempSync(join(tmpdir(), "system-rt-")), "a", "b.txt");
    expect(rt.exists(path)).toBe(false);
    rt.writeFile(path, "hi");
    expect(rt.exists(path)).toBe(true);
    expect(rt.readFile(path)).toBe("hi");
    expect(readFileSync(path, "utf-8")).toBe("hi");
  });

  it("imports a module by path", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "system-rt-")), "c.mjs");
    writeFileSync(path, "export default { deps: { a: 1 } }");
    const mod = await rt.importModule(path);
    expect(mod.get("default")).toStrictEqual({ deps: { a: 1 } });
  });
});

describe("nodeRuntime PATH and output", () => {
  it("puts a dir first on this process's PATH", () => {
    const own: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    const local = nodeRuntime({ env: own });
    local.prependPath("/opt/tool/bin");
    local.prependPath("/opt/tool/bin");
    expect(own.PATH).toBe(`/opt/tool/bin${delimiter}/usr/bin`);
    const empty: NodeJS.ProcessEnv = {};
    nodeRuntime({ env: empty }).prependPath("/x");
    expect(empty.PATH).toBe("/x");
  });

  it("resolves binaries and snapshots a PATH", () => {
    expect(rt.which(process.execPath)).toBe(process.execPath);
    expect(rt.which("system-definitely-missing", processPath())).toBeNull();
    expect(rt.ttyPath().path.length).toBeGreaterThan(0);
  });

  it("writes log lines to stdout, and errors and warnings to stderr", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    rt.log("l");
    rt.error("e");
    rt.warn("w");
    expect([stdout.mock.calls, stderr.mock.calls]).toStrictEqual([[["l\n"]], [["e\n"], ["w\n"]]]);
    vi.restoreAllMocks();
  });
});
