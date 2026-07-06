# CLI reference

[Home](./README.md) · [Getting started](./getting-started.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md) ·
[Postgres](./postgres-docker-service.md) · [Supporting APIs](./supporting-apis.md) ·
[Limitations](./limitations.md)

## Commands

```bash
npx saws dev [config] [--dry-run]
npx saws init <service> [config] [--dry-run]
npx saws migrate <name> [--dry-run]
npx saws host configure [name] [--dry-run]
npx saws deploy [config] --stage <stage> [--dry-run]
npx saws secrets <name> --stage <stage> --set <value>
npx saws secrets <name> --stage <stage> --get
```

Use `--config <path>` instead of the positional configuration path when
preferred. `--root-dir <path>` changes the root used to resolve Dockerfiles,
build contexts, and `.saws` runtime files.

## Development

`saws dev` initializes and starts the complete dependency graph with stage
`dev`.

In an interactive terminal, it displays a TUI with services on the left and
the selected service's logs on the right. Use the arrow keys to select a
service and `q` to stop development. Docker containers run attached to the log
sink and are stopped when SAWS exits.

## Initialization

Address a configured service by name:

```bash
npx saws init db
npx saws init web --config ./infra/saws.ts --root-dir .
```

SAWS initializes that service's dependencies before the service itself. A
shared dependency is initialized only once in a command.

Configured service types can contribute their own CLI commands. Commands are
loaded once per service type from the default `saws.ts`/`saws.js` file, or from
the path supplied with `--config`.

`PostgresDockerService` contributes:

```bash
npx saws migrate create_users
```

This runs `npm exec -- dbmate new create_users` from the project root and
creates a timestamped file in `<service-name>/migrations`. If multiple
Postgres services are configured, pass `--service <service-name>`.

## Deployment

Deployment requires a non-local stage:

```bash
npx saws deploy --stage production
```

Stage names must start with a lower-case letter or number and may contain only
lower-case letters, numbers, `.`, `_`, and `-`. Docker networks and generated
runtime directories are derived from the stage.

Before changing anything, deployment checks every configured Docker host for a
readiness marker matching its current exposure policy and verifies that Docker
is usable. An unready host exits with the command required to configure it.
The root exported service and all dependencies are then deployed in dependency
order.

## Host configuration

Explicitly prepare a host before its first deployment or after changing its
exposure policy:

```bash
npx saws host configure main
```

The host name is optional when the configuration contains exactly one host.
Use `--config <path>` for a non-default service definition. Configuration
supports Debian and Ubuntu and installs Docker, automatic security updates,
fail2ban, key-only SSH, network hardening, and firewall rules.

## Secrets

Set or retrieve a value in the encrypted
`.saws/secrets/<stage>.env` file:

```bash
npx saws secrets api-key --stage production --set value
npx saws secrets api-key --stage production --get
```

The stage defaults to `local`.

SAWS derives the encryption key from `SAWS_SECRETS_PASSCODE`. On the first
secret write, it generates a strong passcode in the project-root `.env` file
if the variable is not already set there or in the process environment. Keep
that `.env` file out of version control and back up the passcode separately:
encrypted secrets cannot be recovered without it.

Plaintext secret files created by earlier SAWS versions are encrypted in place
the next time they are read.

Use a secret lazily from `saws.ts` without loading its value into the
configuration file:

```ts
import { SecretsManager } from "@saws/secrets";

const password = SecretsManager.reference("docker-registry-password");
```

## Dry runs

`--dry-run` prints local Docker, SSH, and SCP commands without running them.
Some local runtime directories and temporary files may still be created while
the desired deployment is assembled.

[← Getting started](./getting-started.md) ·
[Next: Service lifecycle →](./service-lifecycle.md)
