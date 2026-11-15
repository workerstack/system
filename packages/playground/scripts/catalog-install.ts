#!/usr/bin/env bun
/**
 * Really install every built-in in one catalog group on this machine, then require `check` to report the
 * pinned version (any parsed version for `latest`). CI runs one job per OS × group, so apt, dnf, pacman,
 * brew and choco all execute for real, not just --dry-run.
 *
 *   bun packages/playground/scripts/catalog-install.ts --group languages
 */
import { main } from "../src/catalog-install.ts";

await main(process.argv);
