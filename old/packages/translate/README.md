<div align='center'>

# Translate

Service and library to make using AWS's translation services easier to use.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [TranslateService](#translate-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [Translate](#translate-library)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/translate
```

Then add the [`TranslateService`](#translate-service) to your `saws.js` file.

## Development <a id='development'>

When running your SAWS application in development, this service will do nothing. Important to note that the `Translate` library will still hit AWS's translation services when running in development.

## Deployment <a id='deployment'>

When you deploy a `TranslateService` it will not create any resources in AWS. This service primarily functions as a way to ensure any dependant services have the right permissions set up.

## Services <a id='services'>

`@saws/translate` includes one service, `TranslateService`.

### `TranslateService` <a id='translate-service'>

You can require the `TranslateService` and use it in your `saws.js` file like so:
```js
const { TranslateService } = require('@saws/translate/translate-service')

// will exclusively be used as a dependency to other services
const translate = new TranslateService({
  name: 'translate-service',
})
```

The `TranslateService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `TranslateService` is used as a dependency, it will not attach any environment variables to the dependant service.

## Libraries <a id='libraries'>

`@saws/translate` includes a `Translate` class that can be used to get machine translations from AWS's translation services.

### `Translate` <a id='translate-library'>

The `Translate` class can be used as follows:

```ts
import { Translate } from '@saws/translate/translate-library'

const client = new Translate()

const result = await client.translateText('Some text', sourceLanguage, targetLanguage)
```

#### `translateText(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>`
This function will use AWS's translation services to perform a machine translation of the provided text from the source language to the target language.