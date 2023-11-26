# 🪚 SAWS 🪚

SAWS is a tool intended for rapid development and deployment of applications to AWS. It provides a number of infrastructure primitives, as well as libraries to make the development and deployment process for new projects easy.

SAWS manages a number of things for you:

- Based on the infrastructure your app uses and needs it automatically sets up a development environment for you.
- Likewise, it automatically sets up a deploy process and infrastructure for you.
- It provides libraries for each infrastructure primitive to make it seemless to work with them.
- It automatically connects various infrastructure primitives together for you and ensures permissions are set properly across them.

## Philosophy

SAWS aims to make it as easy as possible and as cheap as possible to develop and deploy applications to AWS. As such all infrastructure primitives attempt to rely on services that are part of the AWS free tier. As such some of the choices made may not be the "best practice" for larger or enterprise applications, but are perfectly fine for smaller apps and experiments.

If an app using SAWS ever requires a change to this philosphy because of scaling or security concerns, I'll try to accomodate a path to using AWS infrastructure differently.

Each infrastructure primitive has both a `ServiceDefinition` as well as a library for easy use inside of an application. Each service definition has configuration options you can pass to it when you create it.

## Getting Started

### Install

SAWS currently is a private module hosted in Github packages. In order to install it you will need to add an `.npmrc` to the root of your project with the following line:

```
@shichongrui:registry=https://npm.pkg.github.com
```

You will also need to configure npm with a Github token to make authenticated npm calls to Github's package registry https://docs.github.com/en/packages/working-with-a-github-packages-registry working-with-the-npm-registry#authenticating-to-github-packages

Once you've done this you can install the necessary dependencies:

```
npm install @shichongrui/saws
npm install -D typescript
```

### Typescript Set up

You can initialize your typescript project with the following `tsconfig.json`. I've had some mixed results with various settings in the `tsconfig.json` but these seem to work well.

```json
{
  "include": ["**/*.ts", "*.ts", "**/*.tsx", "global.d.ts", "saws-config.js"],
  "exclude": [".saws", "node_modules"],
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "isolatedModules": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "target": "ES2022",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "strict": true,
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

### .gitignore

You can also initialize your `.gitignore` with the following:

```
node_modules
.saws/postgres
.saws/cognito
.saws/saws-api-local-output.json
.saws/cache
.saws/build
.saws/.secrets
```

You will not want to .gitignore the whole `.saws` directory as it contains some files you want version controlled such as the output variables from your deployments.

### SAWS config file

SAWS will read a file that defines which services you wish to use and automatically establish a development environment and deploy pipeline for you. To get started you can create a `saws.js` file at the root of your project. As an example, this is what it could look like:

```
const { AuthService, RemixService } = require('@shichongrui/saws/dist/services')

module.exports = new RemixService({
  name: 'my-app',
  dependencies: [
    new AuthService({
      name: 'user-auth',
      devUser: {
        email: 'dev@app.com',
        password: 'password',
      }
    })
  ]
})
```

This is what a `saws.js` file could look like. See below for all of the various services that SAWS supports.

### Development

In order to start development you can run

```bash
npx saws dev
```

This will start up a development version of each service your application uses.

### Deployment

SAWS uses the concepts of "stages" to differentiate between different deployed environments. To deploy to a specific stage you can run

```bash
npx saws deploy --stage <stage>
```

This will create the necessary cloudformation templates required by each of the services in your application, and connect them with the correct permissions based on you service's dependencies.

## Services

### APIService

The api service enables you to create REST (using express) or GraphQL (using Apollo) apis and deploy them to AWS Lambda.

#### Service Usage

To get started, in your `saws.js` require the `APIService` and add it to your application's infrastructure definition.

```js
const { APIService } = require("@shichongrui/saws/dist/services/api");

module.exports = new APIService({
  name: "my-api",
});
```

#### Config options

The `APIService` will accept the following configuration options:

- `name`: `string` - the name of the service
- `handler`: `string?` - An optional path to your API's entrypoint
- `dependencies`: `ServiceDefinition[]` - Other services your API depends on
- `port`: `number?` - the port to use for the web server in development
- `externalPackages`: `string[]?` - A list of any node_modules you do not want to be bundled into your app and instead be left in `node_modules`

#### Library Usage

Next you will want to create a folder with the same name as the name you used for your `APIService` and create an `index.ts` file in that folder. The `index.ts` file could look like the following:

**For REST Apis**

```js
const { RestAPI, express } = require("@shichongrui/saws/dist/libraries/api");

const app = express();

app.use((req, res, next) => {
  // middleware stuff
  next();
});

const restAPI = new RestApi(app);

export const handler = restAPI.createLambdaHandler();
```

The important pieces here are:

- You must instantiate a `new RestAPI`, passing in an express app.
- You must export a variable called `handler` that is the result of calling `restApi.createLambdaHandler()`.
- `SAWS` includes all of the exports of `express` as part of the `API` library and can be imported directly from there.

**For GraphQL Apis**

```js
const { GraphQLAPI, gql } = require("@shichongrui/saws/dist/libraries/api");

const typeDefs = gql`
  type Query {
    add(a: Int, b: Int): Int
  }
`;

const resolvers = {
  Query: {
    add: (ctx, { a, b }) => a + b,
  },
};

const graphqlAPI = new GraphQLAPI({
  typeDefs,
  resolvers,
});

export const handler = graphqlAPI.createLambdaHandler();
```

The important pieces here are:

- You must instantiate a `new GraphQLAPI`, passing in the `typeDefs` and the `resolvers` of your GraphQL API.
- You must export a variable called `handler` that is the result of calling `graphqlAPI.createLambdaHandler()`.
- `SAWS` includes all of the exports of `apollo-server-lambda`, `aws-lambda`, and `graphql` as part of the `API` library and can be imported directly from there.

**Note**
As of right now, the `API` library does not include any code to obtain a pre-configured `Axios` or `Apollo` client for accessing these apis. That is left up to the consumer for the moment, though it is something that could be added later.

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
