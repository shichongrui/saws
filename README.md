<div align='center'>

# 🪚 SAWS 🪚

SAWS is a tool for rapid development and deployment of applications to AWS.

SAWS gives you infrastructure primitives that know how to run local versions of themselves for development, as well as stand up and configure all required infrastructure in AWS.

</div>

## Table of Contents
- [Overview](#overview)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [saws.js](#saws-js)
  - [Add a service](#add-a-service)
  - [Start developing](#develop)
  - [Deploy](#deploy)
- [Services](#services)
- [Libraries](#libraries)
- [Philosophy](#philosophy)

## Overview

💡 Ever have an idea for a project and think to yourself, "I'm going to need a web app, a database, authentication, and file storage." 💡

So you feverishly get started. You find some docker containers for postgres and a local equivalent of S3. You happen across another project that emulates cognito locally, then you decide to create a Remix app. Great we're off to the races.

But then you realize, "Well I need an ORM...", "Oh I need to download AWS SDKs for Cognito and S3...", "Wait I can't ever remember what the names of things in the AWS SDK are, guess I'll live in the docs..."

But you finally have your app running locally and your feeling great about it. But now you need to deploy it...

"Well lets go look up Cloudformation docs for RDS...", "Man why doesn't this work..." "Well there goes my evening...", "Yes it deployed but there's an error..." "Oh I didn't add the right permission..." "Oh my clients are all configured for local, I need to go change everything to work for local infrastructure and deployed infrastructure..."

This is the pain of starting a new project, and the pain that SAWS fixes.

<b>With SAWS all you have to do is say, I want Remix, Postgres, file storage, and authentication. And it handles the rest.</b>

In Development:
- It will install all the dependencies you need into your project.
- It will create all of the boilerplate files you need.
- It will automatically stand up a local development environment for you based on what you need.
- It will keep your development environment up to date every time a file changes.

And it will do all that with one command `npx saws dev`

When you're ready to deploy:
- It will stand up and configure all of your infrastructure in AWS.
- It will manage all of the required permissions across each service.

And it will do all that with one command `npx saws deploy`

In addition, the libraries packaged into each service of SAWS are built to work both locally and in a deployed environment, with no changes in your code. So if you run `const client = new FileStorage('my-bucket')`, that code will work both locally and deployed.

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
const { PostgresService } = require('@saws/postgres/postgres-service')
const { RemixService } = require('@saws/remix/remix-service')

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

## SAWS CLI

To see more about the CLI see the [documentation on the SAW CLI](./packages/cli/README.md)

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
- [RemixApp](./packages/remix/README.md#remix-app)
- [multipartFormData](./packages/remix/README.md#multi-part-form-data)
- [SecretsManager](./packages/secrets/README.md#Secrets-manager)
- [TranslateClient](./packages/translate/README.md#translate-library)

## Philosophy <a id='philosophy'>

SAWS aims to make it as easy as possible and as cheap as possible to develop and deploy applications to AWS. As such all infrastructure primitives attempt to rely on services that are part of the AWS free tier. As such some of the choices made may not be the "best practice" for larger or enterprise applications, but are perfectly fine for smaller apps and experiments.

If an app using SAWS ever requires a change to this philosphy because of scaling or security concerns, I'll try to accomodate a path to using AWS infrastructure differently.

Each infrastructure primitive has both a `ServiceDefinition` as well as a library for easy use inside of an application. Each service definition has configuration options you can pass to it when you create it.
