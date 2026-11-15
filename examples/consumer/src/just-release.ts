/** just's release tarball for one platform, unpacked into ~/.local/bin. */
export function justRelease(platform: string): string {
  const url = `https://github.com/casey/just/releases/download/{{version}}/just-{{version}}-${platform}.tar.gz`;

  return [
    'tmp="$(mktemp -d)"',
    `curl -fsSL "${url}" | tar -xz -C "$tmp"`,
    'mkdir -p "$HOME/.local/bin"',
    'install -m 755 "$tmp/just" "$HOME/.local/bin/just"',
    'rm -rf "$tmp"',
  ].join(" && ");
}
