import { APIGatewayProxyEvent, APIGatewayProxyHandler } from "aws-lambda";
import jwt from "jsonwebtoken";

export abstract class API {
  user?: { userId: string };

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
              return event.body ?? ""
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
    const token = event.headers.authorization ?? event.headers.Authorization;

    if (token != null) {
      const payload = jwt.decode(token?.replace("Bearer ", "") ?? "");
      this.user = { userId: payload?.sub as string };
    }
  }
}
