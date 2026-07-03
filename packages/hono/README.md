# `@saws/hono`

`@saws/hono` provides a `HonoHTTPService` that scaffolds and deploys a
TypeScript Hono application, plus a `HonoClient` RPC adapter that connects to
it from dependent applications.

```ts
import { HonoHTTPService } from "@saws/hono";

const api = new HonoHTTPService({
  name: "api",
  docker,
  port: 3000,
});
```

The service exposes a name-parameterized URL to dependent applications. For a
service named `api`, the injected variable is `API_URL`.

## Client

Use `HonoClient` in a web or React Native application that depends on the
service:

```ts
import { HonoClient } from "@saws/hono";
import type { AppType } from "../api/src/index.js";

const client = new HonoClient<AppType>("api");
const response = await client.health.$get();
```

`HonoClient` wraps Hono's type-safe RPC client. It reads `API_URL` from
`globalThis.ENV` in browser or React Native runtimes and falls back to
`process.env`. The application service must expose its injected SAWS
environment as `globalThis.ENV` before constructing the client.

Hono client options remain available as the second argument:

```ts
const client = new HonoClient<AppType>("api", {
  init: { credentials: "include" },
});
```
