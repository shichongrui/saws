import path from 'node:path'
import { installMissingDependencies } from '@saws/utils/dependency-management'
import { tsconfigJsonTemplate } from './templates/tsconfig-json.template'
import { sawsJsTemplate } from './templates/saws-js.template'
import { createFileIfNotExists } from '@saws/utils/create-file-if-not-exists'
import { gitignoreTemplate } from './templates/gitignore.template'

export const initCommand = async () => {
  const name = path.parse(path.resolve('.')).name

  // not used for now
  await installMissingDependencies([])
  await installMissingDependencies(['@saws/core', 'typescript'], { development: true })
  
  createFileIfNotExists('./tsconfig.json', tsconfigJsonTemplate())
  createFileIfNotExists('./saws.js', sawsJsTemplate({ name }))
  createFileIfNotExists('./.gitignore', gitignoreTemplate())
}