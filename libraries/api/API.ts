import type { APIGatewayProxyEvent, APIGatewayProxyHandler } from "aws-lambda";
import { decode } from "jsonwebtoken";

export abstract class API {
  user?: { userId: string; username: string };
  token?: string;

  abstract createLambdaHandler(): APIGatewayProxyHandler;

  logEvent(event: APIGatewayProxyEvent) {
    const {
      headers: _headers,
      multiValueHeaders: _multiValueHeaders,
      requestContext: _requestContext,
      ...loggableEvent
    } = event;

    console.log(
      "Received request",
      JSON.stringify(
        {
          ...loggableEvent,
          body: (() => {
            try {
              return JSON.parse(event.body ?? "");
            } catch (_) {
              return event.body ?? "";
            }
          })(),
          userId: this.user?.userId,
        },
        null,
        2
      )
    );
  }

  authenticateRequest(event: APIGatewayProxyEvent) {
    this.token = event.headers.authorization ?? event.headers.Authorization;
    this.token = this.token?.replace("Bearer ", "") ?? "";

    if (this.token != null) {
      const payload = decode(this.token);
      this.user = {
        userId: payload?.sub as string,
        // @ts-expect-error
        username: payload?.username as string,
      };
    }
  }
}
