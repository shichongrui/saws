<div align='center'>

# FileStorage

Service and library file storage operations.

</div>

## Table of Contents
- [Installation](#installation)
- [Development](#development)
- [Deployment](#deployment)
- [Services](#services)
  - [FileStorageService](#file-storage-service)
- [When used as a dependency](#when-used-as-a-dependency)
- [Libraries](#libraries)
  - [FileStorage](#file-storage-library)

## Installation <a id='installation'>

From the command line run:
```bash
npm install @saws/file-storage
```

Then add the included service ([`FileStorageService`](#file-storage-service)) to your `saws.js` file.

## Development <a id='development'>

In development, `FileStorageService` will stand up [Minio](https://min.io) in a local docker container which has an S3 compatible API. In addition, it will create a bucket for your service.

## Deployment <a id='deployment'>

When you deploy a `FileStorageService`, 1 resource will be stood up and configured for you:
 - S3 Bucket

## Services <a id='services'>

`@saws/file-storage` only includes one service: `FileStorageService`

### `FileStorageService` <a id='file-storage-service'>

You can require the `FileStorageService` and use it in your `saws.js` file like so:
```js
const { FileStorageService } = require('@saws/file-storage/file-storage-service')

// will almost exclusively be used as a dependency to another service
const files = new FileSorageService({
  name: 'my-files',
})
```

The `FileStorageService` constructor accepts the following options:

#### `name: string`
The name of your service. This should be unique across all of your services.

#### `dependencies: ServiceDefinition[]`
An array of all of the other services this service depends on. This will ensure that permissions, environment variables, and execution order are all set up.

## When used as a dependency <a id='when-used-as-a-dependency'>

When a `FileStorageService` is used as a dependency to other services, and you are running in development, it will automatically attach (where applicable) the following environment variables into the dependent services:
 - `S3_ENDPOINT: string` - The url to the locally running Minio server.
 - `S3_ACCESS_KEY: string` - The S3 access key to access the locally running Minio server.
 - `S3_SECRET_KEY: string` - The S3 secret key to access the locally running Minio server.

## Libraries <a id='libraries'>

`@saws/file-storage` includes a library to help with file management.

### `FileStorage` <a id='file-storage-library'>

The `FileStorage` class contains methods for managing files in S3 with path based file/folder structures.

Example usage:
```ts
import { FileStorage } from '@saws/file-storage/file-storage-library'

const client = new FileStorage('my-file-storage-service-name')
```

In order for the `FileStorage` class to work in a service, that service must list your `FileStorageService` as a dependency.

#### `getFile(path: string): Promise<GetObjectCommandOutput>`
Retrieves the file located at the specified path from the S3 bucket. Returns a promise with the file content.

#### `getFileUrl(path: string): Promise<string>`
Generates and returns a presigned URL for directly accessing the specified file in the S3 bucket.

#### `getFileUploadUrl(path: string): Promise<string>`
Generates and returns a presigned URL for uploading a file to the specified path in the S3 bucket.

#### `writeFile(path: string, file: Uint8Array): Promise<void>`
Uploads the provided file to the specified path in the S3 bucket. Returns a promise that resolves upon successful upload.

#### `deleteFile(path: string): Promise<void>`
Deletes the file located at the specified path from the S3 bucket. Returns a promise that resolves upon successful deletion.

#### `listFiles(path: string): Promise<S3.ObjectList>`
Lists all files under the specified path in the S3 bucket. Returns a promise with an array of objects representing the files.