import { defineConfig } from "@workerstack/repo";

export default defineConfig({
  packs: ["agents", "standards", "docs"],
  link: { push: "allow" },
  workflow: "main",
  lint: {
    skip: [
      {
        files: ["packages/core/src/validate-config.ts"],
        reason:
          "validateConfig is the config boundary parser: it takes whatever the user's config module exported, " +
          "and every check inside it is a type predicate",
        rules: ["repo/no-unknown-parameters"],
      },
      {
        files: ["packages/playground/src/catalog-install.ts"],
        reason:
          "real installs run one at a time in dependsOn order: a dep needs its prerequisites installed first, " +
          "and apt, dnf, pacman, brew and choco each hold a lock",
        rules: ["eslint/no-await-in-loop"],
      },
    ],
  },
  agents: {
    defaultApproval: "ask",
    defaultEffort: "fast",
    defaultStrategy: "spawn-fast",
    hosts: ["claude", "codex", "antigravity", "grok", "cursor"],
  },
});
