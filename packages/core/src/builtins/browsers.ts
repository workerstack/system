/**
 * Containers and browsers: docker, chromium, google-chrome, firefox, epiphany, lightpanda, playwright.
 */

import {
  apt,
  aur,
  binary,
  launcher,
  LOCAL_BIN,
  localBinEnv,
  linuxPackage,
  macApp,
  pick,
  WIN_PROGRAMS,
  winExeVersion,
  winTree,
} from "./recipes.ts";
import type { BuiltinDep } from "./types.ts";

const CHROME_MAC_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Prints the version only when Playwright's Chromium is on disk. `bunx playwright@<v> --version` alone
 * always succeeds (bunx fetches the CLI), which would make `install` skip the browser download.
 */
const PLAYWRIGHT_CHECK =
  "bun -e \"const r=Bun.spawnSync(['bunx','playwright@{{version}}','install','--dry-run','chromium']);" +
  "const m=r.stdout.toString().match(/Install location:\\s*(.+)/);" +
  "if(m&&require('fs').existsSync(m[1].trim()))console.log('{{version}}');else process.exit(1)\"";

/** The browser built-ins by name, with the container engine browser tests run in. */
export const BROWSERS: Readonly<
  Record<"chromium" | "docker" | "epiphany" | "firefox" | "google-chrome" | "lightpanda" | "playwright", BuiltinDep>
> = {
  chromium: {
    check: (os) => (os === "windows" ? winExeVersion("%LOCALAPPDATA%\\Programs\\chromium\\chrome.exe") : undefined),
    description: "Chromium, the browser rail fallback (distro package on Linux, the official snapshot elsewhere)",
    env: (os) => (os === "windows" ? [{ path: `${WIN_PROGRAMS}\\chromium` }] : localBinEnv(os)),
    os: ({ arch }) => {
      // brew's cask is disabled and choco's lags; both only repackaged these snapshots
      const snapshots = "https://storage.googleapis.com/chromium-browser-snapshots";
      const mac = `${snapshots}/${pick(arch, { arm64: "Mac_Arm", x64: "Mac" })}`;
      const win = `${snapshots}/${pick(arch, { arm64: "Win_Arm64", x64: "Win_x64" })}`;

      return {
        "linux-apt": `${apt("chromium")} || sudo snap install chromium`,
        // Fedora names the binary chromium-browser; link the name check and the browser rail use
        "linux-dnf":
          `sudo dnf install -y chromium && mkdir -p "${LOCAL_BIN}" && ` +
          `ln -sf /usr/bin/chromium-browser "${LOCAL_BIN}/chromium"`,
        "linux-pacman": "sudo pacman -S --noconfirm chromium",
        macos: [
          `rev="$(curl -fsSL "${mac}/LAST_CHANGE")"`,
          macApp(`${mac}/$rev/chrome-mac.zip`, "Chromium.app"),
          launcher("chromium", "$HOME/Applications/Chromium.app/Contents/MacOS/Chromium"),
        ].join(" && "),
        windows: winTree(
          `${win}/$(Invoke-RestMethod '${win}/LAST_CHANGE')/chrome-win.zip`,
          `${WIN_PROGRAMS}\\chromium`,
          { nested: true },
        ),
      };
    },
    versions: "latest",
  },
  docker: {
    dependsOn: ["brew", "choco"],
    description: "Container engine with its daemon (Docker Engine on Linux, Docker Desktop elsewhere)",
    os: () => ({
      "linux-apt": 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"',
      "linux-dnf": 'curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker "$USER"',
      "linux-pacman":
        "sudo pacman -S --noconfirm docker docker-buildx docker-compose && " +
        'sudo systemctl enable --now docker.service && sudo usermod -aG docker "$USER"',
      macos: "brew install --cask docker-desktop",
      windows: "choco install docker-desktop -y",
    }),
    versions: "latest",
  },
  epiphany: {
    description: "GNOME Web (Epiphany), the WebKit browser on Linux; Safari ships with macOS and cannot be installed",
    os: () => ({
      "linux-apt": apt("epiphany-browser"),
      "linux-dnf": "sudo dnf install -y epiphany",
      "linux-pacman": "sudo pacman -S --noconfirm epiphany",
      macos: false,
      windows: false,
    }),
    versions: "latest",
  },
  firefox: {
    check: (os) => (os === "windows" ? winExeVersion("%ProgramFiles%\\Mozilla Firefox\\firefox.exe") : undefined),
    dependsOn: ["brew", "choco"],
    description: "Mozilla Firefox (Mozilla's own APT repo on Debian and Ubuntu, never the snap)",
    os: () => ({
      "linux-apt": [
        "sudo install -d -m 0755 /etc/apt/keyrings",
        "curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg | sudo tee /etc/apt/keyrings/packages.mozilla.org.asc > /dev/null",
        'echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] https://packages.mozilla.org/apt mozilla main" ' +
          "| sudo tee /etc/apt/sources.list.d/mozilla.list > /dev/null",
        // outrank Ubuntu's firefox package, which only installs the snap
        "printf 'Package: *\\nPin: origin packages.mozilla.org\\nPin-Priority: 1000\\n' " +
          "| sudo tee /etc/apt/preferences.d/mozilla > /dev/null",
        apt("firefox"),
      ].join(" && "),
      "linux-dnf": "sudo dnf install -y firefox",
      "linux-pacman": "sudo pacman -S --noconfirm firefox",
      macos: "brew install --cask firefox",
      windows: "choco install firefox -y",
    }),
    versions: "latest",
  },
  "google-chrome": {
    check: (os) =>
      os === "windows" ? winExeVersion("%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe") : undefined,
    dependsOn: ["brew", "choco"],
    description: "Google Chrome (Google's package on Linux, built from the AUR on Arch)",
    env: localBinEnv,
    os: ({ arch }) => {
      const direct = "https://dl.google.com/linux/direct/google-chrome-stable_current";

      return {
        "linux-apt": linuxPackage(`${direct}_${pick(arch, { arm64: "arm64", x64: "amd64" })}.deb`, "deb"),
        "linux-dnf": linuxPackage(`${direct}_${pick(arch, { arm64: "aarch64", x64: "x86_64" })}.rpm`, "rpm"),
        // the AUR package names its launcher google-chrome-stable; Google's .deb and .rpm ship both names
        "linux-pacman":
          `${aur("google-chrome")} && mkdir -p "${LOCAL_BIN}" && ` +
          `ln -sf /usr/bin/google-chrome-stable "${LOCAL_BIN}/google-chrome"`,
        // the cask puts nothing on PATH
        macos: `brew install --cask google-chrome && ${launcher("google-chrome", CHROME_MAC_BINARY)}`,
        windows: "choco install googlechrome -y",
      };
    },
    versions: "latest",
  },
  lightpanda: {
    check: { command: "lightpanda version" },
    description: "Lightpanda, the default headless browser rail (nightly; no Windows build)",
    env: localBinEnv,
    os: ({ arch }) => {
      const base = "https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda";
      const cpu = pick(arch, { arm64: "aarch64", x64: "x86_64" });
      const linux = binary(`${base}-${cpu}-linux`, "lightpanda");

      return {
        "linux-apt": linux,
        "linux-dnf": linux,
        "linux-pacman": linux,
        macos: binary(`${base}-${cpu}-macos`, "lightpanda"),
        windows: false,
      };
    },
    versions: "latest",
  },
  playwright: {
    check: { command: PLAYWRIGHT_CHECK },
    dependsOn: ["bun"],
    description: "Playwright's Chromium for browser tests (version = your @playwright/test)",
    os: ({ version }) => {
      const browserOnly = `bunx playwright@${version} install chromium`;

      return {
        // --with-deps installs the shared libraries through apt; other distros only get the browser
        "linux-apt": `bunx playwright@${version} install --with-deps chromium`,
        "linux-dnf": browserOnly,
        "linux-pacman": browserOnly,
        macos: browserOnly,
        windows: browserOnly,
      };
    },
    versions: "pinned",
  },
};
