# 🪚 SAWS 🪚

- Requires @prisma/client to be installed as a peer dep
- Requires .npmrc in root of project
```
@shichongrui:registry=https://npm.pkg.github.com
```

## Starting a new project
- npm init
- npm i -D typescript
- tsconfig.json
  ```
  {
    "include": ["**/*.ts", "*.ts"],
    "compilerOptions": {
      "lib": ["ESNext"],
      "module": "CommonJS",
      "moduleResolution": "node",
      "noUnusedLocals": true,
      "removeComments": true,
      "sourceMap": true,
      "target": "ES2020",
      "resolveJsonModule": true,
      "declaration": true,
      "declarationMap": true,
      "noEmit": true,
      "esModuleInterop": true
    }
  }
  ```
- npm i ../path/to/saws
- npm link saws
- Create file saws-config.ts
  ```
  import { SawsConfig } from 'saws'
  
  export const config: SawsConfig = {
    ...
  }
  ```
- package.json start script `"start": "ts-node --preserve-symlinks ./node_modules/.bin/saws dev",`
- .gitignore
  ```
  node_modules
  .saws/postgres
  .saws/cognito
  .saws/saws-api-local-output.json
  .saws/cache
  .saws/build
  .saws/.secrets
  ```
- git init
- Create a repository in Github and push to that repository

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
