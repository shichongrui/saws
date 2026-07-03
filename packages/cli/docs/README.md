# SAWS Prototype Wiki

[Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md) ·
[Hono](./hono-http-service.md) ·
[Postgres](./postgres-docker-service.md) · [Supporting APIs](./supporting-apis.md) ·
[Limitations](./limitations.md)

This wiki documents the concrete-service SAWS prototype.

## Start here

1. [Install the package and configure a project](./getting-started.md).
2. Learn the shared [service lifecycle and dependency behavior](./service-lifecycle.md).
3. Configure a [`DockerService`](./docker-service.md),
   [`HonoHTTPService`](./hono-http-service.md), or
   [`PostgresDockerService`](./postgres-docker-service.md).
4. Use the [`saws` CLI](./cli.md) for initialization, development, deployment,
   and secrets.

## Services

| Service | Purpose |
| --- | --- |
| [`DockerService`](./docker-service.md) | Run an existing image or locally built Dockerfile. |
| [`HonoHTTPService`](./hono-http-service.md) | Scaffold and blue/green deploy a TypeScript Hono server behind Nginx. |
| [`PostgresDockerService`](./postgres-docker-service.md) | Run PostgreSQL with persistent storage and connection variables. |

`Host`, `DockerProvider`, and `SecretsManager` are
[supporting APIs](./supporting-apis.md), not services.

## Additional references

- [Prototype parity gaps](../GAP.md)
- [Package README](../README.md)

[Next: Getting started →](./getting-started.md)
