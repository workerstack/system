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
 * - Build metadata (`+9`, and anything after it) on the installed side is ignored unless the pin has some,
 *   as in semver: `21` matches Temurin's `21.0.13+9`. A pin with `+` matches exactly.
 * - A prerelease (`-beta.12`) on either side must match exactly.
 */
export function versionsMatch(installed: string, expected: string): boolean {
	if (expected === "latest") return true
	const want = strip(expected)
	const have = want.includes("+") ? strip(installed) : (strip(installed).split("+")[0] as string)
	if (/[-+]/.test(have) || /[-+]/.test(want)) return have === want
	const haveParts = have.split(".")
	return want.split(".").every((part, i) => haveParts[i] === part)
}
