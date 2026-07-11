# Saws

SAWS is a rapid development and deployment system for creating node, typescript, and docker based services.

SAWS exposes various "services" that aid the user in building systems that are composed of many parts. Each service knows how to start itself in a development environment, as well as how to deploy itself.

Developers are required to create a `saws.ts` file in their project, where they create instances of services and configure them for their needs. Services can be dependencies of other services. In this case, a service will expose any information the parent service needs to know in order to interact with this service through environment variables. These can include things like, base urls, usernames, passwords, ports, etc...

SAWS also exposes clients for a number of services that aids in connecting to, and interacting with a service. Because of how environment variables are injected through the dependency tree of services, this allows the user create an instance of a client, connecting to a specific service, with nothing but the service's configured name.

## Monorepo

SAWS is an npm monorepo. When asked to create a new package, be sure to update the root package.json, as well as the root tsconfig.json All packages are of `type: "module"`.

## Rules
- Don't write any tests. We don't have a testing framework set up
- The `old` directory, along with the `ai` directory are both legacy implementations only to be used as reference.
