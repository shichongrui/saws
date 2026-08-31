# `@saws/hermes-application`

Deploy the official Nous Research Hermes Agent image through SAWS. Hermes configuration, memory,
sessions, and installed skills persist in a stage-specific Docker volume.

Create an application input file:

```ts
import { getGlobalHost, SecretsManager } from "@saws/core";

const secrets = new SecretsManager();

export default {
  host: getGlobalHost("agents"),
  image: "nousresearch/hermes-agent:v2026.8.27",
  apiServer: {
    key: secrets.reference("hermes-api-key"),
  },
  environment: {
    production: {
      OPENROUTER_API_KEY: secrets.reference("openrouter-api-key"),
      TELEGRAM_BOT_TOKEN: secrets.reference("hermes-telegram-bot-token"),
      GATEWAY_ALLOWED_USERS: "123456789",
    },
  },
};
```

Install and deploy it:

```sh
npx saws app install @saws/hermes-application --name hermes --config ./hermes.config.ts
npx saws app deploy hermes --stage production
```

The API server and dashboard are disabled unless configured. When enabled, their defaults are ports
`8642` and `9119`; those ports must also be permitted by the target host's SAWS configuration.
Dashboard deployments must configure one of Hermes's supported authentication providers in
`environment`. Set `mountDockerSocket: true` only when Hermes should be trusted to control the host
Docker daemon.

Hermes accepts provider keys and gateway settings directly from the container environment. The
persistent volume can also be configured interactively after deployment with `hermes setup` inside
the running container.
