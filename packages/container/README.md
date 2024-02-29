<div align='center'>

# Container

Services for running docker containers in AWS ECS.

⚠️ This is one of the lesser used services in SAWS and thus may not be complete. ⚠️

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [ContainerService](#container-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/container
```

Then add the included service ([`ContainerService`](#container-service)) to your `saws.js` file.

## Development <a id='development'>

In development, `ContainerService` will look for a `Dockerfile` in your service's directory, build it, and then run it in docker locally.

Anytime any files change in your service's directory it will automatically stop your container, rebuild the `Dockerfile` and then run it again.

## Deployment <a id='deployment'>

When you deploy a `ContainerService`, a number of resources will be stood up and configured for you:
 - ECR repository for pushing your docker image to.
 - ECS Cluster
 - ECS Service with EC2 launch type (this allows you to run your container in free tier)
 - Task Definition pointing to your image in ECR
 - Security Group to allow inbound TCP traffic on the configured port
 - EC2 instance added to your ECS cluster
 - An IAM Role for the EC2 instance to have permissiont to talk to Cloudwatch logs and the ECS cluster
 - An IAM Instance Profile

In a future release I'd like to have a configuration that allows you to choose Fargate over EC2 as the launch type. But Fargate has no free tier allowance which is why it's been done this way for now.

## Services <a id='services'>

`@saws/container` only includes one service: `ContainerService`

### `ContainerService` <a id='container-service'>

You can require the `ContainerService` and use it in your `saws.js` file like so:
```js
const { ContainerService } = require('@saws/container/container-service')

const container = new ContainerService({
  name: 'my-container',
})

module.exports = container
```

The `ContainerService` constructor accepts the following options:

##### `name: string`
The name of your service. This should be unique across all of your services.

##### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `port?: number`
The port to expose on your container. If this port is being used locally already, it will automatically select a different port.

#### `rootDir?: string`
Changes the directory that the service looks in for it's code. By default it will be whatever `name` is.

#### `healthCheckUrl?: string;`
The health check URL for ECS to hit to determine the health of your container.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `ContainerService` is used as a dependency to other services, it will automatically attach (where applicable) the following environment variables into the dependent services:
 - `SERVICE_NAME_URL: string` - The url to send requests to the container

## Libraries <a id='libraries'>

`@saws/container` does not include any libraries.