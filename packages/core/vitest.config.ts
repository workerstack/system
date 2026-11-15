import { defineConfig } from "vitest/config";

import { FULL_COVERAGE } from "./full-coverage.constants.ts";

export default defineConfig({
  test: {
    coverage: {
      // bin.ts is the 3-line process entry; e2e runs it as a subprocess, which v8 cannot see
      exclude: ["src/bin.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: FULL_COVERAGE,
        functions: FULL_COVERAGE,
        lines: FULL_COVERAGE,
        statements: FULL_COVERAGE,
      },
    },
    exclude: ["**/node_modules/**", "**/dist/**"],
    include: ["tests/**/*.test.ts"],
  },
});
