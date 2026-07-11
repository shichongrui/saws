# Author or modify a SAWS service

## Contents

- Package checklist
- Config and constructor
- Lifecycle patterns
- Connectivity contract
- Docker subclass pattern
- Client pattern
- Review checklist

## Package checklist

For a new service package:

1. Create `packages/<kind>-service/package.json`, `tsconfig.json`, `src/index.ts`, and the implementation.
2. Use `"type": "module"`, root export maps, generated declarations, and `files: ["./dist"]` consistent with sibling packages.
3. Add internal package dependencies with the repository's aligned version.
4. Ensure root `package.json` workspace patterns include it. The existing `packages/*` pattern normally does without an edit; verify rather than making a no-op change.
5. Add a root `tsconfig.json` project reference.
6. Export public implementation/types from `src/index.ts` using `.js` relative specifiers.
7. Do not add tests under this repository's rules.

For a paired client, create `packages/<kind>-client` separately so applications need not depend on deployment implementation or Docker packages.

## Config and constructor

Define an exported config interface that extends or omits from the parent config. Omit inherited fields whose values the service must own (image, command, ports, volumes, or health check), while leaving compatible caller customization available.

Constructor rules:

- Spread `...config` before service-owned overrides so reserved behavior wins intentionally.
- Preserve `config.dependencies` and append semantic dependencies.
- Validate ambiguous or unsafe combinations early.
- Store effective values on `readonly` fields.
- Use comments for non-obvious defaults and exposure/security behavior.
- Set a stable `serviceType` label.

Avoid config fields that are stored but not used. If retaining a forward-looking field, clearly state that its behavior is not active.

## Lifecycle patterns

### Idempotent initialization

Create directories freely. Create user-editable files only when absent. Update JSON metadata structurally and avoid duplicate entries. Install dependencies through the shared dependency-management utility so npm/pnpm/yarn/bun detection and log routing remain consistent.

### Development

For normal containers:

```ts
override async dev() {
  await super.dev();
  // Optional work that requires the running container.
}
```

For a host-native dev server backed by Docker deployment, invoke `ServiceDefinition.prototype.dev.call(this)` to retain graph and hook behavior without starting the Docker container. Then inject host-target dependency variables, stage variables, and service-owned variables. Capture stdout/stderr and implement exit cleanup.

### Deployment

Usually call `await super.deploy(stage)` first. Stage remote files before it only if the container cannot start without them. Any persistent post-start provisioning belongs in `onContainerStarted` when it must happen for both dev and deploy.

### Administrative work

Use a static `getCommands` plus command factory. When a command can target multiple instances, require an unambiguous service selection. Use `findServiceDefinition` semantics rather than inventing a second graph search.

## Connectivity contract

Design the contract before writing methods:

1. Define a typed connection-info object containing all raw components and canonical URL(s).
2. Implement `getConnectionInfo(stage, target = "host")`.
3. Make `getEnvironmentVariables(stage, target = "container")` transform that object into normalized variables.
4. Make container environment and outputs consume the same object.
5. Build the client against those exact names.

Use encoded URL credentials. Decide host and port independently for each target:

```ts
const host = target === "container" ? this.getContainerName(stage) : this.getHost(stage);
const port = target === "container" ? INTERNAL_PORT : this.getHostPort(stage);
```

Default consumer environment variables should represent the provider, not the dependent. A service called `primary-db` therefore exports `PRIMARY_DB_DATABASE_URL`.

Only direct dependencies inject environment. If a grandchild must be visible to a top-level consumer, make it a direct dependency or deliberately re-export its contract.

## Docker subclass pattern

Start from:

```ts
export class ExampleService extends DockerService {
  protected override readonly serviceType = "example";

  constructor(config: ExampleServiceConfig) {
    super({
      ...config,
      image: config.image ?? "vendor/example:version",
      healthCheck: config.healthCheck ?? {
        command: "example-health-command",
        interval: "10s",
        timeout: "5s",
        retries: 5,
      },
    });
  }

  protected override async getContainerEnvironment(stage: string) {
    return {
      ...(await super.getContainerEnvironment(stage)),
      EXAMPLE_SETTING: "value",
    };
  }

  protected override async getDockerRunConfig(stage: string, deploy: boolean) {
    const config = await super.getDockerRunConfig(stage, deploy);
    return {
      ...config,
      volumes: [this.serviceVolume(stage), ...(config.volumes ?? [])],
      ports: deploy && this.port == null ? [] : [`${this.hostPort()}:1234`],
    } satisfies DockerRunConfig;
  }
}
```

When the service owns volumes/ports and its config type omits caller values, replacing parent arrays may be correct. When caller values remain supported, append/prepend them explicitly.

Use named volumes for state. Make volume names stage-specific. Prefer private remote database/cache ports. Be cautious with host address behavior: remote host-process access, remote containers, and outside clients are three distinct perspectives.

## Client pattern

A client should:

- Accept the service name first.
- Normalize it exactly like the service.
- Accept an explicit environment source for adapters/tests outside Node.
- Read `globalThis.ENV` for browser/framework injection where appropriate and `process.env` for Node.
- Accept explicit endpoint/credential overrides for external services.
- Throw a precise error naming the missing variable.
- Export resolver/variable-name helpers when useful.
- Avoid importing the service package.

Keep overrides clear. If spreading library options after derived configuration, document that callers can replace it; otherwise spread caller options first and write derived required fields last.

## Review checklist

- Is the service name unique and used consistently for directory, container, labels, variables, secret names, volumes, outputs, and logs?
- Does every override call the correct parent implementation exactly once?
- Are dependency start order and environment injection both intended?
- Are shared dependencies the same object instance?
- Are container and host endpoints correct for local and deployed stages?
- Are remote ports private by default where appropriate?
- Are generated credentials persistent, stage-scoped, and never logged?
- Are initialization writes idempotent and non-destructive?
- Are remote files cleaned in `finally` blocks?
- Do ephemeral jobs disable health/restart behavior and clean themselves?
- Do the service and client agree on variable normalization and names?
- Are package exports, dependencies, root references, and formatting correct?
- Did documentation avoid claiming currently unused behavior is active?
