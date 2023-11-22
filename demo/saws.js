const {
  ServiceDefinition,
  PostgresService,
  TypescriptFunctionService,
  RemixService,
  FileStorageService,
  AuthService
} = require("../dist/services");

const postgres = new PostgresService({
  name: "saws-example-db",
});

const serviceDefinition = new ServiceDefinition({
  name: "saws-example",
  dependencies: [
    new TypescriptFunctionService({
      name: "saws-example-function",
      dependencies: [postgres],
    }),
    new RemixService({
      name: "saws-example-website",
      port: 8000,
      dependencies: [
        postgres,
        new FileStorageService({
          name: "saws-example-files",
        }),
        new AuthService({
          name: "saws-auth",
          devUser: {
            email: "dev@saws.com",
            password: "password",
          },
        }),
      ],
    }),
  ],
});

module.exports = serviceDefinition;
