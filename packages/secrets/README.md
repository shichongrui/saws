<div align='center'>

# Secrets

Service and library managing Secrets in AWS SSM Parameter store.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [SecretsService](#secrets-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [SecretsManager](#secrets-manager)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/secrets
```

Then add the [`SecretsService`](#secrets-service) to your `saws.js` file.

## Development <a id='development'>

When running your SAWS application in development, this service will store and retrieve local secrets out of a .gitignored file located at `.saws/.secrets`. This file is in the same format as a `.env` file.

## Deployment <a id='deployment'>

When you deploy a `SecretsService` it will not create any additional AWS resources for you. The way to set secrets in a specific stage would be to use the `@saws/cli` `secrets` command.

## Services <a id='services'>

`@saws/secrets` includes one service, `SecretsService`.

### `SecretsService` <a id='secrets-service'>

You can require the `SecretsService` and use it in your `saws.js` file like so:
```js
const { SecretsService } = require('@saws/secrets/secrets-service')

// will almost exclusively be used as a dependency to other services
const secrets = new SecretsService({
  name: 'my-secrets',
})
```

The `SecretsService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `SecretsService` is used as a dependency, it will not attach any environment variables to the dependant service.

## Libraries <a id='libraries'>

`@saws/secrets` includes a `SecretsManager` class that can be used to get and set secrets in the current stage.

### `SecretsManager` <a id='secrets-manager'>

The `SecretsManager` class can be used as follows:

```ts
import { SecretsManager } from '@saws/secrets/secrets-manager'

const manager = new SecretsManager()

await manager.get('secret-name')

await manager.set('secret-name', 'value')
```

#### `get(name: string): Promise<string>`
This function will get a secret value from either your `.secrets` file when running locally, or from SSM Parameter Store when running in a production environment.

#### `set(name: string, value: string): Promise<void>`
This function will set a secret value either in your `.secrets` file when running locally, or to SSM Parameter Store when running in a production environment. The secret will be set as an encrypted string in Parameter Store.