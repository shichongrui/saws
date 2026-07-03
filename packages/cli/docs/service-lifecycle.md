# Service lifecycle

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Docker](./docker-service.md) · [Postgres](./postgres-docker-service.md) ·
[Supporting APIs](./supporting-apis.md) · [Limitations](./limitations.md)

## Common options

Both concrete services accept:

### `name: string`

Required. The service's CLI identifier and part of its generated container
name. It must be unique within the configuration.

### `dependencies?: ServiceDefinition[]`

Services that must be initialized, started, or deployed first. A
`DockerService` also injects the environment variables exposed by its direct
dependencies into its container.

## Operations

Every service participates in four lifecycle operations:

- `init` initializes dependencies, then the selected service;
- `dev` runs `init`, starts dependencies, then starts the selected service;
- `deploy` deploys dependencies, then the selected service; and
- `exit` stops the selected service, then its dependencies.

`DockerService` and `PostgresDockerService` require no application
scaffolding. `HonoHTTPService` uses its `init` hook to create an isolated Hono
application and install its dependencies.

## Custom initialization

Custom services can implement idempotent project initialization by overriding
`onInit`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  InitContext,
  ServiceDefinition,
  type ServiceDefinitionConfig,
} from "@saws/core";

export class ExampleService extends ServiceDefinition {
  constructor(config: ServiceDefinitionConfig) {
    super(config);
  }

  protected override async onInit(context: InitContext) {
    const directory = path.join(context.rootDir, this.name);

    if (context.dryRun) {
      context.writeLog(`Would initialize ${directory}\n`);
      return;
    }

    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "example.config.json"),
      "{}\n",
      { flag: "wx" }
    ).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }
}
```

Initializers should:

- resolve files from `context.rootDir`;
- preserve files the application owner may have edited;
- support repeat execution in later processes; and
- honor `context.dryRun` for external or destructive operations.

[← CLI reference](./cli.md) · [Next: DockerService →](./docker-service.md)
