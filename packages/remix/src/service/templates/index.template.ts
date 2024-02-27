export const indexTemplate = () => /* ts */`import { RemixApp } from '@shichongrui/saws-remix/remix-app'

import * as build from './build'

const app = new RemixApp()

export const handler = app.createLambdaHandler({ build })`