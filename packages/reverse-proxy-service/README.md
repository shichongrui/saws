# `@saws/reverse-proxy-service`

Run a Caddy reverse proxy with automatic HTTPS, HTTP-to-HTTPS redirects, persistent certificates,
active upstream health checks, and load balancing.

```ts
import { ReverseProxyService } from "@saws/reverse-proxy-service";

const proxy = new ReverseProxyService({
  name: "edge",
  host,
  routes: [
    // Route a public hostname to a port on this machine.
    { hostname: "api.example.com", port: 3000 },
    {
      from: "app.example.com",
      to: ["http://10.0.0.13:3000", "http://10.0.0.14:3000"],
      healthUri: "/health",
      lbTryDuration: "5s",
    },
  ],
  acmeEmail: "ops@example.com",
});
```

Public DNS must resolve each hostname to the target machine, and the machine must accept inbound TCP
traffic on ports 80 and 443. A `hostname`/`port` route targets that port on the Docker host. The
process listening there must accept connections from Docker's bridge network. URL upstreams must be
reachable from the proxy container; use container DNS names for services on the same SAWS network or
routable private/public addresses for other machines.
