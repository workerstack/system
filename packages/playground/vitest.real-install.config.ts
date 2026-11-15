import { defineConfig } from "vitest/config";

/** Real downloads from GitHub releases: `test:real-install` runs them, the default suite leaves them out. */
export default defineConfig({
  test: {
    include: ["src/real-install.e2e.ts"],
  },
});
