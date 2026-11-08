/**
 * Version parsing and matching for `check` and `install`.
 */

const DEFAULT_PATTERN = /(\d+\.\d+[\w.-]*)/

/** The first capture of `pattern` (a regex source), else the first dotted version, else null. */
export function parseVersion(output: string, pattern?: string): string | null {
	const match = output.match(pattern === undefined ? DEFAULT_PATTERN : new RegExp(pattern))
	return match?.[1] ?? null
}

function strip(version: string): string {
	return version.replace(/^v/, "")
}

/**
 * Whether `installed` satisfies the pinned `expected`.
 * - `latest` matches anything.
 * - Plain versions match when expected's dot segments prefix installed's: `22` matches `22.20.0`,
 *   `1.27.1` matches `1.27.1` and `1.27.1.4`, but never `1.27.10`.
 * - A prerelease or build tag (`-beta.12`, `+7`) on either side must match exactly.
 */
export function versionsMatch(installed: string, expected: string): boolean {
	if (expected === "latest") return true
	const have = strip(installed)
	const want = strip(expected)
	if (/[-+]/.test(have) || /[-+]/.test(want)) return have === want
	const haveParts = have.split(".")
	return want.split(".").every((part, i) => haveParts[i] === part)
}
