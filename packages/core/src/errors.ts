/** A config the CLI cannot act on. `main` prints the message and exits 1, without a stack. */
export class ConfigError extends Error {
	override name = "ConfigError"
}
