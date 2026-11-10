/**
 * Payments: the Stripe CLI.
 */

import { archive, localBinEnv, pick, unix, winArchive } from "./recipes.ts"
import type { BuiltinDep } from "./types.ts"

export const PAYMENTS = {
	stripe: {
		description: "Stripe CLI, for local webhooks, fixtures and API calls",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/stripe/stripe-cli/releases/download/v${version}/stripe_${version}`
			const a = pick(arch, { arm64: "arm64", x64: "x86_64" })
			return {
				...unix(
					archive(`${base}_linux_${a}.tar.gz`, "stripe", "stripe"),
					archive(`${base}_mac-os_${a}.tar.gz`, "stripe", "stripe"),
				),
				/* no arm64 build; Windows on Arm runs the x64 one */
				windows: winArchive(`${base}_windows_x86_64.zip`, "stripe.exe", "stripe"),
			}
		},
		versions: "pinned",
	},
} satisfies Record<string, BuiltinDep>
