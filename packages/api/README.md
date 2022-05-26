<div align='center'>

# API Services

Services for building APIs on top of APIGateway and AWS Lambda.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [RestAPIService](#rest-api-service)
  - [GraphQLAPIService](#graphql-api-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [RestAPI](#rest-api)
  - [GraphQLAPI](#graphql-api)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/api
```

Then add one of the included services ([`RestAPIService`](#rest-api-service) or [[`GraphQLApiService`](#graphql-api-service)]) to your `saws.js` file.

## Development <a id='development'>

In development, API services will build your API from the entrypoint file and register it with the local Lambda server. It will then start up an HTTP server that will behave similarly to API Gateway and route calls to your API server. Anytime any files change in your API service, it will rebuild the code automatically.

In development, the HTTP server that is started for your `GraphQLApiService` will also expose an endpoint to access a Graphiql IDE to explore your GraphQL server. You can access it at `http://localhost:PORT/graphiql`

If your API service depends on the `@saws/cognito` `CognitoService`. It will also authenticate all HTTP requests against the `CognitoService`'s user pool.

The first time you run `npx saws dev` after adding a new API service to your `saws.js` file, it will install any missing dependencies and create a folder with a hello world lambda function entrypoint.

## Deployment <a id='deployment'>

When you deploy an API service, a number of resources will be stood up and configured for you:
 - S3 bucket for holding your Lambda function code
 - Lambda function
 - API gateway configured to trigger your lambda function
 - If your API service depends on a `CognitoService` it will also configure API Gateway with an authorizer requiring a `Bearer` token in the `Authorization` header. That token should be the access token from an authenticated session with your cognito user pool. For more information on how to use the `CognitoService` and it's libraries to obtain an access token, see [`@saws/cognito` README](../cognito/README.md)

## Services <a id='services'>

There are two flavors of API services. `RestAPIService` and `GraphQLApiService`. At the moment, `@saws/api` does not provide preconfigured `Axios` or `Apollo` clients to interact with your rest and graphql apis. Though this could be added in the future.

### `RestAPIService` <a id='rest-api-service'>

You can require the `RestAPIService` and use it in your `saws.js` file like so:
```js
const { RestAPIService } = require('@saws/api/rest-api-service')

const restApi = new RestAPIService({
  name: 'my-rest-api'
})

module.exports = restApi
```

The `RestAPIService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `handler: string`
Allows you to provide the path to your entrypoint if it is not `index.ts`.

#### `externalPackages: string[]`
Allows you to provide a list of modules or files to not include in your code bundle.

#### `port: number`
The port to run the HTTP server on. If it's already in use, a different port will be automatically selected for you.

#### `include: string[]`
A list of additional files you would like to include in your ZIP archive uploaded to S3 and used by Lambda. This is useful for files that you might need to read from disk. The file path in the zip archive will match the path from the root of your API service.

For example, given the following directory structure:
- my-rest-api
  - index.ts
  - other-folder
    - include-this-file.txt
    - other-module.ts

The ZIP archive structure will look like:
- my-rest-api
  - index.js
  - other-folder
    - include-this-file.txt

So make sure your path handling logic will still work when your code is bundled.

### `GraphQLAPIService` <a id='graphql-api-service'>

You can require the `GraphQLAPIService` and use it in your `saws.js` like so:
```js
const { GraphQLAPIService } = require('@saws/api/rest-api-service')

const graphqlApi = new GraphQLAPIService({
  name: 'my-graphql-api'
})

module.exports = graphqlApi
```

The `GraphQLAPIService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `handler: string`
Allows you to provide the path to your entrypoint if it is not `index.ts`.

#### `externalPackages: string[]`
Allows you to provide a list of modules or files to not include in your code bundle.

#### `port: number`
The port to run the HTTP server on. If it's already in use, a different port will be automatically selected for you.

#### `include: string[]`
A list of additional files you would like to include in your ZIP archive uploaded to S3 and used by Lambda. This is useful for files that you might need to read from disk. The file path in the zip archive will match the path from the root of your API service.

For example, given the following directory structure:
- my-rest-api
  - index.ts
  - other-folder
    - include-this-file.txt
    - other-module.ts

The ZIP archive structure will look like:
- my-rest-api
  - index.js
  - other-folder
    - include-this-file.txt

So make sure your path handling logic will still work when your code is bundled.

## When used as a dependency <a id='when-used-as-a-dependency'>

When an API service is used as a dependency to other services, it will automatically attach (where applicable) the following environment variables into the dependent services:
 - `SERVICE_NAME_API_URL: string` - the URL of the api

## Libraries <a id='libraries'>

`@saws/api` includes 2 libraries to help establish your API entrypoints. `RestApi` for `RestAPIService`s and `GraphQLAPI` for `GraphQLAPIService`s.

### RestAPI <a id='rest-api'>

The `RestAPI` library is a class that accepts an express application object and makes it easy to create your Lambda function entrypoint for a rest api.

Example usage:

```ts
import { RestAPI } from '@saws/api/rest-api'
import express from 'express'

const app = express()

// do whatever you need to do with your express app
app.use(...)

const restApi = new RestApi(app)

export const handler = restApi.createLambdaHandler()
```

When your `RestAPIService` depends on a `CognitoService`, the information from the provided access token will be attached to `req.user`.

### GraphQLAPI <a id='graphql-api'>

The `GraphQLAPI` library is a class that accepts `typedefs`, `resolvers` and an `onError` callback. With these options it will create an `ApolloServer`, configured to run in a Lambda function.

Example usage:

```ts
import { GraphQLAPI } from '@saws/api/graphql-api';
import { ApolloContext } from 'apollo-server-lambda';
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import {
  types as myTypeDefs,
  resolvers as myResolvers,
} from "./hello-world";

import { IExecutableSchemaDefinition } from "@graphql-tools/schema";

const api = new GraphQLAPI({
  typeDefs: mergeTypeDefs([
    myTypeDefs
  ]),
  resolvers: mergeResolvers([
    myResolvers
  ]) as IExecutableSchemaDefinition<ApolloContext>["resolvers"],
});

export const handler = api.createLambdaHandler();
```

When your `GraphQLAPIService` depends on a `CognitoService`, the information from the provided access token will be attached to `ctx.user` and `ctx.accessToken` inside of your resolver functions.

