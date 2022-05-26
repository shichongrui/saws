<div align='center'>

# Email

Service and library for sending email in your application.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [EmailService](#email-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [Email](#email-library)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/email
```

Then add the included service ([`EmailService`](#email-service)) to your `saws.js` file.

## Development <a id='development'>

In development this service does nothing. There is no local infrastructure required for how the library implements email sending.

Any emails sent in development will just be logged to the console.

## Deployment <a id='deployment'>

In a deployed environment, email sending is managed by AWS SES. One thing to note is that by default all SES accounts are by default limited to verified domains and emails. So if you'd like to use SES to send to non verified emails, you will need to go through their process to have your account removed from the sandbox.

When you deploy an `EmailService` no infrastructure is stood up. But any services that depend on an `EmailService` will have their permissions configured to be able to send emails via SES.

## Services <a id='services'>

`@saws/email` has a single service that is includes, `EmailService`.

### `EmailService` <a id='email-service'>

You can require the `EmailService` and use it in your `saws.js` file like so:
```js
const { EmailService } = require('@saws/email/email-service')

// will almost always be used as a dependency to another service
const email = new EmailService({
  name: 'my-email-service'
})
```

The `EmailService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

## When used as a dependency <a id='when-used-as-a-dependency'>

When an email service is used as a dependency, it does not inject any environment variables into dependant services.

## Libraries <a id='libraries'>

`@saws/email` a single library for sending email, `Email`

### Email <a id='email-library'>

The `Email` library is a class that allows you send emails via SES in production, or log to the terminal in development.

Example usage:

```ts
import { Email } from '@saws/email/email-library'

const client = new Email()
```

#### `sendEmail(options: { to: string[]; subject: string; type: "html" | "text"; message: string; source: string; })`
Sends an email.