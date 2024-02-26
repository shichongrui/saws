import { API } from "./API";
import createHandler from "serverless-http";
import { Express } from "express";
import type { APIGatewayProxyHandler } from "aws-lambda";

declare global {
  namespace Express {
    export interface Request {
      user?: {
        userId: string;
        username: string;
      }
    }
  }
}

export class RestAPI extends API {
  app: Express;

  constructor(app: Express) {
    super();
    this.app = app;

    this.app.use((req, _res, next) => {
      req.user = this.user;
      next();
    })
  }

  createLambdaHandler = (): APIGatewayProxyHandler => {
    const handler = createHandler(this.app, { provider: "aws" });
    return async (event, context, callback) => {
      context.callbackWaitsForEmptyEventLoop = false;

      this.authenticateRequest(event);
      this.logEvent(event);

      try {
        const results = await handler(event, context) as any;
        callback(null, results);
        return results;
      } catch (error) {
        console.error(
          "Error while processing request",
          JSON.stringify(error, null, 2)
        );
        callback(error as Error);
      }
    };
  };
}

export { default as express, Router } from 'express'