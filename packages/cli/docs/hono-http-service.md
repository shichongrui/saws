# `HonoHTTPService`

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md)

Scaffolds a TypeScript Hono application, runs it directly with `tsx watch`
during development, and deploys it through `DockerService`.

The service also exposes a name-parameterized URL to dependent applications.
For a service named `api`, the injected variable is `API_URL`.

## Usage

```ts
import { DockerProvider } from "@saws/docker";
import { HonoHTTPService } from "@saws/hono";
import { Host } from "@saws/host";
import { SecretsManager } from "@saws/secrets";

const docker = new DockerProvider({
  host: new Host({ name: "app", address: "app.example.com" }),
  registry: "registry.example.com/team",
  auth: {
    username: "registry-user",
    password: SecretsManager.reference("docker-registry-password"),
  },
});

export default new HonoHTTPService({
  name: "api",
  docker,
  port: 3000,
});
```

## Initialization

`saws init api` creates this application without replacing existing files:

```text
api/
├── .dockerignore
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

The package manifest includes Hono and its Node adapter plus TypeScript,
`tsx`, and Node types. Missing scripts and dependencies are merged into an
existing manifest, then `npm install` prepares the application and lockfile.

## Development

`saws dev` runs:

```sh
npm exec -- tsx watch src/index.ts
```

The process runs from the application directory. It receives the current
environment, host-target environment variables from dependencies, configured
service environment variables, and `PORT`. No Docker image is built or
container started during development.

## Application client

Install `@saws/hono` in a web or React Native application that depends
on this service:

```ts
import { HonoClient } from "@saws/hono";
import type { AppType } from "../api/src/index.js";

const client = new HonoClient<AppType>("api");
const response = await client.health.$get();
```

`HonoClient` wraps Hono's type-safe RPC client. It reads `API_URL` from
`globalThis.ENV` in browser or React Native runtimes and falls back to
`process.env`. The application service must expose its injected SAWS
environment as `globalThis.ENV` before constructing the client.

## Deployment

Deployment builds and pushes the stage-specific application image, then runs
the application behind a stable Nginx container. Releases alternate between
blue and green application containers:

1. Start the inactive container without publishing a host port.
2. Poll its readiness endpoint.
3. Gracefully reload Nginx with the new upstream.
4. Allow existing requests to drain, then remove the previous container.

If readiness or Nginx configuration validation fails, the proxy stays on the
previous release and the candidate container is removed. The service port
defaults to `3000`; Nginx owns the configured host port mapping.

The proxy configuration and blue/green state are stored below the provider's
stage-specific application directory. SAWS hashes the proxy image, network,
published ports, mount path, and health settings. If those settings change, it
recreates the proxy after the candidate application is ready; ordinary
application releases continue to use a graceful Nginx reload.

The application and proxy containers also receive native Docker health checks.
The application check requests `healthCheckPath` with Node's built-in `fetch`;
the proxy check requests the same path through Nginx. The inherited
`healthCheck` option can override or disable the application container check.
Rollout readiness polling remains active because it gates the traffic switch
rather than only reporting long-term container health.

## Options

In addition to `DockerService` options other than its image source:

- `directory?: string` sets the application directory relative to the runtime
  root. It defaults to the service name.
- `port?: number` sets `PORT`, the Docker `EXPOSE` value, and the default
  host/container port mapping. It defaults to `3000`.
- `healthCheckPath?: string` sets the readiness endpoint polled before a
  traffic switch. It defaults to `/`.
- `healthCheckTimeoutSeconds?: number` sets the readiness deadline. It
  defaults to `30`.
- `drainTimeoutSeconds?: number` controls how long old Nginx workers and the
  previous application container may drain. It defaults to `30`.
- `proxyImage?: string` selects the reverse-proxy image. It defaults to
  `nginx:1.27-alpine`.
- `publicUrl?: string` overrides the URL injected for deployed host
  applications. Without it, the URL is derived from the Docker host and first
  published proxy port.

Use the inherited `ports` option to customize the published Docker mapping.
