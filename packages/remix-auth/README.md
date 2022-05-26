<div align='center'>

# Remix Auth

A set of components and other remix related tools for drop in integration between a `RemixService` and a `CognitoService`

</div>

## Table of Contents
- [Installation](#installation)
- [Authenticate Route](#authenticate-route)
- [getSession](#get-session)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/remix-auth
```

## Authenticate Route

`@saws/remix-auth` comes with a prebuilt route with everything you need to provide a user registration and login experience on your application. It comes with a UI built using [`Chakra UI`](https://chakra-ui.com) and will integrate with your `CognitoService`. This will work both when you run `npx saws dev` and when you deploy it to production.

To set this up follow these steps:
 - Follow these instructions for setting up Chakra in a Remix application: https://chakra-ui.com/getting-started/remix-guide
 - Create a folder in your `app` folder in your remix application called `utils`
 - Create a file in the `utils` folder called `session.client.ts`. The contents of that file should look like:
   ```ts
   import { SessionClient } from '@saws/cognito/session-client'
   export const sessionClient = new SessionClient('name-of-my-cognito-service')
   ```
 - Create a route folder in your remix application called `authenticate`
 - Create a file in `authenticate` called `loader.server.ts`. The contents of this file should look as follows:
 ```ts
 import { getLoader } from '@saws/remix-auth/loader'
 
 export const loader = getLoader('name-of-my-cognito-service', '/optional-redirect-url') // redirect url defaults to /
 ```
 - Create a file in `authenticate` called `route.tsx`. The contents of this file should look as follows:
 ```ts
 import { AuthenticateRoute } from '@saws/remix-auth/AuthenticateRoute'
 import { sessionClient } from '../utils/session.client'

 export { loader } from './loader.server'

 export default () => <AuthenticateRoute sessionClient={sessionClient} />
 ```
 - In your `root.tsx` file add a `loader` function so we can attach the Cognito related environment variables to `window.ENV`. The `loader` function should look like this:
 ```ts
 import { captureCognitoEnvVars } from '@saws/cognito/cognito-client'

 ...

 export const loader = () => {
  return json({
    ENV: {
      stage: process.env.STAGE,
      ...captureCognitoEnvVars('name-of-my-cognito-service')
    },
  })
 }
 ```
 - Then in your `Document` component, in the `<head>` element add the following snippet:
 ```ts
 <script
   dangerouslySetInnerHTML={{
     __html: `window.ENV = ${JSON.stringify(data.ENV)}`,
   }}
 />
 ```

With all that in place you should now be able to navigate to `/authenticate` and you'll have a user registration and login flow.

## `getSession(name: string, request: Request): Promise<JWTPayload>`

After someone has gone through the authentication flow, this function can be used inside of your `loader` and `action` functions to get the contents of the payload of the JWT for the currently logged in user.

The name parameter is the name of your `CognitoService`.