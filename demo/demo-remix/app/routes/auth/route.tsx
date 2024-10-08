import { AuthenticateRoute } from '@saws/remix-auth/AuthenticateRoute'
import { sessionClient } from '../../utils/session.client'

export { loader } from './loader.server'

export default () => <AuthenticateRoute sessionClient={sessionClient} />