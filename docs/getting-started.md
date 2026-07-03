# Getting started

[Home](./README.md) · [CLI](./cli.md) · [Lifecycle](./service-lifecycle.md) ·
[Docker](./docker-service.md) · [Postgres](./postgres-docker-service.md) ·
[Supporting APIs](./supporting-apis.md) · [Limitations](./limitations.md)

## Installation

Build the monorepo and install the CLI and required service packages:

```bash
cd /Users/matt/code/saws
npm install
npm run build

cd /path/to/application
npm install @saws/cli @saws/docker @saws/host @saws/postgres @saws/secrets
```

The installed package exposes the `saws` executable:

```bash
npx saws --help
```

## Prerequisites

Local development requires:

- Node.js and npm;
- a running Docker daemon; and
- access to pull every configured image.

Deployment additionally requires:

- SSH and SCP access to the configured host;
- Docker installed and running on that host;
- access to pull every configured public image on that host.

The prototype does not provision the host or install Docker. When a private
registry is configured, SAWS authenticates the local and remote Docker clients
using the configured stage-aware secret.

## Configuration

By default, the CLI loads `./saws.ts` and falls back to `./saws.js`. The file
must default-export a `ServiceDefinition`.

```ts
import { DockerProvider, DockerService } from "@saws/docker";
import { Host } from "@saws/host";
import { PostgresDockerService } from "@saws/postgres";
import { SecretsManager } from "@saws/secrets";

const host = new Host({
  name: "main",
  address: "203.0.113.10",
  user: "deploy",
  exposure: "public",
  allowedTcpPorts: [80, 443],
});

const docker = new DockerProvider({
  host,
  appDirectory: "/opt/saws/my-app", // Produces /opt/saws/my-app/<stage>.
  network: "my-app",                // Produces my-app-<stage>.
  registry: "registry.example.com/my-team",
  auth: {
    username: "registry-user",
    password: SecretsManager.reference("docker-registry-password"),
  },
});

const database = new PostgresDockerService({
  name: "db",
  docker,
  image: "postgres:16",
});

export default new DockerService({
  name: "my-app",
  docker,
  image: "ghcr.io/example/my-app:latest",
  environment: {
    NODE_ENV: "production",
  },
  ports: ["80:3000"],
  dependencies: [database],
});
```

Dependencies are initialized, started, and deployed before the service that
depends on them. Reusing one service instance in multiple dependency branches
is supported. Configured service names must be unique.

[← Home](./README.md) · [Next: CLI reference →](./cli.md)
