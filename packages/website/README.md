<div align='center'>

# Website

Service for building websites using [Vite](https://vitejs.dev).

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [WebsiteService](#website-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/website
```

Then add the included service, [`WebsiteService`](#website-service) to your `saws.js` file.

## Development <a id='development'>

In development, a `WebsiteService` will use the Vite dev server to build and serve your website. It will also write any of your dependant service's environment variables to a `.env` file for Vite to read and inject into your build.

For new `WebsiteService`s that have just been added to your `saws.js` file. SAWS will create a hello world world website for you.

## Deployment <a id='deployment'>

When you deploy a `WebsiteService`, a number of resources will be stood up and configured for you:
 - An S3 bucket will be created that is configured to be used as a website.
 - A Cloudfront distribution that serves content out of the above S3 bucket.
 - A Route 53 Record Set Group to point your domain at the above Cloudfront distribution.

## Services <a id='services'>

`@saws/website` includes the `WebsiteService`

### `WebsiteService` <a id='website-service'>

You can require the `WebsiteService` and use it in your `saws.js` file like so:
```js
const { WebsiteService } = require('@saws/website/website-service')

const website = new WebsiteService({
  name: 'my-website'
})

module.exports = website
```

The `WebsiteService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `port?: number`
The port to run the Vite dev server on. If the provided port is in use, a different port will automatically be chosen.

#### `rootDir?: string`
Used if you would like the service to point at a different directory for your `WebsiteService` other than it's name.

#### `domain?: string`
A domain name that you would like to use for your website. You must own this domain and have it configured in Route 53.

#### `env?: Record<string, string>`
Additional environment variables to include in your Vite build.

#### `certificateArn?: string`
The AWS Arn to the certificate you'd like to use for your website to enable HTTPs.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `WebsiteService` is used as a dependency, it does not attach any environment variables to the dependant services.

## Libraries <a id='libraries'>

`@saws/website` does not include any libraries with it.
