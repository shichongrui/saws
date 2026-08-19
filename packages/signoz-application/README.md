# `@saws/signoz-application`

Deploy a complete single-host SigNoz installation through SAWS. The package follows SigNoz's
Foundry Docker topology: PostgreSQL, ClickHouse Keeper, ClickHouse, schema migrations, SigNoz, and
the SigNoz OpenTelemetry collector.

Create an application input file:

```ts
import { getGlobalHost } from "@saws/core";

export default {
  host: getGlobalHost("observability"),
};
```

Install and deploy it:

```sh
npx saws app install @saws/signoz-application --name observability --config ./signoz.config.ts
npx saws app deploy observability --stage production
```

The defaults publish the SigNoz UI on port `8080` and OTLP ingestion on ports `4317` and `4318`.
Those ports must also be permitted by the target host's SAWS configuration. PostgreSQL, ClickHouse,
and ClickHouse Keeper remain private to the stage-specific Docker network.

The input accepts `name`, `network`, `appDirectory`, port overrides, image overrides, and
stage-specific environment for the SigNoz and collector containers. PostgreSQL uses a generated,
stage-scoped SAWS secret unless `postgresPassword` is supplied.
