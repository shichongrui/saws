# StaticSiteService

Serves the files in a service folder using nginx. No application code, bundler, or npm workspace is needed for the site.

```ts
import { ServiceDefinition, getGlobalHost } from "@saws/core";
import { StaticSiteService } from "@saws/static-site-service";

const website = new StaticSiteService({
  name: "website",
  host: getGlobalHost("web-server"),
  port: 8080,
  registry: "ghcr.io/your-account",
});

export default new ServiceDefinition({ name: "my-app", dependencies: [website] });
```

Initialize the service with `saws init`, then put pages and assets directly in `website/`. Initialization creates an example `index.html`, `Dockerfile`, `nginx.conf`, and `.dockerignore`, preserving existing files.

| Request                   | File                |
| ------------------------- | ------------------- |
| `/`                       | `index.html`        |
| `/about` or `/about.html` | `about.html`        |
| `/guides/start`           | `guides/start.html` |
| `/guides/`                | `guides/index.html` |
| `/styles.css`             | `styles.css`        |

Existing files take precedence over HTML rewriting. Requests with a file extension are served as-is. Directory requests use `index.html`; nginx redirects directory URLs to a trailing slash. Missing pages return 404. This is a content site, without a single-page application fallback.

`saws dev` serves on `http://localhost:8080` (or the configured port). It mounts the service folder read-only, so content edits appear on the next request. Changes to nginx configuration require restarting development.

Deployment builds an image containing the service folder and uses the normal DockerService registry, host, environment, and label configuration. Both development and deployment require Docker. No site build step runs.

Keep only public content in the folder. Dotfiles, `Dockerfile`, and `nginx.conf` are unavailable over HTTP; symlinks and directory listings are disabled. Use `.dockerignore` to exclude additional private files from deployment. `/_saws/health` is reserved for the container health check.
