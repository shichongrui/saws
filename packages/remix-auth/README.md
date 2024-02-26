# saws-remix-auth

An out of the box functioning auth set up for a saws-remix app

After you've npm installed the library into your saws remix app do the following

- Create a folder in `routes` called `authenticate`
- Create a `loader.server.ts` in that folder with the following contents
```
export { loader } from '@shichongrui/saws-remix-auth/dist/Authenticate/loader'
```
- Create a `route.tsx` in that folder with the following contents
```
import {
  AuthenticateRoute,
} from "@shichongrui/saws-remix-auth/dist/Authenticate/route";
export { loader } from './loader.server'

export default AuthenticateRoute;
```
- You will also need to create a `session.server.ts` somewhere with the following contents
```
export { getUserId } from '@shichongrui/saws-remix-auth/dist/utils/session.server'
```