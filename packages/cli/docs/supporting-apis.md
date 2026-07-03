# Supporting APIs

[Home](./README.md) · [Getting started](./getting-started.md) · [CLI](./cli.md) ·
[Lifecycle](./service-lifecycle.md) · [Docker](./docker-service.md) ·
[Postgres](./postgres-docker-service.md) · [Limitations](./limitations.md)

`Host`, `DockerProvider`, and `SecretsManager` support the concrete application
services.

## `Host`

Describes the SSH deployment target and its required exposure policy:

```ts
const host = new Host({
  name: "main",
  address: "203.0.113.10",
  user: "deploy",             // Defaults to "root".
  sshKeyPath: "/path/to/id_ed25519",
  exposure: "public",         // Defaults to "tunnel".
  allowedTcpPorts: [80, 443], // Defaults to 80/443 in public mode.
  dryRun: false,
});
```

Deployment performs a read-only readiness check. If the host has not been
configured for the current policy, it exits before deployment and prints the
required command:

```bash
npx saws host configure main
```

Host configuration is an explicit operation. On Debian or Ubuntu it installs
Docker if missing and applies automatic security updates, fail2ban, key-only
SSH, kernel network hardening, and a default-deny firewall. It also filters
Docker-published ports because Docker can bypass ordinary UFW input rules.

Tunnel mode permits only SSH inbound and is intended for hosts reached through
a Cloudflare Tunnel. Public mode additionally permits `allowedTcpPorts`.
Readiness refuses to disable password login unless the deployment user has a
non-empty `authorized_keys` file. Configuration owns the host's UFW policy and
replaces existing UFW rules; use `allowedTcpPorts` for every required public
TCP port.

## `DockerProvider`

Shares Docker deployment configuration between services:

```ts
const docker = new DockerProvider({
  host,
  appDirectory: "/opt/saws/my-app", // Stage directory base; defaults to "/opt/saws".
  network: "my-app",                // Stage network base; defaults to "saws".
  registry: "registry.example.com/team",
  auth: {
    username: "registry-user",
    password: SecretsManager.reference("docker-registry-password"),
  },
});
```

For stage `production`, this provider uses Docker network
`my-app-production` and remote directory `/opt/saws/my-app/production`.
Generated local deployment files are similarly separated by host and stage.
Stage names are restricted to lower-case Docker/path-safe segments.

`registry` is optional for services that use existing images and required for
Dockerfile services during deployment. When `registry` is set, `auth` is
required and its password must be a `SecretsManager.reference(...)`. SAWS logs
in both the local Docker client and the deployment host using
`--password-stdin`.

## `SecretsManager`

Reads and writes stage-aware local secrets:

```ts
const secrets = new SecretsManager({
  stage: "production",
  rootDir: process.cwd(),
});

await secrets.set("api-key", "value");
const value = await secrets.get("api-key");
const reference = SecretsManager.reference("api-key");
```

Secrets are encrypted with AES-256-GCM and stored in
`.saws/secrets/<stage>.env`. The key is derived from
`SAWS_SECRETS_PASSCODE`, which SAWS generates in the project-root `.env` on
first use when necessary. New files are created with
mode `0600`. Applications must exclude `.saws` from version control.
References are lazy: they can be declared in `saws.ts` and resolve using the
stage and root directory of the deployment that consumes them.

[← PostgresDockerService](./postgres-docker-service.md) ·
[Next: Current limitations →](./limitations.md)
