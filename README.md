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
    "noEmit": true,
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
const { APIService } = require('@shichongrui/saws/dist/services/api')

module.exports = new APIService({
  name: 'my-api',
})
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
const { RestAPI, express } = require('@shichongrui/saws/dist/libraries/api')

const app = express()

app.use((req, res, next) => {
  // middleware stuff
  next()
})

const restAPI = new RestApi(app)

export const handler = restAPI.createLambdaHandler()
```
The important pieces here are:
 - You must instantiate a `new RestAPI`, passing in an express app.
 - You must export a variable called `handler` that is the result of calling `restApi.createLambdaHandler()`.
 - `SAWS` includes all of the exports of `express` as part of the `API` library and can be imported directly from there.

**For GraphQL Apis**
```js
const { GraphQLAPI, gql } = require('@shichongrui/saws/dist/libraries/api')

const typeDefs = gql`
  type Query {
    add(a: Int, b: Int): Int
  }
`

const resolvers = {
  Query: {
    add: (ctx, { a, b }) => a + b,
  }
}

const graphqlAPI = new GraphQLAPI({
  typeDefs,
  resolvers,
})

export const handler = graphqlAPI.createLambdaHandler()
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
const { ApiService, AuthService } = require('@shichongrui/saws/dist/services/api')

const auth = new AuthService({
  name: 'my-auth',
})

module.exports = new APIService({
  name: 'my-api',
  dependencies: [
    auth,
  ]
})
```

#### Config options

The `AuthService` will accept the following configuration options:
 - `name`: `string` - the name of the service
 - `dependencies`: `ServiceDefinition[]` - Other services your API depends on
 - `devUser`: `{ email: string, password: string }` - Credentials for a development user to automatically provision

#### Library Usage

`SAWS` includes a couple of libraries for making interacting with your `AuthService` easier.



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
