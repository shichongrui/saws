import { installMissingDependencies } from "@saws/utils/dependency-management";
import fs from 'node:fs';
import path from 'node:path';
import { ApiService } from "./ApiService";
import { createFileIfNotExists } from '@saws/utils/create-file-if-not-exists'
import { restApiEntrypointTemplate } from "./templates/rest-api-entrypoint.template";

export class RestApiService extends ApiService {
  async init() {
    const requiredDependencies = ['express']
    await installMissingDependencies(requiredDependencies)

    fs.mkdirSync(path.resolve(this.name), { recursive: true })

    createFileIfNotExists(path.resolve(this.name, 'index.ts'), restApiEntrypointTemplate())
  }
}