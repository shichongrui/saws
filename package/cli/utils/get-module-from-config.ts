import { ModuleConfig, ModuleType, ServiceConfig, ServiceType } from "../../config";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { Auth } from "../modules/auth/Auth";
import { Postgres } from "../modules/postgres/Postgres";
import { Function } from "../modules/function/Function";
import { Api } from "../modules/api/Api";
import { Website } from "../modules/website/Website";

export function getModuleFromConfig(
  name: string,
  config: ModuleConfig | ServiceConfig,
  dependencies: ModuleDefinition[]
) {
  switch (config.type) {
    case ServiceType.POSTGRES:
      return new Postgres(name, config);
    case ServiceType.AUTH:
      return new Auth(name, config);
    case ModuleType.FUNCTION:
      return new Function(name, config, dependencies);
    case ModuleType.API:
      return new Api(name, config, dependencies);
    case ModuleType.WEBSITE:
      return new Website(name, config, dependencies);
  }
}