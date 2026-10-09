# `@saws/vite-service`

Scaffold a React/TypeScript application, run Vite with hot reload locally, and deploy the built
application in an Nginx Docker container.

```ts
import { ViteService } from "@saws/vite-service";

export default new ViteService({
  name: "web",
  host,
  registry: "ghcr.io/my-org",
  port: 5173,
  environment: {
    local: { VITE_API_URL: "http://localhost:3000" },
    production: { VITE_API_URL: "https://api.example.com" },
  },
});
```

Here `host` is your configured SAWS `Host`. Run `saws init web` once to create missing files,
register the application workspace and TypeScript reference, and install missing dependencies.
Initialization preserves existing files and dependency versions. Run `saws dev` for the Vite server
at `http://localhost:5173`, or `saws deploy production` to deploy.

Deployment runs the workspace's installed Vite locally with `--mode <stage>` and writes `dist`
before the standard Docker build, push, and deployment. Install the application's development
dependencies on the deployment machine first. The generated Dockerfile copies only the built
assets and Nginx configuration; Node is not required in the runtime container. Nginx listens on
port 80, published at the configured `port`, supports client-side routing, and exposes `/health`.
Use a reverse proxy for public HTTPS.

Dependency environment variables and stage environment are available to Vite's configuration;
stage values take precedence. Only `VITE_*` variables are exposed to browser code by default.
These values are public and embedded at build time: runtime Docker environment changes do not
change the bundle. Use public API URLs rather than Docker-only addresses or credentials.
Stage-specific `.env.<stage>` files are supported by Vite. The generated scaffold uses `dist` as
its deployment output; keep that directory compatible with the Dockerfile when customizing it.
