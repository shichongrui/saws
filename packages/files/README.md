# `@saws/files`

`@saws/files` provides a persistent RustFS Docker service and an
S3-compatible file client.

```ts
import { RustFSService } from "@saws/files";

const files = new RustFSService({
  name: "assets",
  docker,
});

const api = new HonoHTTPService({
  name: "api",
  docker,
  dependencies: [files],
});
```

The dependency injects service-scoped endpoint, credentials, region, and bucket
variables. Application code only needs the service name:

```ts
import { Files } from "@saws/files";

const files = new Files("assets");
const contents = await files.readFile("documents/example.txt");
await files.writeFile("documents/copy.txt", contents);
const entries = await files.listFiles("documents/");
```

The client also exposes `getFile`, `getFileUrl`, `getFileUploadUrl`, and
`deleteFile`. Buckets are created lazily on first use.
