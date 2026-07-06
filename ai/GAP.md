Missing self-hosted deployment capabilities include:
DNS and TLS certificates
Load balancing or horizontal scaling
Remote log aggregation
Automatic rollback
Backups and restore workflows
Pruning services removed from saws.ts

Recommended parity priorities
HTTP application service: extend the Hono reverse proxy with route/domain declaration, TLS, and endpoint outputs. This becomes the self-hosted replacement for API, Remix, website and public container exposure.
Higher-level integrations: authentication, email and translation provider abstractions.
Restore operational tooling: persisted outputs and an execute/task command.

Selected unused ports automatically.

The old saws execute command is also absent. It loaded persisted stage outputs, assembled service environment variables, bundled a script, and ran it against a selected environment ([implementation (line 8)](/Users/matt/code/saws/packages/cli/src/commands/execute/command.ts:8)). This was useful for migrations, seeds and administrative scripts.

Application capabilities lost
The original was more than a deployment engine. Its main product promise was application-level integration: scaffold files, install dependencies, watch source, inject dependency configuration, and provide libraries that worked unchanged locally and in production ([original README (line 43)](/Users/matt/code/saws/README.md:43)).
The prototype does not currently replace these libraries:
Cognito backend and browser clients
Prebuilt Remix authentication UI/routes
Email client
