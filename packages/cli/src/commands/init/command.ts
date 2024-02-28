import path from 'node:path'
import { installMissingDependencies } from '@shichongrui/saws-utils/dependency-management'
import { tsconfigJsonTemplate } from './templates/tsconfig-json.template'
import { sawsJsTemplate } from './templates/saws-js.template'
import { createFileIfNotExists } from '@shichongrui/saws-utils/create-file-if-not-exists'
import { gitignoreTemplate } from './templates/gitignore.template'

export const initCommand = async () => {
  const name = path.parse(path.resolve('.')).name

  // not used for now
  await installMissingDependencies([])
  await installMissingDependencies(['@shichongrui/saws-core', 'typescript'], { development: true })
  
  createFileIfNotExists('./tsconfig.json', tsconfigJsonTemplate())
  createFileIfNotExists('./saws.js', sawsJsTemplate({ name }))
  createFileIfNotExists('./.gitignore', gitignoreTemplate())
}