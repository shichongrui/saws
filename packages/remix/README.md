<div align='center'>

# Remix

Service and functions for developing and deploying a [Remix](https://remix.run) application to AWS Lambda.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [RemixService](#remix-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [RemixApp](#remix-app)
  - [multipartFormData](#multipart-form-data)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/remix
```

Then add the [`RemixService`](#remix-service) to your `saws.js` file.

## Development <a id='development'>

In development the `RemixService` will bundle your application's entrypoint, and all of it's dependencies into a javascript file that is then registered with the SAWS Local lambda server. An HTTP server is started that then proxies requests to your Remix app running in the local Lambda server.

When you run in development for the first time with a new `RemixService` in your `saws.js` file, it will automatically do the following:
 - Install any necessary missing dependencies.
 - It will create a `remix.config.js` folder in the root of your application. It needs to be here for some of the `@remix-run/dev` code to function properly.
 - It will create your `index.ts` entrypoint.
 - It will create your `root.tsx` folder.
 - It will create a hello world `_index.tsx` route.
 - It will create a `public` directory for you for static assets.

## Deployment <a id='deployment'>

When you deploy a `RemixService`, it will stand up and configure the following for you:
  - An S3 bucket to hold your Lambda function code.
  - An S3 bucket for static assets located in your `public` directory.
  - An S3 bucket policy and Origin Access Control to allow Cloudfront to talk to the `public` assets S3 bucket.
  - A Lambda function.
  - An IAM role for the Lambda function.
  - A function URL for your Lambda function.
  - A Lambda Permission to grant cloudfront permission to invoke the function.
  - A Cloudfront distribution that serves content from both the `public` assets S3 bucket and your Lambda function URL.

While theoretically possible to support Remix's streaming responses with this configuration, I've never tried it and so don't know if it works as is or if there is additional work required.

## Services <a id='services'>

`@saws/remix` includes one service, `RemixService`.

### `RemixService` <a id='remix-service'>

You can require the `RemixService` and use it in your `saws.js` file like so:
```js
const { RemixService } = require('@saws/remix/remix-service')

const remix = new RemixService({
  name: 'my-remix-app',
})

module.exports = remix
```

The `RemixService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `rootDir?: string`
Allows you to change the name of the folder that your Remix app is located.

#### `port?: number`
The port to run your local HTTP server on.

#### `include?: string[]`
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

When a `RemixService` is used as a dependency, it will not attach any environment variables to the dependant service.

## Libraries <a id='libraries'>

`@saws/remix` includes 2 libraries to make building your Remix application easier, `RemixApp` and `multipartFormData`.

In addition to these 2 libraries, the (`@saws/remix-auth`)[../remix-auth/README.md] package contains other libraries useful if your `RemixService` depends on a `CognitoService`.

### `RemixApp` <a id='remix-app'>

The `RemixApp` class helps you in setting up your application entrypoint. When you add a new `RemixService` to your `saws.js` file and run `npx saws dev` for the first time it should automatically create your entrypoint utilizing this class. This is what it looks like:
```ts
import { RemixApp } from '@saws/remix/remix-app'

import * as build from './build'

const app = new RemixApp()

export const handler = app.createLambdaHandler({ build })
```

The `build` variable is the output of the Remix build process, which will exist after the first time you run `npx saws dev`

### `multipartFormData(request: Request): Promise<FormData>` <a id='multipart-form-data'>

To help support file uploads this function can be used in place of `await request.formData()`.

When the `encType` on your form is `multipart/formdata`, you can use `multipartFormData` to get the `formData` object. It will automatically write files to the `/tmp` directory of your Lambda function and the `formData` object will have the path to that file in place of the file itself.

If your form had a file input that looked like this:
```html
<input type='file' name='my-file' />
```

Then in your `action` function you would do:
```ts
const formData = await multipartFormData(request)
const pathToMyFile = formData.get('my-file')
```

Because this function writes to `/tmp` on the Lambda function, you are limited to the amount of disk space your Lambda function is configured with, which is 512MB by default.
