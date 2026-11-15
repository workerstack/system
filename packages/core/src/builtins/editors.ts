/**
 * Editors: vscode, t3code.
 */

import {
	LOCAL_BIN,
	LOCAL_SHARE,
	linuxPackage,
	localBinEnv,
	macApp,
	pick,
	tree,
	WIN_PROGRAMS,
	winInstaller,
	winVersionCheck,
} from "./recipes.ts"
import type { OsTarget, SystemDepConfig } from "../config.ts"
import type { BuiltinDep } from "./types.ts"

const T3_DIR = `${LOCAL_SHARE}/t3code`

/**
 * The release AppImage in `$HOME/.local/share/t3code` under its versioned name, with a `t3code` launcher and a
 * desktop entry. The app's updater writes each new version under its own versioned name, so the launcher
 * runs whichever AppImage is there and the check reads the version from the name.
 */
function appImage(url: string): string {
	const file = url.split("/").pop() as string
	return [
		`mkdir -p "${T3_DIR}" "${LOCAL_BIN}" "${LOCAL_SHARE}/applications"`,
		`rm -f "${T3_DIR}"/T3-Code-*.AppImage`,
		`curl -fsSL "${url}" -o "${T3_DIR}/${file}"`,
		`chmod +x "${T3_DIR}/${file}"`,
		`printf '#!/bin/sh\\nfor app in "$HOME"/.local/share/t3code/T3-Code-*.AppImage; do :; done\\nexec "$app" "$@"\\n' > "${LOCAL_BIN}/t3code"`,
		`chmod +x "${LOCAL_BIN}/t3code"`,
		`printf '[Desktop Entry]\\nType=Application\\nName=T3 Code\\nExec=%s %%U\\nTerminal=false\\nCategories=Development;\\nStartupWMClass=com.t3tools.T3Code\\n' "${LOCAL_BIN}/t3code" > "${LOCAL_SHARE}/applications/t3code.desktop"`,
	].join(" && ")
}

/** Read the installed version from package or bundle metadata: launching an Electron app opens a window. */
function t3Check(os: OsTarget): SystemDepConfig["check"] {
	if (os === "linux-apt") return { command: "dpkg-query -W -f '${Version}' t3code" }
	if (os === "macos") {
		return { command: 'defaults read "$HOME/Applications/T3 Code (Beta).app/Contents/Info" CFBundleShortVersionString' }
	}
	if (os === "windows") {
		/* the per-user installer's uninstall entry, keyed by the app's fixed product code */
		return winVersionCheck(
			"(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\e9197887-efb3-55e0-985e-d6d3b5dd594a').DisplayVersion",
		)
	}
	return { command: `ls "${T3_DIR}"`, pattern: "T3-Code-(\\d+\\.\\d+\\.\\d+)" }
}

export const EDITORS = {
	t3code: {
		check: t3Check,
		description: "T3 Code, the desktop GUI for coding agents (pin a release; it updates itself after that)",
		env: localBinEnv,
		os: ({ arch, version }) => {
			const base = `https://github.com/pingdotgg/t3code/releases/download/v${version}/T3-Code-${version}`
			const image = appImage(`${base}-${pick(arch, { arm64: "arm64", x64: "x86_64" })}.AppImage`)
			return {
				"linux-apt": linuxPackage(`${base}-${pick(arch, { arm64: "arm64", x64: "amd64" })}.deb`, "deb"),
				"linux-dnf": image,
				"linux-pacman": image,
				macos: macApp(`${base}-${arch}.zip`, "T3 Code (Beta).app"),
				windows: winInstaller(`${base}-${arch}.exe`, ["/S"]),
			}
		},
		versions: "pinned",
	},
	vscode: {
		check: { command: "code --version" },
		description: "Visual Studio Code, any release or latest (it updates itself on macOS and Windows)",
		env: (os) => [{ path: os === "windows" ? `${WIN_PROGRAMS}\\Microsoft VS Code\\bin` : LOCAL_BIN }],
		os: ({ arch, version }) => {
			const url = (platform: string) => `https://update.code.visualstudio.com/${version}/${platform}/stable`
			return {
				"linux-apt": linuxPackage(url(`linux-deb-${arch}`), "deb"),
				"linux-dnf": linuxPackage(url(`linux-rpm-${arch}`), "rpm"),
				/* Arch's own `code` is Code - OSS without Microsoft's marketplace; use Microsoft's tarball */
				"linux-pacman": tree(url(`linux-${arch}`), `${LOCAL_SHARE}/vscode`, { bins: ["bin/code"], nested: true }),
				macos: [
					macApp(url("darwin-universal"), "Visual Studio Code.app"),
					`mkdir -p "${LOCAL_BIN}"`,
					`ln -sf "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" "${LOCAL_BIN}/code"`,
				].join(" && "),
				windows: winInstaller(url(`win32-${arch}-user`), [
					"/VERYSILENT",
					"/SUPPRESSMSGBOXES",
					"/NORESTART",
					"/MERGETASKS=!runcode,addtopath",
				]),
			}
		},
		versions: "any",
	},
} satisfies Record<string, BuiltinDep>
