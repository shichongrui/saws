# SAWS service architecture

## Contents

- Design intent
- Configuration and discovery
- Dependency graph
- Lifecycle
- Environment and connectivity
- Outputs and clients
- Secrets
- Docker execution and hosts
- Current cautions

## Design intent

SAWS represents an application as a graph of service objects. Each service knows how to initialize its project assets, run in development, deploy for a named stage, expose connection information to dependents, provide logs, and clean up. A dependent should connect to a provider without maintaining separate local and deployed configuration.

The design emphasizes rapid composition, local/deployed parity, convention-driven scaffolding, dependencies as both ordering and connectivity, and clients constructed from a service name. Services deploy Docker workloads locally or to configured Linux hosts.

## Configuration and discovery

`saws.ts` is an ESM TypeScript module whose default export is a `ServiceDefinition`. Named exports may include `Host` objects for host-management commands.

The default CLI path is `./saws.ts`. The root may be a real service or an orchestration-only `ServiceDefinition`:

```ts
import { ServiceDefinition } from "@saws/core";

export default new ServiceDefinition({
  name: "application",
  dependencies: [api, worker],
});
```

`findServiceDefinition` walks by object identity, requires exactly one matching name, and reports all available names when none match. Keep names unique across the reachable graph.

At CLI startup, services are grouped by constructor. A constructor's static `getCommands(services)` can register commands scoped to all instances of that class.

## Dependency graph

`ServiceDefinition.dependencies` is an ordered list.

- `dev()` visits each direct dependency sequentially, calls its recursive `dev()`, then marks that dependency `deved`.
- `deploy(stage)` does the same with `deployed`.
- Hooks for a service run after its dependencies.
- `getDependenciesEnvironmentVariables()` asks direct dependencies for their exported variables. It does not recursively flatten grandchildren unless a direct dependency itself exports them.
- `getAllDependencies()` recursively returns `[self, direct child, child descendants, ...]` without deduplication. CLI dev presentation deduplicates by object identity.

There is no explicit cycle detection. Avoid cycles. Reuse a single instance for a shared dependency.

## Lifecycle

### init

The base method is a no-op. `saws init <service-name>` locates one service and invokes only its `init()`. It does not initialize dependencies. Current `saws dev` does not invoke initialization.

Initialization should create only missing user-editable files, create required directories, update workspace/project metadata when needed, and install missing dependencies. `HonoService` demonstrates project scaffolding; `PostgresService` creates migrations and ensures dbmate; `PowerSyncService` creates/configures its YAML.

### dev

The dev CLI sets `NODE_ENV=development`, `STAGE=local`, and currently `AWS_REGION=us-west-2`, builds a service list for logging, installs exit handlers, and invokes root `dev()`.

Base `dev()`:

1. Emits a start log.
2. Develops dependencies in order unless already marked.
3. Starts `onDev` hooks without awaiting their lifetime.

String hooks run in the service directory through `runLocal`. Function hooks receive an `AbortSignal` and log callback. Hook log tabs are named `<service>: onDev <index>`.

### deploy

The deploy CLI requires a nonempty non-local stage, sets `STAGE`, loads the root, and calls `root.deploy(stage)`.

Base `deploy()` deploys dependencies in order and awaits all `onDeploy` hooks concurrently. A subclass may need pre-deploy staging before `super.deploy` (PowerSync writes remote config first) or normal dependency-first behavior by calling `super` first.

### logs and exit

Base logs is a no-op. `DockerService.logs` follows containers selected with `saws.service` and `saws.stage` labels. `exit()` recursively aborts dev hooks; subclasses must stop their owned processes and temporary containers.

## Environment and connectivity

`ServiceDefinitionConfig.environment` is keyed by stage, then variable name. Values are strings or `SecretReference`s. `getStageEnvironmentVariables(stage)` resolves references for that stage.

The base service exports no environment variables. Provider services override `getEnvironmentVariables(stage, target)`. `target` is:

- `container`: address data for another container on the same stage-specific Docker network.
- `host`: address data for a process on the developer/deployment host.

`DockerService.getContainerEnvironment()` merges direct dependency exports for the container target followed by stage environment. Concrete services then append owned values. Hono development uses dependency exports for the host target, stage environment, and its own `PORT`.

Environment names follow `<NORMALIZED_SERVICE_NAME>_<CONTRACT_NAME>`, where normalization replaces every non-alphanumeric character with `_` and uppercases the result.

## Outputs and clients

`setOutputs(outputs, stage)` merges service outputs and writes `.saws/saws-<stage>-output.json`, keyed by service name. Current Postgres, Redis, and RustFS services write connection outputs after a container starts.

Application clients use a "construct by service name" pattern:

- `PostgresClient(name)` reads `<NAME>_DATABASE_URL`.
- `RedisClient(name)` reads `<NAME>_REDIS_URL`.
- `FilesClient(name)` reads `<NAME>_FILES_ENDPOINT`, `_FILES_ACCESS_KEY_ID`, `_FILES_SECRET_ACCESS_KEY`, `_FILES_REGION`, and `_FILES_BUCKET` (with backward-compatible `_RUSTFS_*` fallbacks).

Clients resolve a supplied environment map, then `globalThis.ENV`, then `process.env` unless their implementation documents another precedence. Keep service and client normalization identical.

## Secrets

`SecretsManager` stores stage files at `<project>/.saws/secrets/<stage>.env` and machine-global secrets at `${SAWS_HOME:-~/.saws}/secrets/global.env`. Despite the extension, current files are encrypted JSON using scrypt and AES-256-GCM. Stage-secret passcodes come from constructor config, `SAWS_SECRETS_PASSCODE`, or the project-root `.env`. Global-secret passcodes come from `SAWS_SECRETS_PASSCODE` or `${SAWS_HOME:-~/.saws}/.env`. One is generated in the applicable `.env` file when first writing if absent.

Use `manager.reference(name)` for stage-aware lazy resolution and `manager.global.reference(name)` for global values. A host SSH private key must be a global reference. Generated Postgres, Redis, and RustFS credentials are persisted per stage.

Do not embed resolved secrets in config at module-load time or print commands containing them. Docker environment is serialized into temporary/runtime env files to reduce command-line exposure.

## Docker execution and hosts

Every Docker stage uses a network named `<network>-<stage>`; the default base name is `saws`. Containers are named `<stage>-<service-name>` after underscore-to-hyphen conversion and lowercasing.

`DockerService.dev()` builds a Dockerfile image when applicable, starts an attached local container, captures logs, then calls `onContainerStarted("local")`.

`DockerService.deploy(stage)`:

1. Deploys dependencies and hooks.
2. Builds and pushes a Dockerfile image when applicable.
3. Builds run config and hashes all effective container configuration.
4. Runs a detached local container if no host exists, or verifies/prepares the remote host and runs it there.
5. Reuses an unchanged running remote container based on config and image hashes.
6. Calls `onContainerStarted(stage)`.

The current `DockerServiceConfig` type requires `host: Host`, although implementation contains null-host branches. Follow the public type unless deliberately changing that contract.

Remote Dockerfile builds require `registry`; optional `auth` supports a string or lazy secret password. The target host controls build platform. Runtime files are staged under `.saws/hosts/<host>/<stage>` and copied beneath `<appDirectory>/<stage>` (default `/opt/saws/<stage>`).

`Host` uses SSH/SCP, validates exposure and ports, and can bootstrap/assert a deployment account. `exposure: "tunnel"` forbids public TCP ports; `"public"` defaults to ports 80 and 443. Do not confuse host firewall policy with Docker port mappings.

## Current cautions

- Treat unused/private code as inactive. For example, Hono contains Traefik and blue/green helpers, but its current `deploy()` delegates directly to `DockerService.deploy()` and does not call them.
- Base comments noting recursion needs are stale for `exit()` (it is recursive) but `getEnvironmentVariables()` intentionally remains empty. Verify behavior, not comments alone.
- Current default Hono Docker run publishes its port directly. Do not document domain routing as active until the deploy path uses it.
- `getAllDependencies()` can duplicate shared descendants and has no cycle guard.
- `deved` and `deployed` flags live on service instances and are not reset within the same process.
