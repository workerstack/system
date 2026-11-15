/**
 * Reading package.json fields without trusting its shape.
 */

import { PACKAGE_MANAGER_KEY } from "./package-json.constants.ts";

/** A parsed package.json, as its fields in file order. */
export type PackageJson = ReadonlyMap<string, unknown>;

function isJsonObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** The fields of `json`, or null when it is valid JSON but not an object. */
export function parsePackageJson(json: string): PackageJson | null {
  const pkg: unknown = JSON.parse(json);

  return isJsonObject(pkg) ? new Map(Object.entries(pkg)) : null;
}

/** The `packageManager` field of `json` when it is a string, else undefined. */
export function readPackageManager(json: string): string | undefined {
  const value = parsePackageJson(json)?.get(PACKAGE_MANAGER_KEY);

  return isString(value) ? value : undefined;
}
