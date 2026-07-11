---
name: saws-services
description: Analyze, use, create, or modify services in the SAWS TypeScript monorepo. Use when working with ServiceDefinition, DockerService, service dependency graphs, saws.ts configuration, lifecycle methods, environment injection, service outputs, clients, hosts, initialization, development, deployment, logs, migrations, or any package under packages/*-service or packages/*-client. Also use when adding a new SAWS service or client package.
---

# Work with SAWS services

Treat current code under `packages/` as authoritative.

## Read the right context

1. Read `AGENTS.md` and preserve its monorepo rules, especially the prohibition on tests and the requirement to update root `package.json` and `tsconfig.json` for new packages.
2. Read [references/architecture.md](references/architecture.md) for any graph, lifecycle, environment, outputs, secrets, host, or Docker work.
3. Read [references/catalog.md](references/catalog.md) when using or changing an existing service or client.
4. Read [references/authoring.md](references/authoring.md) before creating a service/client package or changing a public contract.
5. Inspect the exact current source files involved. References summarize the repository at skill creation time and cannot override code.

## Choose the abstraction

- Use `ServiceDefinition` for orchestration-only roots, non-container resources, and custom processes.
- Use `DockerService` for containerized services that share build/pull, network, environment-file, local/remote run, logs, labels, health-check, and restart behavior.
- Extend a more specific service only when the new service truly refines its semantics.
- Add a separate client package when application code should connect by service name without understanding injected variable names.

Prefer a thin subclass: declare config and state, delegate dependency traversal and common lifecycle behavior to `super`, and override only the protected extension points required by the service.

## Model composition deliberately

- Give every reachable service a unique `name`; CLI lookup rejects ambiguous names.
- Put a service in `dependencies` when it must start/deploy first or when its connection environment must be injected into the dependent.
- Add typed semantic dependencies automatically in the constructor, as `PowerSyncService` does for its two databases. Preserve caller-supplied dependencies.
- Reuse the same service object when several parents share it. Traversal may contain duplicates, while lifecycle flags prevent repeated `dev`/`deploy` during one run.
- Default-export one root `ServiceDefinition` from `saws.ts`. Use an orchestration-only root when the application has multiple top-level services.

## Implement lifecycle behavior

- `init()`: scaffold missing files and install dependencies. Make it idempotent and non-destructive. Users invoke it explicitly with `saws init <service-name>`.
- `dev()`: call `super.dev()` before starting the service unless deliberately replacing the parent runtime, as Hono does while still invoking `ServiceDefinition.prototype.dev` for dependencies and hooks.
- `deploy(stage)`: call `super.deploy(stage)` at the point where dependencies and `onDeploy` hooks must finish. Stage is never `local` through the deploy CLI.
- `logs(stage)`: stream or follow deployed logs; local logs are already part of `dev`.
- `exit()`: call `super.exit()`, abort work, terminate owned processes, and clean temporary resources.
- Expose extra service CLI commands with static `getCommands(services)` and scope them to instances of that exact constructor.

Do not assume `init()` runs during `dev()`. Do not add tests; validate with typecheck, lint/format checks, and focused dry runs or source inspection.

## Propagate configuration and connectivity

- Put user-supplied stage values in `environment: { [stage]: { KEY: value } }`. Values may be strings or lazy `SecretReference`s.
- For containers, merge dependency variables first, then stage variables, then service-owned runtime variables. This lets the service own reserved variables such as `PORT` or `POSTGRES_PASSWORD`.
- Implement `getEnvironmentVariables(stage, target)` only for values consumers need. Parameterize names from the provider service name: normalize non-alphanumerics to `_`, then uppercase.
- Distinguish `target: "container"` from `target: "host"`. Container consumers use Docker DNS names and internal ports; host consumers use localhost or externally reachable addresses and mapped ports.
- Prefer a typed `getConnectionInfo(stage, target)` as the single source for injected variables, outputs, and direct orchestration needs.
- Keep client lookup aligned with the service's exact environment-variable names. Resolve explicit overrides before injected runtime/process environment.
- Never log secret values. Resolve stage-aware secrets only after the stage is known.

## Extend DockerService safely

- Choose exactly one image source: an existing `image`, an explicit `dockerfile` plus optional `buildContext`, or the default `<service-name>/Dockerfile` convention.
- Remote Dockerfile deploys require a registry; registry credentials may use a `SecretReference`.
- Override `getContainerEnvironment`, `getDockerRunConfig`, and `onContainerStarted` instead of duplicating Docker orchestration.
- Merge arrays and records intentionally when overriding run config; do not silently discard caller-provided volumes, labels, or other compatible settings.
- Persist data in stage/service-specific named volumes by default.
- Publish host ports locally when developers need access. On deploy, keep databases/caches private unless the user explicitly configures a host port. Application HTTP services may intentionally publish/routable ports.
- Supply a meaningful health check for long-running services. Set `healthCheck: false` for one-shot ephemeral tasks.
- Use `runEphemeralContainer` for migrations and administrative jobs so local/remote networking, environment files, pulling, logging, and cleanup stay consistent.
- Write sensitive runtime files with mode `0600`; use a broader mode only for non-secret configuration that the container must read.

## Validate the change

1. Re-read the changed public config, lifecycle order, target-specific connection data, and cleanup paths.
2. Confirm exports, workspace membership, TypeScript project references, and inter-package dependencies.
3. Run formatting on changed files or `npm run fmt:check`.
4. Run `npm run tsc`; use `npm run check` when the scope warrants the full repository checks.
5. Do not write tests. Report any validation that requires Docker, a remote host, registry credentials, or secrets and was not run.
