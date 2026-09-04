# `@saws/signoz-application`

Deploy a complete single-host SigNoz installation through SAWS. The package follows SigNoz's
Foundry Docker topology: PostgreSQL, ClickHouse Keeper, ClickHouse, schema migrations, SigNoz, and
the SigNoz OpenTelemetry collector.

Install the application, then edit its generated `config.ts`:

```sh
npx saws app install @saws/signoz-application --name observability
${EDITOR:-vi} "${SAWS_HOME:-$HOME/.saws}/apps/observability/config.ts"
```

```ts
import { getGlobalHost } from "@saws/core";

export default {
  host: getGlobalHost("observability"),
};
```

Deploy it:

```sh
npx saws app deploy observability --stage production
```

Run `npx saws app update observability` to install a newer version from the application's npm release channel. Updates never
overwrite `config.ts`.

The defaults publish the SigNoz UI on port `8080` and OTLP ingestion on ports `4317` and `4318`.
Those ports must also be permitted by the target host's SAWS configuration. PostgreSQL, ClickHouse,
and ClickHouse Keeper remain private to the stage-specific Docker network.

The input accepts `name`, `network`, `appDirectory`, port overrides, image overrides, and
stage-specific environment for the SigNoz and collector containers. PostgreSQL uses a generated,
stage-scoped SAWS secret unless `postgresPassword` is supplied.
