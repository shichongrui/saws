<div align='center'>

# Function

Services and library for working with serverless functions in your application.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [TypescriptFunctionService](#typescript-function-service)
  - [ContainerFunctionService](#container-function-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [FunctionsClient](#functions-client)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/function
```

Then add one of the included service ([`TypescriptFunctionService`](#typescript-function-service) or [`ContainerFunctionService`](#container-function-service)) to your `saws.js` file.

## Development <a id='development'>

In development function services enable you to develop serverless AWS Lambda functions. There are two flavors, a `typescript` function, and a `container` function.

Typescript functions will have an `index.ts` entrypoint and will be bundled into a javascript bundle. This is then run in the local Lambda server. Anytime a file is changed in the service's directory, it will re bundle the entrypoint and re-register it with the local Lambda server.

For Container functions, it will look for a `Dockerfile` in the service's directory and build it. These images should be based on one of the (AWS base images for Lambda)[https://docs.aws.amazon.com/lambda/latest/dg/images-create.html#runtimes-images-lp]. It will then register it with the local Lambda server. Any time a file changes within the service's directory it will rebuild the docker image and re-register it with the local Lambda server.

## Deployment <a id='deployment'>

When you deploy a function service, it will do one of two things, depending on the type of function.

For typescript functions it will stand up and configure the following for you:
  - S3 bucket to host your function code in
  - Apply any layers you've configured for your function
  - Create an IAM Role for your function to attach other service permissions to
  - Create a Lambda function 
  - (For scheduled lambdas) create an event rule with your cron schedule and an IAM permission for events to trigger your function.

For container functions it will stand up and configure the following for you:
  - An ECR repository to hold your Docker image
  - An IAM role for your function to attach other service permissions to
  - Create a Lambda function

## Services <a id='services'>

`@saws/function` includes 2 services, `TypescriptFunctionService` and `ContainerFunctionService`

### `TypescriptFunctionService` <a id='typescript-function-service'>

You can require the `TypescriptFunctionService` and use it in your `saws.js` file like so:
```js
const { TypescriptFunctionService } = require('@saws/function/typescript-function-service')

// can be used as a dependency to another service to allow that service to invoke this function
// or exported as a service
const func = new TypescriptFunctionService({
  name: 'my-func',
})
```

The `TypescriptFunctionService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `triggers?: { cron?: string }`
Possible triggers for your function. Currently only cron schedules are supported.

#### `externalPackages?: string[]`
Allows you to provide a list of modules or files to not include in your code bundle.

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

Your function entrypoint should be named `index.ts` inside of your service's directory. It should export a `handler` function that will be called whenever your function is invoked.

### `ContainerFunctionService` <a id='container-function-service'>

⚠️ This is one of the lesser used services in SAWS and thus may not be complete. ⚠️

You can require the `ContainerFunctionService` and use it in your `saws.js` file like so:
```js
const { ContainerFunctionService } = require('@saws/function/container-function-service')

// can be used as a dependency to another service to allow that service to invoke this function
// or exported as a service
const func = new ContainerFunctionService({
  name: 'my-func',
})
```

The `ContainerFunctionService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `port: number`
The port in your container to expose.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a function service is used as a dependency to other services there are no environment variables injected into those other services.

## Libraries <a id='libraries'>

`@saws/function` includes a library to make calling your functions from other services easier.

### `FunctionsClient` <a id='functions-client'>

The `FunctionsClient` class contains methods for invoking other function services.

Example usage:
```ts
import { FunctionsClient } from '@saws/function/functions-client'

const client = new FunctionsClient()
```

In order for the `FunctionsClient` class to work in a service, that service must list your function service as a dependency.

#### `async call<T extends any>(name: string, payload: any, config: { async: boolean } = { async: false }): Promise<T>`
Calls a function in your application. The name parameter should be the name of your function service. The payload will be passed as the `event` to your function. And the optional config options allows you to tell the client to either wait for the response or not.