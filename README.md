# Concrete Service SAWS Prototype

This package prototypes a concrete-service SAWS architecture. It keeps the
dependency-graph configuration used by the original SAWS implementation while
making each service's runtime implementation explicit.

## Documentation

The documentation is organized as a navigable wiki:

- [Wiki home](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [CLI reference](./docs/cli.md)
- [Service lifecycle](./docs/service-lifecycle.md)
- [`DockerService`](./docs/docker-service.md)
- [`HonoHTTPService` and `HonoClient`](./docs/hono-http-service.md)
- [`PostgresDockerService`](./docs/postgres-docker-service.md)
- [`RustFSService` and `Files`](./packages/files/README.md)
- [Supporting APIs](./docs/supporting-apis.md)
- [Current limitations](./docs/limitations.md)

The prototype includes `DockerService` for general-purpose containers,
`HonoHTTPService` for TypeScript HTTP applications,
`PostgresDockerService` for persistent PostgreSQL containers, and
`RustFSService` with an S3-compatible `Files` adapter.

## Releasing packages

All `@saws/*` packages use one synchronized version. The version command also
updates exact internal `@saws/*` dependency pins and `package-lock.json`.

```sh
# Set an exact version.
npm run version:bump -- 1.0.0

# Use a stable SemVer increment.
npm run version:bump -- patch

# Start the next patch beta, then increment subsequent betas.
npm run version:bump -- beta
```

`premajor`, `preminor`, `prepatch`, and `prerelease` are also supported. Pass
`--preid rc` (or another identifier) to use a prerelease tag other than
`beta`.

After reviewing and committing the version changes, push a matching tag:

```sh
git tag v1.0.0-beta.0
git push origin v1.0.0-beta.0
```

The publish workflow tests and builds the repository, then publishes every
package in dependency order. Stable versions use the npm `latest` dist-tag.
Prerelease versions use their prerelease identifier, so `1.0.0-beta.0` is
published with the npm `beta` dist-tag.

To inspect the packages and publish order without releasing anything, run
`npm run release:publish -- v1.0.0-beta.0 --dry-run`.

For tokenless publishing, configure `.github/workflows/publish.yml` as the
trusted GitHub Actions publisher for each package on npm. A repository
`NPM_TOKEN` secret can be used instead, including to bootstrap packages that
have not yet been published.
