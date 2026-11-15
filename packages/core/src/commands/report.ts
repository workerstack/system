/**
 * Output shared by the commands that walk the deps: headers, rules, badges and the unknown-target error.
 */

import type { SystemDepConfig } from "../config.ts";
import type { Context } from "../probe.ts";

/** The line between report sections, 50 wide. */
export const RULE = "==================================================";

/** `[required]` or `[optional]`. */
export function badge(config: SystemDepConfig): string {
  return config.required ? "[required]" : "[optional]";
}

/** Print the report title, the detected OS and a rule. */
export function header(ctx: Context, title: string): void {
  ctx.rt.log(`@workerstack/system — ${title}`);
  ctx.rt.log(`Detected OS: ${ctx.os}`);
  ctx.rt.log(RULE);
}

/** The config of the dep the command names, or undefined after printing which deps there are. */
export function targetDep(ctx: Context, target: string): SystemDepConfig | undefined {
  const config = ctx.deps[target];

  if (config === undefined) {
    ctx.rt.error(`Unknown dependency: ${target}`);
    ctx.rt.log(`Available: ${Object.keys(ctx.deps).join(", ")}`);
  }

  return config;
}
