# `@saws/reverse-proxy-application`

Deploy a Caddy-based reverse proxy to a public SAWS host. Caddy obtains and renews TLS certificates
automatically and persists them in a stage-specific Docker volume.

Install the application, then edit its generated `config.ts`:

```sh
npx saws app install @saws/reverse-proxy-application --name edge
${EDITOR:-vi} "${SAWS_HOME:-$HOME/.saws}/apps/edge/config.ts"
```

```ts
import { getGlobalHost } from "@saws/core";
import type { ReverseProxyApplicationConfig } from "@saws/reverse-proxy-application";

export default {
  host: getGlobalHost("edge"),
  acmeEmail: "ops@example.com",
  routes: [
    { hostname: "api.example.com", port: 3000 },
    { hostname: "app.example.com", port: 8080, healthUri: "/health" },
    { from: "remote.example.com", to: "http://10.0.0.13:3000" },
  ],
} satisfies ReverseProxyApplicationConfig;
```

Deploy it:

```sh
npx saws app deploy edge --stage production
```

Run `npx saws app update edge` to install a newer npm `latest` version. Updates never overwrite
`config.ts`.

Before deployment, point every route's public DNS name at the host and configure the host with public
TCP ports 80 and 443. A `hostname`/`port` route targets that port on the machine running the proxy;
the process listening there must accept connections from Docker's bridge network. Other upstream
addresses must be reachable from inside the proxy container.
