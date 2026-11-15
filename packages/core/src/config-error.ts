/** A config the CLI cannot act on. `main` prints the message and exits 1, without a stack. */
export class ConfigError extends Error {
  /** Always "ConfigError", so a caller can tell it from other errors after a structured clone. */
  override name = "ConfigError";
}
