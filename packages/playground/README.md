# @workerstack/system-playground

A small product that installs its OS dependencies with `@workerstack/system`, for checking the package by running it. Its `system.config.ts` is the whole workerstack catalog.

It consumes the package the way a product does: `workspace:*` and the `system` bin.

```sh
cd packages/playground
bun run setup:deps:check   # reports which deps are missing or at the wrong version
bun run setup:deps         # installs them
```

`setup:deps` really installs on this machine, with apt, dnf, pacman, brew or choco. Run `setup:deps:check` first.

The tests run the CLI from source against a no-op fixture config and against the real catalog with `--dry-run`:

```sh
bun run test               # unit and consumer tests, nothing is installed
bun run test:real-install  # downloads from GitHub releases
bun run typecheck
```

The files:

- `system.config.ts`: the catalog, its default export is the config.
- `src/just-release.ts`: a custom dep used by the catalog.
- `src/__fixtures__/consumer/system.config.ts`: the no-op fixture the tests run the CLI in.
- `src/*.test.ts`: the consumer tests, next to the code they cover.
- `src/real-install.e2e.ts`: the real-download tests behind `test:real-install`.
- `src/helpers.ts`, `src/resolved.ts`, `src/env.ts`: shared test helpers.
- `src/catalog-install.ts`, `src/catalog-run.ts`, `scripts/catalog-install.ts`: install one catalog group for real, run by CI through `bun run test:catalog-install --group <name>`.
