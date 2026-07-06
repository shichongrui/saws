# Current limitations

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md) ·
[Postgres](./postgres-docker-service.md) · [Supporting APIs](./supporting-apis.md)

Compared with the original SAWS services, this prototype does not yet provide:

- host provisioning or Docker installation;
- source watching and automatic Dockerfile rebuilds;
- automatic health-check inference for general-purpose Docker images (custom
  checks are supported, and known services provide defaults);
- general-purpose zero-downtime replacement or automatic rollback;
- domain-based HTTP routing, DNS, or TLS management (the Hono service includes
  a single-service Nginx reverse proxy);
- automatic host-port selection;
- remote secret persistence or rotation;
- Prisma generation, PostgreSQL backups, or restore workflows; or
- pruning containers removed from the configuration.

Docker networks, generated runtime files, proxy state, container names,
generated images, and default PostgreSQL volumes are isolated by stage.
Published host ports cannot be isolated: two stages on one host conflict when
they publish the same host port. Explicit named volumes, bind mounts, and
external resources are also operator-managed and may be shared.

See [the broader prototype parity assessment](../GAP.md) for more detail.

[← Supporting APIs](./supporting-apis.md) · [Back to wiki home](./README.md)
