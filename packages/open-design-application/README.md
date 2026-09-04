# `@saws/open-design-application`

Deploy OpenDesign behind a SAWS authentication gateway with pinned Codex CLI and Claude Code
installations. The gateway is the only published process. OpenDesign listens on loopback inside the
container and remains inaccessible until the application password and configured agent requirement
are satisfied.

Install the application, then edit its generated `config.ts`:

```sh
npx saws app install @saws/open-design-application --name design
${EDITOR:-vi} "${SAWS_HOME:-$HOME/.saws}/apps/design/config.ts"
```

```ts
import { getGlobalHost, SecretsManager } from "@saws/core";

const secrets = new SecretsManager();

export default {
  host: getGlobalHost("design-host"),
  registry: "registry.example.com/saws",
  registryAuth: {
    username: "registry-user",
    password: secrets.global.reference("container-registry-token"),
  },
  setupPassword: secrets.reference("open-design-application-password"),
  authenticationRequirement: "any",
  allowedOrigins: ["https://design.example.com"],
};
```

Store `open-design-application-password` in each deployment stage. The registry token is
machine-global and can be set from any directory with
`npx saws secrets container-registry-token --global --set '<token>'`. Then deploy:

```sh
npx saws app deploy design --stage production
```

Run `npx saws app update design` to install a newer version from the application's npm release channel. Updates never overwrite
`config.ts`.

Visit the deployed URL and enter the application password. Codex uses its structured ChatGPT
device-code protocol: open the displayed verification URL, sign in, and enter the one-time code.
Device login may first need to be enabled in personal ChatGPT security settings or by a workspace
administrator. Claude Code runs only its supported `claude auth login` command in a constrained
browser terminal. The terminal cannot launch a shell or arbitrary commands. After the selected
requirement (`any`, `codex`, `claude`, or `all`) is met, the gateway proxies OpenDesign while
continuing to enforce the password session and current CLI authentication status.

## Persistence and workspace

Three stage-specific volumes are created by default:

- `<stage>-<name>-open-design-data` at `/app/.od`
- `<stage>-<name>-agent-home` at `/agent-home`
- `<stage>-<name>-workspace` at `/workspace`

The agent-home volume contains writable Codex and Claude authentication/configuration so token
refreshes survive restarts, container replacement, and image upgrades. It must be backed up and
protected like any credential store. No credentials are included in images or SAWS outputs.

Use a named volume or bind mount for projects:

```ts
export default {
  // ...host, registry, setupPassword
  workspaceMount: "/srv/open-design-projects",
  workspacePath: "/workspace",
  openDesignVolume: "design-production-state",
  agentHomeVolume: "design-production-agent-home",
};
```

Bind-mounted directories must be writable by container UID/GID `1001`. Never overlap the workspace
with `/app/.od` or `/agent-home`.

## Image, registry, and architecture

By default SAWS derives an image from `ghcr.io/nexu-io/od:0.21.0` and pins Codex `0.151.0` and
Claude Code `2.1.252`. All three can be overridden. Remote Dockerfile deployments require `registry`;
use `registryAuth.password` with a `SecretReference` when authentication is needed. A fully prebuilt
image can instead be passed as `image`.

The upstream OpenDesign image is Alpine-based and multi-architecture. Codex publishes musl binaries
for Linux AMD64 and ARM64. Claude Code supports Alpine 3.19+ on both architectures when `libgcc`,
`libstdc++`, and `ripgrep` are installed; the derived image includes those packages.

## Reverse proxy and security

Publish only the configured gateway port. Do not publish the private loopback OpenDesign port. A
TLS reverse proxy should forward `Host`, `X-Forwarded-Host`, and `X-Forwarded-Proto`; the gateway
marks its HTTP-only, same-site session cookie secure when the forwarded protocol is HTTPS. Configure
`allowedOrigins` with every exact public browser origin.

The container preserves a read-only root filesystem, a no-new-privileges security option, a
restricted `/tmp` tmpfs, a 384 MB memory limit, and a 256 PID limit. The Docker socket is never
mounted. Codex uses `danger-full-access` inside this already isolated container because unprivileged
container runtimes commonly cannot create Codex's nested workspace sandbox; grant the workspace
mount only the files this single-user deployment may edit.

The public `/__saws/health` endpoint reports only gateway/OpenDesign process health and boolean agent
authentication state. A fresh deployment is healthy while waiting for first-time agent login.
