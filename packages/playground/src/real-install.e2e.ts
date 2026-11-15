import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { detectOs, type OsTarget, type SystemDepConfig } from "@workerstack/system";
/**
 * Real downloads from GitHub releases, so not a *.test.ts: `bun run test:consumers` leaves it out, and CI and the
 * Linux docker images run it through `bun run test:real-install` (its own vitest config).
 */
import { expect, test } from "vitest";

import { fixture, output, perOs, runIn, writeConfig } from "./helpers.ts";

const fetchToDest = [
  "const dest=process.env.DEST",
  "const res=await fetch(process.env.URL)",
  'if(!res.ok) throw new Error("download failed "+res.status+" "+process.env.URL)',
  "await Bun.write(dest, await res.arrayBuffer())",
  'const {chmodSync}=await import("node:fs")',
  "chmodSync(dest, 0o755)",
].join("; ");

const fetchArchiveToDir = [
  "const dest=process.env.DEST",
  "const url=process.env.URL",
  'const archive=dest+".dl"',
  "const res=await fetch(url)",
  'if(!res.ok) throw new Error("download failed "+res.status+" "+url)',
  "await Bun.write(archive, await res.arrayBuffer())",
  'const {execSync}=await import("node:child_process")',
  'const {dirname}=await import("node:path")',
  'execSync("tar -xf "+JSON.stringify(archive)+" -C "+JSON.stringify(dirname(dest)), {stdio:"inherit"})',
].join("; ");

type RealTool = { check: string; file: string; isArchive: boolean; name: string; url: string; version: string };

const JQ = "https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq";
const STRIPE = "https://github.com/stripe/stripe-cli/releases/download/v1.35.0/stripe_1.35.0";
const CLOUDFLARED = "https://github.com/cloudflare/cloudflared/releases/download/2026.2.0/cloudflared";

/** Each tool's release asset suffix for this OS and CPU. */
function assets(os: OsTarget) {
  const cpu = process.arch === "arm64" ? "arm64" : "amd64";
  const stripeCpu = process.arch === "arm64" ? "arm64" : "x86_64";

  if (os === "windows")
    return { cloudflared: "windows-amd64.exe", jq: "windows-amd64.exe", stripe: "windows_x86_64.zip" };

  if (os === "macos")
    return { cloudflared: `darwin-${cpu}.tgz`, jq: `macos-${cpu}`, stripe: `mac-os_${stripeCpu}.tar.gz` };

  return { cloudflared: `linux-${cpu}`, jq: `linux-${cpu}`, stripe: `linux_${stripeCpu}.tar.gz` };
}

/** macOS ships cloudflared as an archive; stripe is one everywhere. */
function realTools(os: OsTarget): RealTool[] {
  const asset = assets(os);
  const exe = os === "windows" ? ".exe" : "";
  const jq = { check: "--version", file: `jq${exe}`, isArchive: false, name: "jq", version: "1.8.1" };
  const stripe = { check: "version", file: `stripe${exe}`, isArchive: true, name: "stripe-cli", version: "1.35.0" };
  const cf = { check: "--version", file: `cloudflared${exe}`, isArchive: os === "macos", name: "cloudflared" };

  return [
    { ...jq, url: `${JQ}-${asset.jq}` },
    { ...stripe, url: `${STRIPE}_${asset.stripe}` },
    { ...cf, url: `${CLOUDFLARED}-${asset.cloudflared}`, version: "2026.2.0" },
  ];
}

/** A config with one dep per tool that downloads its URL to DEST, and checks the binary there. */
function writeRealConfig(dir: string, tools: readonly RealTool[]): void {
  const deps = tools.map((tool): [string, SystemDepConfig] => {
    const os = perOs(() => `bun -e ${JSON.stringify(tool.isArchive ? fetchArchiveToDir : fetchToDest)}`);
    const check = { command: `${join(dir, "bin", tool.file)} ${tool.check}` };

    return [tool.name, { check, description: tool.name, os, required: true, version: tool.version }];
  });

  writeConfig(dir, Object.fromEntries(deps));
}

/** What installing then checking `tool` showed, with both runs' output for a failure message. */
type InstallOutcome = { checked: boolean; installed: boolean; log: string };

const OK = { checked: true, installed: true };

async function installAndCheck(dir: string, tool: RealTool): Promise<InstallOutcome> {
  const install = await runIn(dir, ["install", tool.name], { DEST: join(dir, "bin", tool.file), URL: tool.url });
  const check = await runIn(dir, ["check", tool.name]);

  return {
    checked: check.exitCode === 0 && check.stdout.includes(`${tool.name}@`),
    installed: install.exitCode === 0 && install.stdout.includes("Installed successfully"),
    log: `${tool.name}\n${output(install)}\n${output(check)}`,
  };
}

test("downloads, installs and checks jq, stripe-cli and cloudflared", async () => {
  const tools = realTools(detectOs());
  const dir = fixture("system-bins-", {});
  mkdirSync(join(dir, "bin"));
  writeRealConfig(dir, tools);
  const outcomes = await Promise.all(tools.map(async (tool) => await installAndCheck(dir, tool)));

  for (const { checked, installed, log } of outcomes) expect({ checked, installed }, log).toStrictEqual(OK);
}, 120_000);
