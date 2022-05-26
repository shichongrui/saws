<div align='center'>

# Postgres

Service and functions for working with AWS RDS Postgres databases using [Prisma](https://prisma.io).

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [PostgresService](#postgres-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [getPrismaClient](#get-prisma-client)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/postgres
```

Then add the [`PostgresService`](#postgres-service) to your `saws.js` file.

## Development <a id='development'>

In development, the `PostgresService` will stand up a postgres database inside of docker running locally. In addition it will create a database for you automatically and run any existing migrations in that newly created database. It will also generate your prisma client from your `schema.prisma` file. It will also watch for changes on your `schema.prisma` file and regenerate your prisma client for you.

When you run in development for the first time with a new `PostgresService` in your `saws.js` file, it will automatically do the following:
 - Install any missing dependencies required for `prisma`
 - Create your `prisma/schema.prisma` file
 - Create a `.env` file in the root of your application so that any `prisma` command line command you run can access your locally running database.

## Deployment <a id='deployment'>

When you deploy a `PostgresService`, it will stand up and configure the following for you:
  - A Postgres DB RDS instance.
  - A security group for the RDS instance

In order to run Postgres within the free tier, you can not use Aurora. It does not have any free tier allowance. The closest you can get is with an Aurora Serverless Data API. Unfortunately Prisma does not support the Serverless Data API yet. As such to make working with your deployed postgres database as seemless as possible from Lambda, the postgres db is marked as Publicly Accessable. This will not be acceptable for some people. For others, that risk is tolerable. I'd love to support Aurora serverless as it's an even more hands off deployment of Postgres but until Prisma can support Data API, there aren't many other great options.

## Services <a id='services'>

`@saws/postgres` includes 1 function to get a preconfigured prisma client.

### `PostgresService` <a id='postgres-service'>

You can require the `PostgresService` and use it in your `saws.js` file like so:
```js
const { PostgresService } = require('@saws/postgres/postgres-service')

// will almost exclusively be used as a dependency to other services
const func = new PostgresService({
  name: 'my-func',
})
```

The `PostgresService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `imageName?: string`
Allows you to customize which postgres docker image is used when in local development.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `PostgresService` is used as a dependency, it will automatically attach (where applicable) the following environment variables into the dependent services:
 - `SERVICE_NAME_POSTGRES_USERNAME: string` - The created username to connect to the database
 - `SERVICE_NAME_POSTGRES_PASSWORD: string` - The created password to connect to the database (will be a v4 UUID)
 - `SERVICE_NAME_POSTGRES_HOST: string` - The host url of your database instance
 - `SERVICE_NAME_POSTGRES_PORT: string` - The host port of your database instance
 - `SERVICE_NAME_POSTGRES_DB_NAME: string` - The database name of your created database in the instance

## Libraries <a id='libraries'>

`@saws/postgres` utilizes Prisma as it's client and exposes a function, `getPrismaClient` to obtain a pre-configured prisma client.

### `getPrismaClient` <a id='get-prisma-client'>

The `getPrismaClient` function will return a preconfigured prisma object for connecting to your database.

Example usage:
```ts
import { getPrismaClient } from '@saws/postgres/get-prisma-client'

const prisma = new getPrismaClient('your-postgres-service-name')
```

In order for the `getPrismaClient` class to work in a service, that service must list your function service as a dependency.
