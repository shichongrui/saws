<div align='center'>

# SAWS CLI

CLI for interacting with your SAWS application.

</div>

## Table of Contents

- [Installation](#installation)
- [Commands](#commands)

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

### `logs`

```bash
npx saws logs --stage <stage>
npx saws logs <service> --stage <stage>
```

This command will tail logs for deployed services in your `saws.js` file. Pass a
service name to tail only one service. The `local` stage is a no-op.

### `host configure`

Define the encrypted global key reference with the host in `saws.ts`:

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
