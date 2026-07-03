import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { getSession } from "../session";

export const getLoader =
  (name: string, defaultRedirect: string = '/') =>
  async ({ request }: LoaderFunctionArgs) => {
    const session = await getSession(name, request);

    if (session != null) {
      const url = new URL(request.url);
      let redirectTo = url.searchParams.get("redirect") ?? defaultRedirect;
      return redirect(redirectTo);
    }

    return null;
  };
