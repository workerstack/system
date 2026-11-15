---
description: Version pins
order: 50
---

# Versions

The installed version is the first `N.N…` in the check output, or `check.pattern`'s capture. It matches the pin when:

- the pin is `latest`;
- the pin's dot segments prefix the installed ones: `22` matches `22.20.0`, and `1.27.1` matches `1.27.1` but never `1.27.10`;
- a prerelease (`-beta.12`) is exact on both sides;
- build metadata (`+9`) on the installed side is ignored unless the pin has some, so `java: "21"` matches `21.0.13+9`.
