const {
  ServiceDefinition,
  PostgresService,
  TypescriptFunctionService,
  RemixService,
  FileStorageService,
} = require("../");

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
      ],
    }),
  ],
});

module.exports = serviceDefinition;
