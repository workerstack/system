import { expect, it } from "vitest";

import { ConfigError } from "../config-error.ts";
import { BUILTINS, check, command } from "./catalog-fixtures.ts";
import { resolveDeps } from "./resolve.ts";

const FIREFOX_APT_TAIL = /sudo apt-get update && sudo apt-get install -y firefox$/;
const VSCODE_PACMAN_DEPS = /^sudo pacman -S --needed --noconfirm alsa-lib gtk3 libsecret libxkbfile nss && /;

it("verified recipes chromium uses the distro on Linux and the official snapshot for the CPU elsewhere", () => {
  const snapshots = "https://storage.googleapis.com/chromium-browser-snapshots";
  expect(command("chromium", "macos", { arch: "arm64" })).toContain(
    `rev="$(curl -fsSL "${snapshots}/Mac_Arm/LAST_CHANGE")"`,
  );
  expect(command("chromium", "macos", { arch: "arm64" })).toContain(`${snapshots}/Mac_Arm/$rev/chrome-mac.zip`);
  expect(command("chromium", "macos", { arch: "x64" })).toContain(`${snapshots}/Mac/$rev/chrome-mac.zip`);
  expect(command("chromium", "macos", { arch: "x64" })).toContain(
    '"$HOME/Applications/Chromium.app/Contents/MacOS/Chromium"',
  );
  expect(command("chromium", "windows", { arch: "x64" })).toContain(
    `"${snapshots}/Win_x64/$(Invoke-RestMethod '${snapshots}/Win_x64/LAST_CHANGE')/chrome-win.zip"`,
  );
  expect(command("chromium", "windows", { arch: "arm64" })).toContain(`${snapshots}/Win_Arm64/`);
  expect(command("chromium", "linux-pacman")).toBe("sudo pacman -S --noconfirm chromium");
  expect(check("chromium", "windows")).toStrictEqual({
    command:
      `powershell -NoProfile -Command "(Get-Item '%LOCALAPPDATA%\\Programs\\chromium\\chrome.exe')` +
      `.VersionInfo.ProductVersion"`,
  });
  expect(check("chromium", "macos")).toBeUndefined();
});

it("verified recipes google-chrome: Google's package per CPU, the AUR build on Arch, a PATH launcher on macOS", () => {
  const direct = "https://dl.google.com/linux/direct/google-chrome-stable_current";
  expect(command("google-chrome", "linux-apt", { arch: "x64" })).toContain(`${direct}_amd64.deb`);
  expect(command("google-chrome", "linux-apt", { arch: "arm64" })).toContain(`${direct}_arm64.deb`);
  expect(command("google-chrome", "linux-apt", { arch: "x64" })).toContain(
    'sudo apt-get install -y "$tmp/package.deb"',
  );
  expect(command("google-chrome", "linux-dnf", { arch: "x64" })).toContain(`${direct}_x86_64.rpm`);
  expect(command("google-chrome", "linux-dnf", { arch: "arm64" })).toContain(`${direct}_aarch64.rpm`);
  expect(command("google-chrome", "linux-pacman")).toContain(
    'git clone --depth 1 "https://aur.archlinux.org/google-chrome.git" "$tmp/google-chrome" && (cd "$tmp/google-chrome" && makepkg -si --noconfirm)',
  );
  expect(command("google-chrome", "linux-pacman")).toContain(
    'ln -sf /usr/bin/google-chrome-stable "$HOME/.local/bin/google-chrome"',
  );
  expect(command("google-chrome", "macos")).toContain("brew install --cask google-chrome && ");
  expect(command("google-chrome", "macos")).toContain('"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"');
  expect(command("google-chrome", "windows")).toBe("choco install googlechrome -y");
  expect(check("google-chrome", "windows")?.command).toContain(
    "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
  );
});

it("verified recipes firefox comes from Mozilla's APT repo, pinned over Ubuntu's snap package", () => {
  const apt = command("firefox", "linux-apt") ?? "";
  expect(apt).toContain("https://packages.mozilla.org/apt/repo-signing-key.gpg");
  expect(apt).toContain("https://packages.mozilla.org/apt mozilla main");
  expect(apt).toContain("Pin-Priority: 1000");
  expect(apt).toMatch(FIREFOX_APT_TAIL);
  expect(command("firefox", "macos")).toBe("brew install --cask firefox");
  expect(command("firefox", "windows")).toBe("choco install firefox -y");
  expect(check("firefox", "windows")?.command).toContain("%ProgramFiles%\\Mozilla Firefox\\firefox.exe");
  expect(check("firefox", "linux-dnf")).toBeUndefined();
});

it("verified recipes epiphany is Linux-only, under Debian's package name on apt", () => {
  expect(command("epiphany", "linux-apt")).toBe("sudo apt-get update && sudo apt-get install -y epiphany-browser");
  expect(command("epiphany", "linux-dnf")).toBe("sudo dnf install -y epiphany");
  expect(command("epiphany", "macos")).toBeUndefined();
  expect(command("epiphany", "windows")).toBeUndefined();
});

it("verified recipes vscode installs the requested release for each platform", () => {
  const update = "https://update.code.visualstudio.com";
  expect(command("vscode", "linux-apt", { arch: "arm64", version: "1.95.0" })).toContain(
    `${update}/1.95.0/linux-deb-arm64/stable`,
  );
  expect(command("vscode", "linux-dnf", { arch: "x64", version: "latest" })).toContain(
    `${update}/latest/linux-rpm-x64/stable`,
  );
  expect(command("vscode", "linux-pacman", { arch: "x64", version: "1.95.0" })).toMatch(VSCODE_PACMAN_DEPS);
  expect(command("vscode", "linux-pacman", { arch: "x64", version: "1.95.0" })).toContain(
    `${update}/1.95.0/linux-x64/stable`,
  );
  expect(command("vscode", "linux-pacman", { arch: "x64", version: "1.95.0" })).toContain(
    'ln -sf "$HOME/.local/share/vscode/bin/code" "$HOME/.local/bin/code"',
  );
  expect(command("vscode", "macos", { arch: "arm64", version: "1.95.0" })).toContain(
    `${update}/1.95.0/darwin-universal/stable`,
  );
  const windows = command("vscode", "windows", { arch: "arm64", version: "1.95.0" });
  expect(windows).toContain(`${update}/1.95.0/win32-arm64-user/stable`);
  expect(windows).toContain("'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/MERGETASKS=!runcode,addtopath'");
  expect(windows).toContain("if ($p.ExitCode -ne 0)");
  expect(BUILTINS.vscode?.env?.("windows")).toStrictEqual([
    { path: "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\bin" },
  ]);
  expect(check("vscode", "windows")).toStrictEqual({ command: "code --version" });
});

it("verified recipes t3code installs the pinned release and reads its version without launching it", () => {
  const base = "https://github.com/pingdotgg/t3code/releases/download/v0.1.9/T3-Code-0.1.9";
  expect(command("t3code", "linux-apt", { arch: "x64", version: "0.1.9" })).toContain(`${base}-amd64.deb`);
  expect(command("t3code", "linux-apt", { arch: "arm64", version: "0.1.9" })).toContain(`${base}-arm64.deb`);
  expect(command("t3code", "linux-dnf", { arch: "x64", version: "0.1.9" })).toContain(
    `curl -fsSL "${base}-x86_64.AppImage" -o "$HOME/.local/share/t3code/T3-Code-0.1.9-x86_64.AppImage"`,
  );
  expect(command("t3code", "linux-pacman", { arch: "arm64", version: "0.1.9" })).toContain(`${base}-arm64.AppImage`);
  expect(command("t3code", "macos", { arch: "x64", version: "0.1.9" })).toContain(`${base}-x64.zip`);
  expect(command("t3code", "windows", { arch: "arm64", version: "0.1.9" })).toContain(`${base}-arm64.exe`);
  expect(check("t3code", "linux-apt")).toStrictEqual({ command: "dpkg-query -W -f '${Version}' t3code" });
  expect(check("t3code", "linux-pacman")).toStrictEqual({
    command: 'ls "$HOME/.local/share/t3code"',
    pattern: "T3-Code-(\\d+\\.\\d+\\.\\d+)",
  });
  expect(check("t3code", "macos")?.command).toContain('"$HOME/Applications/T3 Code (Beta).app/Contents/Info"');
  expect(check("t3code", "windows")?.command).toContain(
    "Uninstall\\e9197887-efb3-55e0-985e-d6d3b5dd594a').DisplayVersion",
  );
  expect(() => resolveDeps({ t3code: "latest" }, { arch: "x64", os: "macos" }, BUILTINS)).toThrow(ConfigError);
});
