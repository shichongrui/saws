import { RemixApp } from '../../libraries'
import * as build from './build'

const app = new RemixApp()

export const handler = app.createLambdaHandler({ build })