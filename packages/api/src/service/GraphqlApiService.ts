import { installMissingDependencies } from "@shichongrui/saws-utils/dependency-management";
import { ApiService } from "./ApiService";
import { createFileIfNotExists } from "@shichongrui/saws-utils/create-file-if-not-exists";
import { graphqlApiEntrypointTemplate } from "./templates/graphql-api-entrypoint.template";
import path from "node:path";
import fs from "node:fs"
import { graphqlHelloWorldIndexTemplate } from "./templates/graphql-hello-world-index.template";

export class GraphQLApiService extends ApiService {
  async init() {
    const requiredDependencies = ['@graphql-tools/merge', 'graphql', 'apollo-server-lambda', '@graphql-tools/schema']
    await installMissingDependencies(requiredDependencies)

    fs.mkdirSync(path.resolve(this.name, 'hello-world'), { recursive: true })

    createFileIfNotExists(path.resolve(this.name, 'index.ts'), graphqlApiEntrypointTemplate())
    createFileIfNotExists(path.resolve(this.name, 'hello-world', 'index.ts'), graphqlHelloWorldIndexTemplate())
  }
}