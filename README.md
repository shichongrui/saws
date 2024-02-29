<div align='center'>

# 🪚 SAWS 🪚

SAWS is a tool for rapid development and deployment of applications to AWS.

SAWS gives you infrastructure primitives that know how to run local versions of themselves for development, as well as stand up and configure all required infrastructure in AWS.

</div>

## Overview

SAWS manages a number of things for you:
- Based on the infrastructure needs of your app it automatically sets up a development environment for you.
- It automatically sets up a deploy process and infrastructure for you in AWS.
- It automatically connects various infrastructure primitives together for you and ensures permissions are set properly across them.
- It provides libraries to make working with these services seemless.

## Table of Contents
- [Getting Started](#getting-started)
 - [Installation](#installation)
 - [saws.js](#saws-js)
 - [Add a service](#add-a-service)
 - [Start developing](#develop)
 - [Deploy](#deploy)
- [Services](#services)
- [Libraries](#libraries)
- [Philosophy](#philosophy)

## Getting Started <a id='getting-started'>

### Installation <a id='installation'>
Install the SAWS cli and initialize your saws project:
```bash
npm install -D @saws/cli
npx saws init
```

This will install other required dependencies, write your `.gitignore`, `tsconfig.json`, and `saws.js` configuration file.

### `saws.js` <a id='saws-js'>

Your `saws.js` configuration file is where you will add the services that your application uses. SAWS will use this file to stand up your development environment as well as deploy the infrastructure your application needs.

### Add a service <a id='add-a-service'>

Once you've run the `init` command in your project, you can now add your first service. As an example, lets add a `RemixService` that depends on a `PostgresService`

```bash
npm install @saws/remix @saws/postgres
```

We'll then want to update our `saws.js` config file

```
const { PostgresService } = require('@shichongrui/saws-postgres/postgres-service')
const { RemixService } = require('@shichongrui/saws-remix/remix-service')

const postgres = new PostgresService({
  name: 'my-postgres-db'
})

const remix = new RemixService({
  name: 'my-remix-app',
  dependencies: [postgres]
})

module.exports = remix
```

### Start developing <a id='develop'>

To have SAWS create your development environment for you simply run:
```bash
npx saws dev
```

This will initialize any new service in your `saws.js` config file as well as stand up local infrastructure to begin development.

### Deploy my app <a id='deploy'>

Once your ready to deploy to AWS, make sure your AWS config is set up and run:
```bash
npx saws deploy --stage production
```

SAWS uses the idea of stages for deployed environments. So changing the `--stage` option allows you to release multiple environments of an app.

## Services <a id='services'>
- [RestApiService](./packages/api/README.md#rest-api-service)
- [GraphQLApiService](./packages/api/README.md#graphql-api-service)
- [CognitoService](./packages/cognito/README.md#cognito-service)
- [ContainerService](./packages/container/README.md#container-service)
- [EmailService](./packages/email/README.md#email-service)
- [FileStorageService](./packages/file-storage/README.md#file-storage-service)
- [TypescriptFunctionService](./packages/function/README.md#typescript-function-service)
- [ContainerFunctionService](./packages/function/README.md#container-function-service)
- [PostgresService](./packages/postgres/README.md#postgres-service)
- [RemixService](./packages/remix/README.md#remix-service)
- [SecretsService](./packages/secrets/README.md#secrets-service)
- [TranslateService](./packages/translate/README.md#translate-service)
- [WebsiteService](./packages/website/README.md#website-service)

## Libraries <a id='libraries'>
- [RestAPI](./packages/api/README.md#rest-api)
- [GraphQLApi](./packages/api/README.md#graphql-api)
- [CognitoClient](./packages/cognito/README.md#cognito-client)
- [SessionClient](./packages/cognito/README.md#session-client)
- [Email](./packages/email/README.md#email-library)
- [FileStorage](./packages/file-storage/README.md#file-storage-library)
- [FunctionClient](./packages/function/README.md#functions-client)
- [getPrismaClient](./packages/postgres/README.md#get-prisma-client)
- [Remix Auth](./packages/remix-auth/README.md)
- [SecretsManager](./packages/secrets/README.md#Secrets-manager)
- [TranslateClient](./packages/translate/README.md#translate-library)

## Philosophy <a id='philosophy'>

SAWS aims to make it as easy as possible and as cheap as possible to develop and deploy applications to AWS. As such all infrastructure primitives attempt to rely on services that are part of the AWS free tier. As such some of the choices made may not be the "best practice" for larger or enterprise applications, but are perfectly fine for smaller apps and experiments.

If an app using SAWS ever requires a change to this philosphy because of scaling or security concerns, I'll try to accomodate a path to using AWS infrastructure differently.

Each infrastructure primitive has both a `ServiceDefinition` as well as a library for easy use inside of an application. Each service definition has configuration options you can pass to it when you create it.
