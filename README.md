<div align='center'>

# 🪚 SAWS 🪚

SAWS is a tool for rapid development and deployment applications to AWS.

SAWS gives you infrastructure primitives that know how to both run local versions for development, as well as stand up this infrastructure in AWS.

</div>

## Overview

SAWS manages a number of things for you:
- Based on the infrastructure your app needs it automatically sets up a development environment for you.
- It automatically sets up a deploy process and infrastructure for you in AWS including permissions.
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

## Services <a id='servies'>
- [RestApiService](./packages/api/README.md#rest-api-service)
- [GraphQLApiService](./packages/api/README.md#graphql-api-service)
- CognitoService
- ContainerService
- EmailService
- FileStorageService
- TypescriptFunctionService
- ContainerFunctionService
- PostgresService
- RemixService
- SecretsService
- TranslateService
- WebsiteService

## Libraries <a id='libraries'>
- RestAPI
- GraphQLApi
- CognitoClient (Backend Cognito)
- SessionClient (Frontend Cognito)
- Email
- FileStorage
- FunctionClient
- getPrismaClient
- SecretsManager
- TranslateClient

## Philosophy <a href='#philosophy'>

SAWS aims to make it as easy as possible and as cheap as possible to develop and deploy applications to AWS. As such all infrastructure primitives attempt to rely on services that are part of the AWS free tier. As such some of the choices made may not be the "best practice" for larger or enterprise applications, but are perfectly fine for smaller apps and experiments.

If an app using SAWS ever requires a change to this philosphy because of scaling or security concerns, I'll try to accomodate a path to using AWS infrastructure differently.

Each infrastructure primitive has both a `ServiceDefinition` as well as a library for easy use inside of an application. Each service definition has configuration options you can pass to it when you create it.

#### Development

When you run `npx saws dev` with an `APIService` in your application, `SAWS` will automatically build your code and set up a local web server to expose the api to you.

#### Deployment

When you run `npx saws deploy` with an `APIService` in your application, `SAWS` will create a few pieces of infrastructure for you in AWS:

- An S3 bucket to upload your code to.
- A lambda function to execute your code.
- An API Gateway that triggers your lambda function
- A log group to send your lambda function logs to.

#### Outputs

The `APIService` will have the following outputs:

- `apiEndpoint`: `string` - The URL you can hit to access your API

#### Environment Variables

The `APIService` will inject the following environment variables into compatible service's runtimes, where `SERVICE_NAME` is the name of the service:

- `SERVICE_NAME_API_URL`: `string` - The URL you can hit to access your API

#### Dependencies

When `AuthService` is listed as a dependency of `APIService` it will automatically attach Cognito Authentication to the api. In both development and deployed stages, to use the API you will need a valid JWT from your `AuthService` and it will need to be attached to every request as the `Authorization` header using a `Bearer` token. That JWT will be validated against the JWK uri provided by a Cognito User Pool and the payload of the JWT will be attached to `req.user` in a `RestAPI` and to `ctx.user` in a `GraphQLAPI`.

Other services do not have any automatic side effects when listed as dependencies, other than automatic permissions.

### AuthService

The auth service enables you to easily establish user authentication in your application.

#### Service Usage

To get started, in your `saws.js` require the `AuthService` and add it to your application's infrastructure definition.

```js
const { ApiService, AuthService } = require("@shichongrui/saws/dist/services");

const auth = new AuthService({
  name: "my-auth",
});

module.exports = new APIService({
  name: "my-api",
  dependencies: [auth],
});
```

#### Config options

The `AuthService` will accept the following configuration options:

- `name`: `string` - the name of the service
- `dependencies`: `ServiceDefinition[]` - Other services your API depends on
- `devUser`: `{ email: string, password: string }` - Credentials for a development user to automatically provision

#### Library Usage

`SAWS` includes a couple of libraries for making interacting with your `AuthService` easier.

**`AuthClient`**

This is a library intended for use in a server environment to manage users in your `AuthService`. To use the library, it looks like the following:

```js
import { AuthClient } from "@shichongrui/saws/dist/libraries/auth";

const authClient = new AuthClient("my-auth");
```

In order to instantiate an `AuthClient` using the `name` of your `AuthService` you will need to list your `AuthService` as a dependency in the service where you'd like to interact with your `AuthService`. See the example above that shows the `AuthService` as a dependency of an `ApiService`. That `APIService` is where you might use this library.

This library is a WIP and more methods can be added to it. At this time it supports the following methods:

- `deleteUserFromToken(jwt: string)` - Deletes a user from your user pool from their JWT token
- `createUser(email: string, emailVerified: boolean)` - Create a user in your user pool. This will trigger an email to the user with a temporary password to use to sign in.
- `getUser(email: string)` - Gets a user based on their email address.
- `refreshAccessToken(refreshToken: string)` - Returns a new JWT for a user using their refresh token.

**`SessionClient`**

This is a library intended for use in a browser/client environment to manage an individual user's authentication session with your application. To use the library, it looks like the following:

```js
import { SessionClient } from "@shichongrui/saws/dist/libraries/auth";

const sessionClient = new SessionClient("my-auth");
```

To use the library, the environment variables that are exported as part of your `AuthService` need to be included in your front end application at `window.ENV`. To make it easier to capture these environment variables, a utility function `captureAuthEnvVars` is available to use.

```js
import { captureAuthEnvVars } from "@shichongrui/saws/dist/libraries/auth";

const environment = captureAuthEnvVars("my-auth");
```

This would need to be called from a service such as an `APIService` or `RemixService` that depend on an `AuthService`, and then attached to `window.ENV`.

`SessionClient` includes the following methods:

- `getCurrentUser()` - Returns the currently logged in user.
- `signIn(username: string, password: string)` - Logs in a user using their username and password. It will automatically capture their authentication tokens as cookies in your application. If the user requires a challenge, that will be returned as well.
- `signUp(username: string, password: string, attributes: Record<string, string>, autoSignIn: { enabled: boolean })` - Will register a user in your user pool. This will result in the confirmation link or code sent to the user via email. If `autoSignIn` is enabled, it will automatically sign the user in as well.
- `confirmSignUp(email: string, code: string)` - Allows the user to confirm their sign up with the code sent to their email.
- `completeNewPassword(user: CognitoUser, newPassword: string)` - In the event that a user has a temporary password, or is changing their existing password, this method can be used to set the user's new password.
- `signOut()` - Signs out the currently logged in user.
- `refreshTokenIfNeeded()` - Will refresh the currently logged in user's JWT using the refresh token stored in cookies. It will automatically update the cookies as well. It's encouraged to call this on each api call or route change of your app to keep the token fresh.

#### Development

When you run `npx saws dev` with an `AuthService` in your application, `SAWS` will automatically run a docker container with [Cognito Local](https://github.com/jagregory/cognito-local) in it. It will also automatically create your User Pool and User Pool Client. It will also provision a user in the user pool for you.

#### Deployment

When you run `npx saws deploy` with an `AuthService` in your application, `SAWS` will create a few pieces of infrastructure for you in AWS:

- A Cognito User Pool
- A Cognito User Pool Client

#### Outputs

The `AuthService` will have the following outputs:

- `userPoolId`: `string` - The id of the created user pool
- `userPoolName`: `string` - The name of the created user pool
- `userPoolClientId`: `string` - The id of the created user pool client
- `userPoolClientName`: `string` - The name of the created user pool client
- `userPoolJwksUri`: `string` - The JWKS uri to use to validate JWT tokens with the user pool

#### Environment Variables

The `AuthService` will inject the following environment variables into compatible service's runtimes, where `SERVICE_NAME` is the name of the service:

- `SERVICE_NAME_USER_POOL_ID`: `string` - The id of the created user pool
- `SERVICE_NAME_USER_POOL_CLIENT_ID`: `string` - The id of the created user pool client
- `SERVICE_NAME_USER_POOL_JWKS_URI`: `string` - The JWK URI to use to validate JWT tokens with the user pool

#### Dependencies

When other services are listed as a dependency of an `AuthService`, they do not have any automatic side effects.

### ContainerService

TODO

### FileStorageService

The file storage service enables you to read and write files to block storage.

#### Service Usage

To get started, in your `saws.js` require the `FileStorageService` and add it to your application's infrastructure definition.

```js
const {
  ApiService,
  FileStorageService,
} = require("@shichongrui/saws/dist/services");

const files = new FileStorageService({
  name: "my-files",
});

module.exports = new APIService({
  name: "my-api",
  dependencies: [files],
});
```

#### Config options

The `FileStorageService` will accept the following configuration options:

- `name`: `string` - the name of the service
- `dependencies`: `ServiceDefinition[]` - Other services your API depends on

#### Library Usage

`SAWS` includes a library for making interacting with your `FileStorageService` easier.

**`FileStorage`**

This is a library intended for use in a server environment to manage files in your `FileStorageService`. To use the library, it looks like the following:

```js
import { FileStorage } from "@shichongrui/saws/dist/libraries/file-storage";

const files = new FileStorage("my-files");
```

This library is a WIP and more methods can be added to it. At this time it supports the following methods:

- `getFile(path: string)` - Gets a file at a path in your file storage.
- `getFileUrl(path: string)` - Gets a signed url to download the file.
- `writeFile(path: string, file: UInt8Array)` - Writes a file to the file storage.
- `getFileUploadUrl(path: string)` - Returns a signed url that can be used to upload a file.

#### Development

When you run `npx saws dev` with a `FileStorageService` in your application, `SAWS` will automatically run a [Minio](https://min.io) docker container. It will automatically create a bucket based on the name of the service. The default login for the minio console is `minioadmin:minioadmin`.

#### Deployment

When you run `npx saws deploy` with a `FileStorageService` in your application, `SAWS` will create an S3 bucket for you.

#### Outputs

The `FileStorageService` has no outputs.

#### Environment Variables

In development, the `FileStorageService` will inject the following environment variables into compatible service's runtimes:

- `S3_ENDPOINT`: `string` - The endpoint to use in an S3 client.
- `S3_ACCESS_KEY`: `string` - The access key to use with minio (minioadmin)
- `S3_SECRET_KEY`: `string` - The secret key to use with minio (minioadmin)

#### Dependencies

When other services are listed as a dependency of a `FileStorageService`, they do not have any automatic side effects.

### ContainerFunctionService

TODO

### `TypescriptFunctionService`

The `TypescriptFunctionService` allows you to create lambda functions that can be invoked from other services or on a schedule.

#### Service Usage

To get started, in your `saws.js` require the `TypescriptFunctionService` and add it to your application's infrastructure definition.

```js
const {
  TypescriptFunctionService,
} = require("@shichongrui/saws/dist/services");

module.exports = new TypescriptFunctionService({
  name: "my-function",
});
```

Then in a directory named `my-function` create an `index.ts` file. Within that file all you need to do is export a function called `handler` and that will be the entrypoint of your function.

```js
export const handler = (event, context) => {
  return { handled: true };
};
```

For your convenience, `aws-lambda` is included in `SAWS` and can be used to provide type safety to your handler like so:
```js
import { Handler } from '@shichongrui/saws/dist/libraries'

type Event = { ... }
type Response = { ... }

export const handler: Handler<Event, Response> = (event) => {
  ...
  return response
}
```

#### Config options

The `TypescriptFunctionService` will accept the following configuration options:

- `name`: `string` - the name of the service
- `dependencies?`: `ServiceDefinition[]` - Other services your API depends on
- `rootDir?`: `string` - The path to the directory where your function entrypoint (`index.ts`) is located. If omitted it will default to `name`.
- `memory?`: `number` - Configure the amount of memory configured for your function.
- `externalPackages?`: `string[]` - A list of node_modules you do not want bundled into your function but still want included in your function package.
- `include?`: `string[]` - A list of file paths (from the root dir of your service) to include in your final bundle.
- `triggers?`: `{ cron?: string }` - A config object that allows you to provide triggers for your function. Currently only `cron` is supported.

#### Library Usage

`SAWS` includes a library for making interacting with your `TypescriptFunctionService` easier.

**`FunctionsClient`**

This is a library intended for use in a server environment to invoke your function. To use the library, it looks like the following:

```js
import { FunctionsClient } from "@shichongrui/saws/dist/libraries";

const functionsClient = new FunctionsClient();
```

This library exposes a single method to use to invoke your function from other services:
- `call(name: string, payload: any, config: { async: boolean })` - Invokes function `name` with `payload`. The config object allows you to modify if the invoke should wait for the response (`async=false`) or if it should invoke and continue without waiting (`async=true`). `async=false` is the default.

#### Development

When you run `npx saws dev` with a `TypescriptFunctionService` in your application, `SAWS` will automatically bundle your function handler. It then starts up a local Lambda mock server and registers your function with that mock server. That mock server then listens to calls from the `FunctionsClient` to run your function.

#### Deployment

When you run `npx saws deploy` with a `TypescriptFunctionService` in your application, `SAWS` will create an S3 bucket to store your function's code in. It will then create a lambda function using your code and optionally apply any triggers you have configured.

#### Outputs

The `TypescriptFunctionService` has no outputs.

#### Environment Variables

The `TypescriptFunctionService` has no exported environment variables.

#### Dependencies

When other services are listed as a dependency of a `TypescriptFunctionService`, they do not have any automatic side effects.

### `PostgresService`

The `PostgresService` allows you to have a Postgres database for your application. It also integrates with prisma to give you a database client.

#### Service Usage

To get started, in your `saws.js` require the `PostgresService` and add it to your application's infrastructure definition.

```js
const {
  PostgresService,
  TypescriptFunctionService,
} = require("@shichongrui/saws/dist/services");

module.exports = new TypescriptFunctionService({
  name: "my-function",
  dependencies: [
    new PostgresService({
      name: 'my-postgres',
    })
  ]
});
```

You will also want to create a directory called `prisma` and inside of it create a `schema.prisma` file that can be started with the following:

```
generator client {
  provider = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-1.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

You will also want to `npm install -D prisma` into your application to get the Prisma CLI client. In order to enable the prisma CLI client to connect to your local database, you will need to create a `.env` at the root of your project.

It only needs one line that should look like the following with the variables replaced with their proper values:
```.env
DATABASE_URL=postgres://<db-username>:<db-password>@<db-host>:<db-port>/<db-name>
```
In order to get these values you should run `npm run dev` once so that your postgres database can be provisioned locally. Then you can look in `.saws/saws-local-output.json` for most of the variables. For the `db-password` you can look in `.saws/.secrets` which is your local secrets file.

#### Config options

The `PostgresSErvice` will accept the following configuration options:

- `name`: `string` - the name of the service
- `dependencies?`: `ServiceDefinition[]` - Other services your database depends on

#### Library Usage

`SAWS` includes Prisma for making interacting with your `PostgresService` easier.

**`getPrismaClient`**

This function can be used to get a preconfigured, ready to go prisma client to start working with:
```js
import { getPrismaClient } from "@shichongrui/saws/dist/libraries";

const prisma = getPrismaClient('my-postgres')
```

Other Prisma CLI commands can be run directly via the `prisma` cli command.

#### Development

When you run `npx saws dev` with a `PostgresService` in your application, `SAWS` will automatically run a postgres docker container and provision it with a user and your service's database. It will also regenerate your prisma client for you anytime it detects a change in the `schema.prisma` file. It will not however automatically push Prisma schema changes, or run migrations locally for you. You will need run those steps with `npx prisma db push` and `npx prisma migrate dev`.

#### Deployment

When you run `npx saws deploy` with a `PostgresService` in your application, `SAWS` will create a RDS Postgres cluster for you. For convenience, it will make this cluster publicly accessible, but of course still password protected. This is done in order to get around the difficulties of accessing RDS from inside of a VPC with a Lambda function.

#### Outputs

The `PostgresService` has the following outputs:
 - `postgresHost`: `string` - The host of the database cluster.
 - `postgresPort`: `string` - The port the database is running on.
 - `postgresUsername`: `string` - The username of the user in the database.
 - `postgresDBName`: `string` - The name of the database.

In addition `PostgresService` automatically creates a 20 character `crypto.randomBytes` password for your database and saves it as a secret (local file in development, SSM secret in deployed environment).

#### Environment Variables

The `PostgresService` injects the following environment variables into compatible services where `SERVICE_NAME` is the name of the service:
 - `SERVICE_NAME_POSTGRES_HOST`: `string` - The host of the database cluster.
 - `SERVICE_NAME_POSTGRES_PORT`: `string` - The port the database is running on.
 - `SERVICE_NAME_POSTGRES_USERNAME`: `string` - The username of the user in the database.
 - `SERVICE_NAME_POSTGRES_DB_NAME`: `string` - The name of the database.
 - `SERVICE_NAME_POSTGRES_PASSWORD`: `string` - The password of the user in the database.

#### Dependencies

When other services are listed as a dependency of a `PostgresService`, they do not have any automatic side effects.

### `RemixService`

The `RemixService` allows you to create a Remix application.

#### Service Usage

To get started, in your `saws.js` require the `RemixService` and add it to your application's infrastructure definition.

```js
const {
  RemixService,
} = require("@shichongrui/saws/dist/services");

module.exports = new RemixService({
  name: 'my-remix-app',
});
```

At the moment, in order to get a functioning remix app, there remains a bit more set up.

First you will want to run `npm install @remix-run/react @remix-run/node react react-dom`

Then we need to create a folder matching the name of the service. In this case `my-remix-app`. Within this folder we need to create a few files and folders:

`public` folder. This folder can be used to put static assets in.
`app` folder.

`index.ts`
```js
import { RemixApp } from '@shichongrui/saws/dist/libraries'
import * as build from './build' // note this folder won't exist yet and you may see an error in your editor

const app = new RemixApp()

export const handler = app.createLambdaHandler({ build })
```

`app/root.tsx`
```js
import * as React from "react";
import { LinksFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  MetaFunction,
  LiveReload,
} from "@remix-run/react";

export const meta: MetaFunction = () => [
  {
    charset: "utf-8",
  },
  {
    title: "SAWS App",
  },
  {
    viewport: "width=device-width,initial-scale=1",
  },
];

export let links: LinksFunction = () => {
  return [];
};

interface DocumentProps {
  children: React.ReactElement;
}

const Document = ({ children }: DocumentProps, emotionCache) => {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
};

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}
```

`app/entry.client.tsx`
```js
import * as React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RemixBrowser } from '@remix-run/react'

hydrateRoot(
  document,
  <RemixBrowser />
)
```

#### Config options

The `PostgresSErvice` will accept the following configuration options:

- `name`: `string` - the name of the service
- `dependencies?`: `ServiceDefinition[]` - Other services your database depends on

#### Library Usage

`SAWS` includes Prisma for making interacting with your `PostgresService` easier.

**`getPrismaClient`**

This function can be used to get a preconfigured, ready to go prisma client to start working with:
```js
import { getPrismaClient } from "@shichongrui/saws/dist/libraries";

const prisma = getPrismaClient('my-postgres')
```

Other Prisma CLI commands can be run directly via the `prisma` cli command.

#### Development

When you run `npx saws dev` with a `PostgresService` in your application, `SAWS` will automatically run a postgres docker container and provision it with a user and your service's database. It will also regenerate your prisma client for you anytime it detects a change in the `schema.prisma` file. It will not however automatically push Prisma schema changes, or run migrations locally for you. You will need run those steps with `npx prisma db push` and `npx prisma migrate dev`.

#### Deployment

When you run `npx saws deploy` with a `PostgresService` in your application, `SAWS` will create a RDS Postgres cluster for you. For convenience, it will make this cluster publicly accessible, but of course still password protected. This is done in order to get around the difficulties of accessing RDS from inside of a VPC with a Lambda function.

#### Outputs

The `PostgresService` has the following outputs:
 - `postgresHost`: `string` - The host of the database cluster.
 - `postgresPort`: `string` - The port the database is running on.
 - `postgresUsername`: `string` - The username of the user in the database.
 - `postgresDBName`: `string` - The name of the database.

In addition `PostgresService` automatically creates a 20 character `crypto.randomBytes` password for your database and saves it as a secret (local file in development, SSM secret in deployed environment).

#### Environment Variables

The `PostgresService` injects the following environment variables into compatible services where `SERVICE_NAME` is the name of the service:
 - `SERVICE_NAME_POSTGRES_HOST`: `string` - The host of the database cluster.
 - `SERVICE_NAME_POSTGRES_PORT`: `string` - The port the database is running on.
 - `SERVICE_NAME_POSTGRES_USERNAME`: `string` - The username of the user in the database.
 - `SERVICE_NAME_POSTGRES_DB_NAME`: `string` - The name of the database.
 - `SERVICE_NAME_POSTGRES_PASSWORD`: `string` - The password of the user in the database.

#### Dependencies

When other services are listed as a dependency of a `PostgresService`, they do not have any automatic side effects.




#### Config options

## Prisma

If you want DB and prisma support

- npm i -D prisma
- npm i @prisma/client
- npx prisma init --datasource postgresql

## GraphQL

If you want GraphQL support

- npm i @graphql-tools/merge @graphql-tools/schema

  ```
  const api = new GraphQLAPI({
    typeDefs: mergeTypeDefs([
      typeDefs
    ]),
    // @ts-expect-error
    resolvers: mergeResolvers([
      ...resolvers
    ]) as IExecutableSchemaDefinition<ApolloContext>["resolvers"],
  });

  export const handler = api.createLambdaHandler();
  ```

  If you want Date and JSON type support

- npm i -D graphql-type-json

```
  const dateScalar = new GraphQLScalarType({
    name: "Date",
    description: "Date custom scalar type",
    serialize(value: Date) {
      return value.toISOString();
    },
    parseValue(value: string) {
      return new Date(value);
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.STRING) {
        return new Date(ast.value);
      }
      return null;
    },
  });

  const typeDefs = gql`
    scalar Date
    scalar JSON
  `
  ...
  mergeTypeDefs([
    typeDefs,
    ...
  ]),
  resolvers: mergeResolvers([
    {
      Date: dateScalar,
      JSON: GraphQLJSON,
    },
    ...
  ])
  ...
```

If you want Sentry support

- npm i @sentry/serverless
- ```
  if (process.env.STAGE === "prod") {
    Sentry.AWSLambda.init({
      dsn: "dsn",
      tracesSampleRate: 1.0,
      environment: process.env.STAGE,
    });
  }
  ...
  new GraphQLAPI({
    ...
    onError(err, user) {
      Sentry.withScope((scope: Scope) => {
        if (user) {
          scope.setUser({
            id: user.userId,
          });
        }
        Sentry.captureException(err);
      });
    },
    ...
  })
  ...
  export const handler = Sentry.AWSLambda.wrapHandler(api.createLambdaHandler());
  ```
