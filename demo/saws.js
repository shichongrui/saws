const { ServiceDefinition } = require('@saws/core')
const { PostgresService } = require('@saws/postgres/postgres-service')
const { TypescriptFunctionService } = require('@saws/function/typescript-function-service')
const { RemixService } = require('@saws/remix/remix-service')
const { FileStorageService } = require('@saws/file-storage/file-storage-service')
const { CognitoService } = require('@saws/cognito/cognito-service');
const { EmailService } = require('@saws/email/email-service')
const { SecretsService } = require('@saws/secrets/secrets-service')

const postgres = new PostgresService({
  name: "demo-db",
});

const cognito = new CognitoService({
  name: "demo-cognito",
  devUser: {
    email: "dev@saws.com",
    password: "password",
  },
})

const fileStorage = new FileStorageService({
  name: "demo-files",
})

const email = new EmailService({
  name: 'demo-email'
})

const secrets = new SecretsService({
  name: 'demo-secrets'
})


const typescriptFunction = new TypescriptFunctionService({
  name: "demo-typescript-function",
  dependencies: [],
})

const remix = new RemixService({
  name: "demo-remix",
  port: 8000,
  dependencies: [postgres, cognito, fileStorage, email, secrets, typescriptFunction],
})

module.exports = new ServiceDefinition({
  name: 'saws-demo',
  dependencies: [
    remix,
    // api,
    // container,
    // website,
  ]
})
