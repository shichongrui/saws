<div align='center'>

# Cognito

Services and libraries for building user authentication into your app on top of AWS Cognito.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [CognitoService](#cognito-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [CognitoClient](#cognito-client)
  - [captureCognitoEnvVars](#capture-env-vars)
  - [SessionClient](#session-client)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/cognito
```

Then add the included service ([`CognitoService`](#cognito-service)) to your `saws.js` file.

## Development <a id='development'>

In development, `CognitoService` will stand up [cognito-local](https://github.com/jagregory/cognito-local) in a docker container. In addition, it will create a user pool, user pool client, and provision a user for you.

## Deployment <a id='deployment'>

When you deploy a `CognitoService`, 2 resources will be stood up and configured for you:
 - Cognito User Pool
 - Cognito User Pool Client

## Services <a id='services'>

`@saws/cognito` only includes one service: `CognitoService`

### `CognitoService` <a id='cognito-service'>

You can require the `CognitoService` and use it in your `saws.js` file like so:
```js
const { CognitoService } = require('@saws/cognito/cognito-service')

// will almost exclusively be used as a dependency to another service
const auth = new CognitoService({
  name: 'my-auth',
  devUser: {
    email: 'dev@email.com',
    password: 'password',
  }
})
```

The `CognitoService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

#### `devUser: { email: string, password: string }`
Allows you to configure the user that is provisioned when running `npx saws dev`.

## When used as a dependency <a id='when-used-as-a-dependency'>

Some services have special handling for when `CognitoService` is used as a dependency, such as (API services)[../packages/api/README.md].

When a `CognitoService` is used as a dependency to other services, it will automatically attach (where applicable) the following environment variables into the dependent services:
 - `SERVICE_NAME_USER_POOL_ID: string` - The id of the configured user pool
 - `SERVICE_NAME_USER_POOL_CLIENT_ID: string` - The id of the configured user pool client
 - `SERVICE_NAME_USER_POOL_JWKS_URI: string` - The URL to use for JWKs JWT verification.

## Libraries <a id='libraries'>

`@saws/cognito` includes 2 libraries to help with interacting with your `CognitoService`. `CognitoClient` for `RestAPIService` backend interactions and `SessionClient` for front end interactions.

### `CognitoClient` <a id='cognito-client'>

The `CognitoClient` is a backend focused class for interacting with your cognito user pool.

Example usage:
```ts
import { CognitoClient } from '@saws/cognito/cognito-client'

const client = new CognitoClient('my-cognito-service-name')
```

In order for the `CognitoClient` to work in a service, that service must list your `CognitoService` as a dependency.

#### `deleteUserFromToken(token: string): Promise<DeleteUserCommandOutput>`
Deletes a user based on the provided access token. Returns a promise resolving to the result of the deletion.

#### `createUser(email: string, emailVerified: boolean): Promise<AdminCreateUserCommandOutput>`
Creates a new user with the specified email and email verification status in the user pool. Returns a promise resolving to the creation result.

#### `getUser(email: string): Promise<AdminGetUserCommandOutput>`
Retrieves a user by their email from the user pool. Returns a promise resolving to the user's data.

#### `refreshAccessToken(refreshToken: string)`
Refreshes the authentication tokens using the provided refresh token. Returns the new access token if successful.

### `captureCognitoEnvVars` <a id='capture-env-vars'>
This method can be used in a backend context to capture the environment variables exposed by the `CognitoService` to other services that depend on it. This is useful if you need to pass these values to a front end application.

```ts
import { captureCognitoEnvVars } from '@saws/cognito/cognito-client'

captureAuthEnvVars('my-cognito-service-name')
```

### SessionClient <a id='session-client'>

The `SessionClient` class is a front end focused library for interacting with your cognito user pool. Useful for logging in users, signing them up, etc...

Example usage:

```ts
import { SessionClient } from '@saws/cognito/session-client'

const client = new SessionClient('my-cognito-service-name')
```

In order for the `SessionClient` to work, you will need to inject the environment variables exposed by `CognitoService` into `window.ENV` in your front end application.

#### `getCurrentUser(): CognitoUser | null`
Returns the currently authenticated user from the user pool.

#### `signIn(username: string, password: string): Promise<CognitoUser>`
Authenticates a user with a username and password. Returns a promise resolving to the authenticated user.

#### `signUp({ username, password, attributes, autoSignIn }): Promise<ISignUpResult | undefined>`
Registers a new user with additional attributes. If autoSignIn is enabled, it signs in the user upon successful registration. Returns a promise resolving to the sign-up result.

#### `confirmSignUp(email: string, code: string): Promise<void>`
Confirms a user's email during the sign-up process. If auto sign-in is enabled, signs in the user. Returns a promise resolving once confirmation is complete.

#### `completeNewPassword(user: CognitoUser, newPassword: string): Promise<void>`
Completes a new password challenge for a user. Returns a promise that resolves once the new password has been successfully set.

#### `setNewPassword({ username, code, newPassword, autoSignIn }): Promise<void>`
Sets a new password for a user using a provided confirmation code. Optionally signs in the user if autoSignIn is enabled. Returns a promise resolving once the new password is set.

#### `signOut(): void`
Signs out the current user from the user pool.

#### `refreshTokenIfNeeded(): void`
Automatically refreshes the user's session if needed. Signs out the user if the session cannot be refreshed.
