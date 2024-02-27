import path from 'node:path'
import fs from 'node:fs'
import { packageJsonTemplate } from './package-json.template'
import { installDependency, npmInstall } from '@shichongrui/saws-utils/dependency-management'
import { tsconfigJsonTemplate } from './tsconfig-json.template'
import { sawsJsTemplate } from './saws-js.template'

export const initCommand = async () => {
  const name = path.parse(path.resolve('.')).name

  const packageJsonExists = fs.existsSync('./package.json')  
  if (!packageJsonExists) {
    fs.writeFileSync('./package.json', packageJsonTemplate({ name }), 'utf-8')
  }

  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))

  // not used for now
  const dependencies: string[] = []
  const installedDependencies = packageJson.dependencies ?? {}
  if (dependencies.some(d => installedDependencies[d] == null)) {
    await installDependency(dependencies.join(' '))
  }
  
  const devDependencies = ['typescript']
  const installedDevDependencies = packageJson.devDependencies ?? {}
  if (devDependencies.some(d => installedDevDependencies[d] == null)) {
    await installDependency(devDependencies.join(' '))
  }

  const tsconfigExists = fs.existsSync('./tsconfig.json')
  if (!tsconfigExists) {
    fs.writeFileSync('./tsconfig.json', tsconfigJsonTemplate(), 'utf-8')
  }

  const sawsConfigExists = fs.existsSync('./saws.js')
  if (!sawsConfigExists) {
    fs.writeFileSync('./saws.js', sawsJsTemplate({ name }), 'utf-8')
  }
}