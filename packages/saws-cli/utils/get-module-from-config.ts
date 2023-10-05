import {
  FunctionRuntime,
  ModuleConfig,
  ModuleType,
  ServiceConfig,
  ServiceType,
} from "@shichongrui/saws-core";
import { ModuleDefinition } from "../modules/ModuleDefinition";
import { Auth } from "../modules/auth/Auth";
import { Postgres } from "../modules/postgres/Postgres";
import { Api } from "../modules/api/Api";
import { Website } from "../modules/website/Website";
import { Container } from "../modules/container/Container";
import { ContainerFunction } from "../modules/function/container/ContainerFunction";
import { TypescriptFunction } from "../modules/function/typescript/TypescriptFunction";
import { Translate } from "../modules/translate/Translate";
import { Remix } from "../modules/remix/Remix";

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
    case ServiceType.TRANSLATE:
      return new Translate(name, config);
    case ModuleType.FUNCTION:
      switch (config.runtime) {
        case FunctionRuntime.CONTAINER:
          return new ContainerFunction(name, config, dependencies);
        case FunctionRuntime.TYPESCRIPT:
          return new TypescriptFunction(name, config, dependencies);
      }
    case ModuleType.API:
      return new Api(name, config, dependencies);
    case ModuleType.WEBSITE:
      return new Website(name, config, dependencies);
    case ModuleType.CONTAINER:
      return new Container(name, config, dependencies);
    case ModuleType.REMIX:
      return new Remix(name, config, dependencies);
  }
}
