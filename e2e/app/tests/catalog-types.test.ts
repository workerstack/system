import {
  defineConfig,
  detectOs,
  interpolate,
  resolveCheckCommand,
  resolveOsCommand,
  sortByDependencies,
} from "@workerstack/system";
import catalog from "@workerstack/system-example-consumer";
import { expect, test } from "vitest";

import { depOf, resolvedOn } from "./resolved.ts";

test("library helpers take the catalog's built-ins once resolved for this machine", () => {
  const os = detectOs();
  const deps = resolvedOn(os, process.arch);
  const order = sortByDependencies(Object.entries(deps)).map(([name]) => name);
  expect(resolveOsCommand("bun", depOf(deps, "bun"), os)).not.toBeNull();
  expect(resolveCheckCommand("node", depOf(deps, "node"))).toBe("node --version");
  expect(order.indexOf("bun")).toBeLessThan(order.indexOf("cf"));
  expect(interpolate("{{name}}-{{major}}", "node", depOf(deps, "node").version)).toMatch(/^node-\d+$/);
});

test("the config keeps each entry's own type: a built-in version string, a custom dep object", () => {
  const bunPin: string = catalog.deps.bun;
  const justVersion: string = catalog.deps.just.version;
  expect(depOf(resolvedOn("linux-apt"), "bun").version).toBe(bunPin);
  expect(justVersion).toBe("1.59.0");
});

test("defineConfig refuses malformed deps at compile time and passes them through at run time", () => {
  const refused = [
    // @ts-expect-error a version string alone is only for built-in names
    defineConfig({ deps: { "my-tool": "1.0.0" } }),
    // @ts-expect-error `verison` is not a field of a built-in override
    defineConfig({ deps: { go: { verison: "1.27.2" } } }),
    // @ts-expect-error a custom dep still needs os and required
    defineConfig({ deps: { "my-tool": { description: "x", version: "1.0.0" } } }),
  ];

  expect(refused.map((config) => Object.keys(config.deps))).toStrictEqual([["my-tool"], ["go"], ["my-tool"]]);
});
