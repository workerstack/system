# @workerstack/system

Formerly [`@lovrozagar/crossdeps`](https://www.npmjs.com/package/@lovrozagar/crossdeps). Same code and history, new name.

Every OS dependency a workerstack repo needs, from one config file: `go: "1.27.2"` installs Go on macOS, Linux (apt, dnf, pacman) and Windows. Custom deps keep the full form with your own commands.

The package's usage contract, with the built-in catalog, config, CLI and API, is [`packages/core/README.md`](packages/core/README.md). This file is for working on the repo.

## Repository layout

```
packages/core           the published package (@workerstack/system)
  src/builtins/         the built-in catalog, one file per group
  src/commands/         install, check, env, sync-pm, list
examples/consumer       a real consumer: the whole workerstack catalog plus one custom dep
e2e/app                 fixture configs, CLI and catalog tests over workspace:*
e2e/docker              apt / dnf / pacman images
e2e/catalog-install.ts  real install of one catalog group on this machine, then a version check
```

`packages/core` is the only published workspace.

## Develop

Requires [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun run test                 # unit tests, 100% line/branch/function/statement coverage gate
bun run test:unit            # the same without coverage
bun run test:consumers       # e2e app, catalog dry-runs on every OS target
bun run typecheck            # src and tests
bun run typecheck:consumers  # examples and e2e app, including @ts-expect-error config cases
bun run lint                 # oxlint
bun run fmt                  # oxfmt (fmt:check in CI)
bun run test:e2e:docker      # apt / dnf / pacman install paths in Docker
bun e2e/catalog-install.ts --group languages   # real installs; changes this machine
```

Commands take a `Runtime` (`src/runtime.ts`) for every effect, so unit tests drive them with `tests/unit/fake-runtime.ts` and only `src/bin.ts` touches `process`. `e2e/catalog-install.ts` reads `WORKERSTACK_SYSTEM_INSTALL_TIMEOUT_MS` (default 600000 per dep).

Adding a built-in: add it to its group file in `src/builtins/`, run `bun run test` (the catalog tests resolve every built-in on every OS and CPU), add its pinned version to `examples/consumer/system.config.ts`, and add its row to the package README table (a test checks every built-in is listed).

## CI

`.github/workflows/ci.yml`, on `main` and pull requests:

| Job                              | Runs                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `lint`                           | fmt check, oxlint, both typechecks                                                                      |
| `test`                           | unit tests with the coverage gate on Ubuntu; without it on macOS and Windows; consumer e2e on all three |
| `docker e2e`                     | apt / dnf / pacman install-path tests                                                                   |
| `catalog install`                | every catalog group really installed on Ubuntu, macOS and Windows, then checked for the pinned version  |
| `catalog install (dnf / pacman)` | the same in Fedora and Arch containers                                                                  |

## Releases

Pushing tag `vX.Y.Z` (equal to `packages/core/package.json` `version`) runs `.github/workflows/release.yml`: the gates, `npm publish --provenance` through npm trusted publishing (GitHub OIDC, no token), GitHub Packages, then a GitHub Release.

The trusted publisher on [npmjs.com/package/@workerstack/system](https://www.npmjs.com/package/@workerstack/system) is GitHub Actions, `workerstack` / `system`, workflow `release.yml`, no environment. Set it with:

```bash
npm trust github @workerstack/system --file release.yml --repo workerstack/system --allow-publish
```

Ship a version: bump `packages/core/package.json`, move the CHANGELOG's Unreleased section under the version, commit, push, then push the tag. The `Release` workflow can also be run by hand with an existing tag.

## License

MIT
