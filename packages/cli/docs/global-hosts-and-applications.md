# Global hosts and packaged applications

This guide covers the complete remote-deployment workflow:

1. Save a machine as a reusable global host.
2. Bootstrap that machine for SAWS deployments.
3. Reference the host from an application input file.
4. Install and deploy a packaged application.

## Prerequisites

You need the SAWS CLI, a Debian or Ubuntu server, and an existing SSH account that can run commands
as `root` or with interactive `sudo`.

```sh
npm install --save-dev @saws/cli
```

By default, global hosts and installed applications live under `~/.saws`. Set `SAWS_HOME` before
running any host or application command if that state should live elsewhere:

```sh
export SAWS_HOME=/srv/saws-state
```

Use the same `SAWS_HOME` for every command that should share hosts, keys, applications, and local
deployment state.

> `saws host configure` applies an opinionated security baseline. It installs and enables Docker,
> fail2ban, UFW, and unattended upgrades; resets the UFW rules; installs Docker firewall rules;
> configures a deployment account; and disables SSH password authentication after verifying key
> access. Use a new server when possible and run the command with `--dry-run` first.

## 1. Create a global host

A global host is a named machine profile that can be reused by any project or packaged application.
Create a public host with:

```sh
npx saws host create edge \
  --address 203.0.113.10 \
  --user saws \
  --platform linux/amd64 \
  --exposure public
```

The important values are:

- `edge`: the name passed to `getGlobalHost("edge")` later.
- `--address`: a DNS name or IP address reachable over SSH.
- `--user`: the persistent, unprivileged account SAWS will create and use for deployments. This is
  not necessarily the account that already exists on the server.
- `--platform`: the Docker target platform. It is optional, but useful when the development machine
  and server use different CPU architectures. Examples include `linux/amd64` and `linux/arm64`.
- `--exposure`: `public` or `tunnel`. Public hosts allow selected inbound application ports;
  tunnel hosts allow none.

A public host allows TCP ports 80 and 443 by default. Specify the complete public-port set when an
application needs different ports:

```sh
npx saws host create observability \
  --address metrics.example.com \
  --user saws \
  --exposure public \
  --allowed-tcp-port 8080 4317 4318
```

When `--allowed-tcp-port` is supplied, it replaces the default list; include 80 and 443 explicitly
if the machine also needs them. The SSH port is allowed separately. To use a nonstandard SSH port,
add `--ssh-port 2222`.

For a private machine reached only through an SSH or network tunnel:

```sh
npx saws host create internal \
  --address 10.0.0.20 \
  --user saws \
  --exposure tunnel
```

Do not supply public ports for a tunnel host.

### Where the profile is stored

The profile is plain JSON at:

```text
~/.saws/hosts/<name>/host.json
```

It contains the address, users, ports, exposure policy, and platform, but no private key. If you edit
the profile directly, rerun the configure step so the host firewall and readiness record match it.
Creating a host whose name already exists fails instead of overwriting the profile.

## 2. Configure the machine

Preview the bootstrap operation first:

```sh
npx saws host configure edge --global --user ubuntu --dry-run
```

Then apply it:

```sh
npx saws host configure edge --global --user ubuntu
```

Here, `ubuntu` is an existing bootstrap account with root or sudo access. It is used only to prepare
the server. Subsequent deployments connect as the persistent deployment user (`saws` in this
example) configured by the earlier host-creation command.

SAWS generates an Ed25519 deployment key when the global host does not have one, encrypts the
private key in the global secret store, installs the public key for the deployment account, and only
then disables password-based SSH access.

To use an existing unencrypted, non-passphrase-protected private key, import it before configuring
the machine:

```sh
npx saws host key import edge --file ~/.ssh/edge_deploy
npx saws host configure edge --global --user ubuntu
```

The source file is not modified. Import refuses to replace an existing key unless `--force` is
passed.

Global host keys are encrypted beneath `~/.saws/secrets`. The encryption passcode and generated
public-key metadata are stored in `~/.saws/.env`, with file permissions restricted to the current
user. Back up both locations securely. Losing the passcode makes the encrypted deployment key
unusable.

## 3. Install an application instance

Install the package and give this local instance a name:

```sh
npx saws app install @saws/reverse-proxy-application --name edge-proxy
```

The package argument accepts an npm version or tag. Pin a version for the initial installation if
needed:

```sh
npx saws app install @saws/reverse-proxy-application@2.0.0-beta.17 --name edge-proxy
```

SAWS refuses to install over an existing application name. It creates this local application
directory:

```text
~/.saws/apps/edge-proxy/
├── config.ts
├── package.json
├── package-lock.json
├── saws.ts
└── node_modules/
```

This directory also becomes the home for that instance's secrets, outputs, and other local SAWS
state. The install command does not deploy anything.

List installed application instances, package versions, and configuration state at any time:

```sh
npx saws app list
```

## 4. Configure the generated file

A packaged application exports the shape of the input it expects. Consult that package's README for
its application-specific fields. Applications that deploy to a remote machine accept or derive a
`Host`; reference the global profile with `getGlobalHost`.

Open the generated configuration in your editor:

```sh
${EDITOR:-vi} "${SAWS_HOME:-$HOME/.saws}/apps/edge-proxy/config.ts"
```

The generated file derives its type from the installed application's `create` factory. TypeScript
therefore reports missing or incompatible fields. For example, `config.ts` can route public
hostnames to ports on the target machine:

```ts
import { getGlobalHost } from "@saws/core";
import type { ReverseProxyApplicationConfig } from "@saws/reverse-proxy-application";

export default {
  host: getGlobalHost("edge"),
  acmeEmail: "ops@example.com",
  routes: [
    { hostname: "api.example.com", port: 3000 },
    { hostname: "app.example.com", port: 8080, healthUri: "/health" },
  ],
} satisfies ReverseProxyApplicationConfig;
```

For applications with secrets, export a `SecretsManager` named `secrets` and pass lazy references
instead of secret values:

```ts
import { getGlobalHost, SecretsManager } from "@saws/core";
import type { OpenDesignApplicationConfig } from "@saws/open-design-application";

export const secrets = new SecretsManager();

export default {
  host: getGlobalHost("edge"),
  registry: "registry.example.com/saws",
  setupPassword: secrets.reference("open-design-application-password"),
} satisfies OpenDesignApplicationConfig;
```

`secrets.reference(...)` is stage-scoped: production and staging can use different values without
changing the configuration file. Use `secrets.global.reference(...)` only for a value intentionally
shared across stages.

### Update an installed application

Update an instance when the version on its npm release channel is newer than its installed semantic
version:

```sh
npx saws app update edge-proxy
```

Update never overwrites `config.ts`. Stable applications follow npm's `latest` dist-tag, while
applications already on a beta version follow the `beta` dist-tag. If the instance was installed by
an older SAWS CLI, its first update renames `input.ts` to `config.ts` without changing the contents.
If both files exist, update stops and asks you to resolve the ambiguity.

### Set application secrets

Run secret commands from the installed application directory so a default `SecretsManager` resolves
the correct storage location:

```sh
cd "${SAWS_HOME:-$HOME/.saws}/apps/edge-proxy"
npx --package @saws/cli saws secrets example-secret \
  --stage production \
  --set 'replace-with-the-secret-value'
```

Avoid placing real secret values in shell history when that matters for your environment. The
encrypted stage file is stored under the installed application's `.saws/secrets` directory.

## 5. Deploy the application

Deploy a named instance to any non-`local` stage:

```sh
npx saws app deploy edge-proxy --stage production
```

The deployment command:

1. Loads `~/.saws/apps/edge-proxy/saws.ts`.
2. Resolves the generated configuration and application factory.
3. Resolves stage-scoped environment and secrets.
4. Connects to the global host with its deployment key.
5. Verifies that the host still matches the configured security policy.
6. Deploys application dependencies in order and starts or replaces changed containers.

By default, stages isolate generated names, Docker networks, persistent volumes, runtime files,
secrets, and outputs. Deploying `staging` and `production` therefore creates separate application
resources even when they use the same host. Explicitly overridden volume names can opt out of that
isolation.

For a public application, confirm before deployment that:

- DNS records point to the host.
- Every published TCP port is in the global host's `allowedTcpPorts`.
- Cloud-provider or upstream-network firewalls allow the same ports.
- Any required registry credentials and application secrets exist for the target stage.
- Services addressed by a reverse proxy are reachable from the proxy container.

## Operations and troubleshooting

To run standard SAWS commands against an installed application, change into its directory:

```sh
cd "${SAWS_HOME:-$HOME/.saws}/apps/edge-proxy"
npx --package @saws/cli saws logs --stage production
npx --package @saws/cli saws logs reverse-proxy --stage production
```

Common failures:

- **Host is not configured or has drifted:** rerun the global `host configure` command with the host
  name and bootstrap user. This reapplies the declared firewall and security policy.
- **SSH fails after configuration:** verify that the global key store and `~/.saws/.env` came from
  the same SAWS home and that the configured address and SSH port are correct.
- **A published service is unreachable:** Docker port publishing and the host allowlist are separate.
  The service must publish the port, and the host profile must allow it.
- **An HTTPS certificate is not issued:** verify public DNS and inbound ports 80 and 443. A hostname
  route in the reverse-proxy application requests and renews its certificate automatically.
- **A remote Dockerfile application asks for a registry:** remote hosts cannot use an image that was
  built only on the development machine. Configure the application's `registry` and any required
  registry authentication, or supply a prebuilt image.
- **A secret cannot be decrypted:** use the same `SAWS_HOME` and `SAWS_SECRETS_PASSCODE` that created
  the encrypted file.

Treat `~/.saws` (or the configured `SAWS_HOME`) as operational state. Back it up securely, especially
the global `.env`, encrypted secret stores, application input files, and any output needed by your
deployment workflow. Remote Docker volumes must be backed up separately on the target machines.
