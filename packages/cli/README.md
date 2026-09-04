<div align='center'>

# SAWS CLI

CLI for interacting with your SAWS application.

</div>

## Table of Contents

- [Installation](#installation)
- [Commands](#commands)
- [Deployment guide](./docs/global-hosts-and-applications.md)

## Installation <a id='installation'>

From the command line run:

```bash
npm install @saws/cli
```

Then run `npx saws init` to initialize your SAWS application in your current directory.

## Commands <a id='commands'>

These commands are the base commands that come with the `saws` cli. But other services in your `saws.js` can add additional commands to the `saws` cli. For example: [`secrets` command](../secrets/README.md#commands).

### `init`

```bash
npx saws init
```

This command will initialize a SAWS application in your current working directory.

It will

- Install any needed dependencies
- Create a `.gitignore`
- Create a `tsconfig.json`
- Create your `saws.js` config file

### `dev`

```bash
npx saws dev
```

This command will intitialize any new services in your `saws.js` file and stand up a local development environment for your application.

### `deploy`

```bash
npx saws deploy --stage <stage>
```

This command will deploy all the services in your `saws.js` file to AWS. You will need to have your AWS session configured in your terminal for this command to succeed.

### Packaged applications

See [Global hosts and packaged applications](./docs/global-hosts-and-applications.md) for the full
machine bootstrap, application configuration, secrets, deployment, and troubleshooting workflow.

A package can expose a reusable SAWS application by exporting a `create` factory:

```ts
import { ServiceDefinition, type Host } from "@saws/core";

export function create({ host }: { host: Host }) {
  return new ServiceDefinition({
    name: "example-application",
    dependencies: [createApplicationServices(host)],
  });
}
```

The installer creates a type-checked `config.ts` module with a default export. Named exports are
re-exported from the installed application's generated `saws.ts`. A packaged application can
therefore use the same global hosts as project configurations:

```ts
import { getGlobalHost } from "@saws/core";

export const host = getGlobalHost("observability");

export default { host };
```

Install and deploy a named instance:

```bash
npx saws app install @example/signoz --name observability
# Edit ~/.saws/apps/observability/config.ts, then deploy it.
npx saws app deploy observability --stage production
```

Installed packages, configuration, dependencies, secrets, outputs, and other SAWS
state live beneath `~/.saws/apps/<name>`. Set `SAWS_HOME` to use another base
directory, such as in CI. `app install` refuses to replace an existing instance. Use
`saws app update <name>` to install a newer version without overwriting `config.ts`.
Stable applications follow npm's `latest` tag, while beta applications follow the `beta`
tag. The first update of a legacy instance renames its `input.ts` to `config.ts`.
Run standard commands that operate on named exports from the application instance directory.

List every installed instance with its package, version, and configuration state:

```bash
npx saws app list
```

### `logs`

```bash
npx saws logs --stage <stage>
npx saws logs <service> --stage <stage>
```

This command will tail logs for deployed services in your `saws.js` file. Pass a
service name to tail only one service. The `local` stage is a no-op.

### `host configure`

See [Global hosts and packaged applications](./docs/global-hosts-and-applications.md) for the full
global-host setup and security model.

Hosts that are shared by multiple projects can be stored in the global SAWS home:

```bash
npx saws host create production \
  --address 203.0.113.10 \
  --user deploy \
  --platform linux/amd64 \
  --exposure public

npx saws host configure production --global --user ubuntu
```

`host configure` generates an Ed25519 deployment key when the global host does
not already have one. To use an existing, unencrypted SSH private key, import it
before configuring the host:

```bash
npx saws host key import production --file ~/.ssh/production_deploy
npx saws host configure production --global --user ubuntu
```

The import command validates the key and stores its contents only in encrypted
global storage. It refuses to replace an existing host key unless `--force` is
provided, and it never modifies the source key file.

Reference the resulting concrete `Host` from any project's `saws.ts`:

```ts
import { getGlobalHost } from "@saws/core";
import { HonoService } from "@saws/hono-service";

export const host = getGlobalHost("production");

export default new HonoService({
  name: "api",
  host,
});
```

Profiles are stored beneath `~/.saws/hosts`, while their deployment keys are kept
in the encrypted global secret store beneath `~/.saws/secrets`. `SAWS_HOME` can
override the base directory. A global profile contains no private key material.

Inline, project-owned hosts remain supported. Define the encrypted global key
reference with the host in `saws.ts`:

```ts
import { Host, SecretsManager } from "@saws/core";

export const secrets = new SecretsManager();

const host = new Host({
  name: "main",
  address: "203.0.113.10",
  user: "deploy",
  sshPrivateKey: secrets.global.reference("main-deployment-ssh-private-key"),
  platform: "linux/amd64",
});
```

Then bootstrap it through an existing privileged account:

```bash
npx saws host configure main --user ubuntu
```

`ubuntu` is used only for initial SSH and interactive `sudo`. SAWS creates and
configures `deploy`, then uses `deploy` for subsequent host operations. The
private key is encrypted in `.saws/secrets/global.env`; the public key is stored
as `SAWS_HOST_MAIN_SSH_PUBLIC_KEY` in the project-root `.env`. The private-key
secret can use any global secret name.

### `execute`

```bash
npx saws execute ./path/to/script.ts --stage <stage>

```

This command will execute a script against your application. `stage` by default will be local. If your script depends on services being running locally, you will need to run them using `npx saws dev` in another terminal tab/window.
