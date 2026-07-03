# `DockerService`

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Postgres](./postgres-docker-service.md) ·
[Supporting APIs](./supporting-apis.md) · [Limitations](./limitations.md)

Runs a general-purpose Docker image locally during development and as a
detached container on a remote Docker host during deployment.

## Usage

Use an existing image:

```ts
import { DockerService } from "@saws/docker";

const web = new DockerService({
  name: "web",
  docker,
  image: "nginx:alpine",
  environment: { APP_ENV: "production" },
  ports: ["8080:80"],
  volumes: ["web-data:/usr/share/nginx/html"],
  command: ["nginx", "-g", "daemon off;"],
  restart: "unless-stopped",
  healthCheck: {
    command: "wget -q -O /dev/null http://127.0.0.1/",
    interval: "10s",
    timeout: "5s",
    retries: 3,
    startPeriod: "10s",
  },
});
```

Or build an image from a Dockerfile:

```ts
const web = new DockerService({
  name: "web",
  docker,
  dockerfile: "services/web/Dockerfile",
  buildContext: "services/web",
  ports: ["8080:80"],
});
```

Exactly one of `image` and `dockerfile` is required.

## Development

`saws dev`:

1. Creates the stage-specific local Docker network if it does not exist.
2. Pulls an existing image, or builds the configured Dockerfile locally.
3. Removes any existing container with the stage-aware container name.
4. Writes the effective environment to a temporary
   `.saws/local/<stage>/<service>/container.env` file.
5. Starts the container attached to the SAWS log sink.
6. Removes the temporary environment file and stops the process when SAWS
   exits.

The prototype does not watch source files or rebuild a changed Dockerfile
automatically.

## Deployment

`saws deploy`:

1. For a Dockerfile service, builds the image locally, assigns a stage-aware
   image name, and pushes it to the `DockerProvider` registry.
2. Ensures the stage-specific remote application directory and Docker network
   exist.
3. Pulls the desired image on the host.
4. Transfers the effective environment as a temporary env file.
5. Creates, starts, or replaces the remote container as required.
6. Removes the transferred environment file after Docker creates the
   container.

Deployments converge on a hash of the effective container configuration and
the pulled image ID. An unchanged running container is left alone, an unchanged
stopped container is started, and a changed container is removed and recreated.
Replacement is not zero-downtime.

This describes direct `DockerService` deployment. `HonoHTTPService` uses the
same image lifecycle but overrides container replacement with a health-gated
blue/green rollout behind Nginx.

Dockerfile deployments require `DockerProvider.registry`. The machine running
SAWS must be able to reach that registry, and the remote host must be able to
reach it. The provider authenticates both Docker clients from its required
secret-backed `auth` configuration before pushing or pulling.

## Stage isolation

`DockerProvider.network` and `DockerProvider.appDirectory` are base values.
SAWS derives a separate network and directory for every stage. For example,
`network: "my-app"` and `appDirectory: "/opt/saws/my-app"` produce:

```text
my-app-staging
/opt/saws/my-app/staging
```

Generated deployment files are staged locally under
`.saws/hosts/<host>/<stage>/` and remotely under the stage application
directory. Containers, generated image names, and the default PostgreSQL
volume are also stage-aware.

Stages must start with a lower-case letter or number and contain only
lower-case letters, numbers, `.`, `_`, or `-`.

Published host ports cannot be namespaced. Two stages deployed to the same host
will conflict if they publish the same host port. Explicit Docker volume names,
bind mounts, and other external resources are used exactly as configured and
must be made stage-specific by the application when isolation is required.

## Constructor options

The service also accepts the [common service options](./service-lifecycle.md#common-options).

### `docker: DockerProvider`

Required. Selects the remote host, application directory, Docker network, and
optional image registry.

### `image?: string`

An existing image reference to pull in development and deployment. Exactly one
of `image` and `dockerfile` must be set.

### `dockerfile?: string`

A Dockerfile to build. Relative paths are resolved from the runtime root
directory. Exactly one of `dockerfile` and `image` must be set.

### `buildContext?: string`

The Docker build context, resolved from the runtime root directory. It defaults
to the Dockerfile's directory.

### `environment?: Record<string, string>`

Environment variables passed to the container. These values override variables
with the same name supplied by dependencies. Variable names must use shell
environment syntax and values cannot contain newlines.

The effective environment is passed with `--env-file`, so secret values are not
included in the printed `docker run` command.

### `volumes?: string[]`

Docker volume or bind-mount specifications passed as `-v` values. SAWS does
not rewrite explicit mount sources, so a named volume is shared across stages
unless its configured name is stage-specific.

### `ports?: string[]`

Docker port publishing specifications passed as `-p` values, such as
`"8080:80"` or `"127.0.0.1:8080:80"`. Ports are not selected automatically.

### `command?: string[]`

Arguments appended after the image in `docker run`.

### `labels?: Record<string, string>`

Additional Docker labels. SAWS also adds labels for the service name, service
type, stage, and deployed configuration hash.

### `restart?: "always" | "unless-stopped" | "no"`

The remote container restart policy. Deployment defaults to
`"unless-stopped"`. Development runs an attached container controlled by the
SAWS process.

### `healthCheck?: DockerHealthCheckConfig | false`

Configures Docker's native container health check. The command runs inside the
container using `CMD-SHELL`. Optional `interval`, `timeout`, and `startPeriod`
values use Docker duration syntax such as `"10s"` or `"1m30s"`; `retries` must
be a positive integer.

When omitted, an image-defined health check is preserved. Set `false` to pass
`--no-healthcheck` and disable an image-defined check. Changes to this
configuration are included in deployment convergence, so they recreate the
container.

## Dependency behavior

`DockerService` does not expose environment variables or permissions to a
dependent service by default. Subclasses can override that behavior, as
`PostgresDockerService` does.

The service consumes environment variables from its own direct dependencies.
Dependency values are injected first, and the service's explicit `environment`
values take precedence.

## Outputs and libraries

`DockerService` does not publish outputs and has no client library.

[← Service lifecycle](./service-lifecycle.md) ·
[Next: PostgresDockerService →](./postgres-docker-service.md)
