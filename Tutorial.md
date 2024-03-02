# Tutorial

This tutorial is going to walk you through going from an empty repository, all the way to deploying your application to AWS.

As a brief overview, this tutorial will cover:

- Initializing a new project.
- Adding services to your project.
- Running those services in development.
- Having services interact with one another.
- Deploying your project to AWS.

In order to do this tutorial, you'll need to have a few tools typical of working in Node.js already installed on your computer.

- `node.js` version 20 or higher
- `npm`
- `docker`

# Table of Contents

# Initializing

Lets get started. The first thing we'll want to do is create a new directory on your computer for your new project, and run `npm init` inside of it.

```bash
mkdir saws-tutorial
cd saws-tutorial
npm init
```

With that done, we'll want to install the `saws` cli tool from npm.

```bash
npm install -D @saws/cli
```

The `saws` cli comes with an `init` command that can be used to set up your project with all the necessary dependencies and files you will need.

```bash
npx saws init
```

After running `init` you will see a few changes happened in your project.

1. It installed `@saws/core` and `typescript` into your project.
2. It wrote a `.gitignore`.
3. It wrote a `tsconfig.json`.
4. And it wrote a `saws.js` file.

Most important here is the `saws.js` file. This is your config file where you will define all of the various services that you need or are creating. For now all you will have in there is a blank `ServiceDefinition`. This is the base class that all services extend and can be used to configure multiple services in your `saws.js` as we'll see later.

# Adding services

Lets get started with adding some services to our project. We're going to start first with building a REST api for our application.

Every service in a `SAWS` application is a published NPM package. So to add a REST API to our project, we'll first need to install the NPM package.

```bash
npm install @saws/api
```

With the service's npm module installed, lets add it to our `saws.js` file.

```js
const { ServiceDefinition } = require("@saws/core");
const { RestApiService } = require("@saws/api/rest-api-service");

const api = new RestApiService({
  name: "saws-api",
  port: 3000,
});

module.exports = new ServiceDefinition({
  name: "saws-tutorial",
  dependencies: [api],
});
```

We've created an instance of the `RestApiService` class and added it as a dependency to our `ServiceDefinition`.

Each service class might have different configuration options for their constructors. In this example we are providing a `name`, which is required, and a `port` for our Rest api to run on locally.

With our Rest api configured we are ready to run our project in development.

```bash
npx saws dev
```

You will notice a few things happen when you run the `dev` command.

If this is the first time you have run `dev` since adding a new service to your `saws.js` file, your service might perform some initialization steps.

In our case, `RestApiService` has done the following:

- Installed express into our project.
- Written our API's entrypoint file at `saws-api/index.ts` with a hello world express app.

You will notice in your terminal's output that the endpoint that your API is running at has been logged and that a local Lambda server was started. In SAWS, many services choose to deploy to AWS Lambda and thus, in development are run in a local Lambda like environment.

Lets try hitting our API:

```bash
curl http://localhost:3000/hello-world
```

You should see Hello world printed in your terminal! Fantastic.

Now lets try changing our api and seeing what happens. In your `saws-api/index.ts` file change the `/hello-world` route to send `res.send('Hello Universe!')`.

```ts
app.get("/hello-world", async (req, res) => {
  res.send("Hello Universe!");
  res.end();
});
```

Save your file and notice in your terminal you'll see a log line indicating that SAWS has automatically detected the change and rebuilt your entrypoint. This will also re-register your code with the local Lambda server.

Lets now try hitting our API again:

```bash
curl http://localhost:3000/hello-world
```

You should now see `Hello Universe!`. Awesome! But lets take things further.

# Dependencies

One area where SAWS shines is in composing multiple services together. When you add a service as a dependency of another service, those services will provide each other with information about how they can talk to one another. Lets see that in action.

We are going to add a Postgres database to our application and configure it as a dependency of our API.

To start lets install the service's npm package;

```bash
npm install @saws/postgres
```

Next lets update our `saws.js` file and add a `PostgresService` to it.

```js
const { ServiceDefinition } = require("@saws/core");
const { RestApiService } = require("@saws/api/rest-api-service");
const { PostgresService } = require("@saws/postgres/postgres-service");

const database = new PostgresService({
  name: "saws-db",
});

const api = new RestApiService({
  name: "saws-api",
  port: 3000,
  dependencies: [database],
});

module.exports = new ServiceDefinition({
  name: "saws-tutorial",
  dependencies: [api],
});
```

You'll notice two big changes here. I've created an instance of the `PostgresService` and named it `saws-db`. And I've added it as a dependency to our `RestApiService`.

With that in place we're ready to run `dev` again.

```bash
npx saws dev
```

Because this is the first time we've run `dev` after adding a service to our `saws.js` file, we'll again see the `PostgresService` set up our project with anything it's missing to run Postgres in our project.

Specifically the `PostgresService` will do the following:

- Install Prisma as our ORM.
- Created our `prisma/schema.prisma` file.
- Created a `.env` file with our `DATABASE_URL` configured so that the `prisma` cli tool can connect to our database.
- Started a `Postgres` docker container and created a database in that container.

You'll notice that the `PostgresService` also pipes all logs from the docker container to our terminal so we know what is happening in our database.

Alright, with things initialized we need to start building our database schema. Lets open our `schema.prisma` file and add a model to it:

```prisma
model Posts {
  @@map("posts")

  id      Int         @id @default(autoincrement())
  title   String
  content String
}
```

When you save this file, you'll notice that the `PostgresService` automatically detected the change in your schema file and rebuilt your Prisma client.

At the moment, the `PostgresService` can't automatically create migrations, or push schema changes to your database. So we'll rely on the `prisma` cli tool to do that for us.

```bash
npx prisma migrate dev
```

Great, our Postgres database is all set up. Lets use it in our API.

Lets create a new route in our API to create new posts in our database. In our `saws-api/index.ts` lets make the following changes.

First we're going to import the `getPrismaClient` method, which will give is a preconfigured prisma client that is ready to talk to our database.

```ts
import { getPrismaClient } from "@saws/postgres/get-prisma-client";
const client = getPrismaClient("saws-db");
```

We do not need to configure our Prisma client aside from telling it the name of our `PostgresService`. The `PostgresService` has told our `RestApiService` how to communicate with our database, and the `getPrismaClient` gives us an easy way to take advantage of that.

Next lets add a new route to our api

```ts
app.post("/posts", async (req, res) => {
  const { title, content } = req.body;
  const post = await client.posts.create({
    data: {
      title,
      content,
    },
  });

  res.json(post).send();
});
```

This route will create a new post from our input.

Lets go ahead and create a post.

```bash
curl -X POST -H "Content-Type: application/json" -d '{"title":"Saws rules!", "content":"This is great!?"}' http://localhost:3000/posts
```

We should see that `post` record returned from the curl command.

Lets add one more route to our api for returning all posts in the database.

```ts
app.get("/posts", async (req, res) => {
  const posts = await client.posts.findMany();
  res.json(posts).send();
});
```

And lets hit that endpoint so we can see all the posts in our database.

```bash
curl http://localhost:3000/posts
```

Great! Lets add one more service to our application that will help drive home this idea that SAWS services know how to talk to one another.

Lets add authorization to our API by using the SAWS Cognito service. Lets install it from npm

```bash
npm install @saws/cognito
```

And lets add it to our `saws.js` file.

```js
const { ServiceDefinition } = require("@saws/core");
const { RestApiService } = require("@saws/api/rest-api-service");
const { PostgresService } = require("@saws/postgres/postgres-service");
const { CognitoService } = require("@saws/cognito/cognito-service");

const database = new PostgresService({
  name: "saws-db",
});

const cognito = new CognitoService({
  name: "saws-cognito",
  devUser: {
    email: "dev@saws.com",
    password: "password",
  },
});

const api = new RestApiService({
  name: "saws-api",
  port: 3000,
  dependencies: [database, cognito],
});

module.exports = new ServiceDefinition({
  name: "saws-tutorial",
  dependencies: [api],
});
```

You'll notice we created a new instance of the `CognitoService` and added it as a dependency of our `RestApiService`. Now the `CognitoService` can tell the `RestApiService` how to communicate with it.

You'll also notice that the `CognitoService` has a configuration option for a `devUser`. Lets run `dev` to see what that does.

```bash
npx saws dev
```

The `CognitoService` will run a docker container with the [Cognito Local Project](https://github.com/jagregory/cognito-local). This project does not have feature parity with AWS Cognito but it supports the features that most apps will use.

In addition the `CognitoService` is going to create a `User Pool`, `User Pool Client`, and provision a user for us based on our `devUser` configuration.

Because we listed our `CognitoService` as a dependency of our `RestApiService`, our rest api will now authenticate all requests against our `Cognito User Pool`. Lets go ahead and try an unauthenticated request like we've done before.

```bash
curl http://localhost:3000/posts
```

We should expect to see `Unauthorized` in our terminal. The `RestApiService` knows how talk to our `CogntioService` to authenticate requests. Cool!

So lets get ourselves a token for our dev user using another aspect of the `saws` cli tool, script execution.

# Scripts

Let's create a new script in `scripts/get-token.ts` that uses the `CognitoClient` provides by `@saws/cognito` to get ourselves a token.

That script will look like this:

```ts
import { CognitoClient } from "@saws/cognito/cognito-client";

async function main() {
  const client = new CognitoClient('saws-cognito')

  const results = await client.initiateAuth('dev@saws.com', 'password')

  console.log(results.AuthenticationResult?.AccessToken)
}

main()
```

We can then run this script with:
```bash
npx saws execute ./scripts/get-token.ts
```

We should expect to see our JWT logged to the console. So using the `saws execute` command will run our scripts with all the information it needs so that our clients can "just work". No extra configuration required.

Now lets try hitting our api again with our new token:

```bash
curl -H "Authorization: Bearer <paste-access-token>" http://localhost:3000/posts
```

🎉 We now have an authenticated Rest API.

# Deploy

The next great part about SAWS, is that not only does each service know how to run itself locally and talk to other services, they each know how to deploy themselves and set up permissions with their dependencies.

Assuming you've configured your AWS credentials via the AWS clie, deploying your project is done with a single command.

```bash
npx saws deploy --stage production
```

Once that is done deploying you will now have a deployed Rest API that talks to Postgres and is authenticated via Cognito.

# Conclusion

And that's it. With that you've just done you now understand the most important concepts of SAWS.
- Services initialize themselves with opinionated defaults.
- Services know how to run local version of themselves.
- Services know how to communicate with their dependencies.
- Services provide clients that require no configuration to use.
- Services know how to deploy themselves.

For more information about each service currently available check out the [Services section in the Readme](./README.md#services)

For more information on the libraries these services provide, check out the [Libraries section in the Readme](./README.md#libraries)
