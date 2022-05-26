import { RemixApp } from '@saws/remix/remix-app'
// @ts-ignore
import * as build from './build'

const app = new RemixApp()

export const handler = app.createLambdaHandler({ build })