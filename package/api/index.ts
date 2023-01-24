import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { ApolloServer } from "apollo-server-lambda";
import { APIGatewayProxyHandler } from "aws-lambda";
import { PluginDefinition } from 'apollo-server-core';
import jwt from "jsonwebtoken";
import SecretsManager from "../secrets";

export type ApolloContext = {
  user: { userId: string };
};

type APIConstructor = {
  typeDefs: IExecutableSchemaDefinition<ApolloContext>["typeDefs"];
  resolvers: IExecutableSchemaDefinition<ApolloContext>["resolvers"];
  onError?: (err: Error, user: { userId: string }) => void
};

export const secretsManager = new SecretsManager(process.env.STAGE as string);

export default class API {
  apolloServer: ApolloServer;
  user: { userId: string };
  sourceMap?: string;

  constructor({ typeDefs, resolvers, onError }: APIConstructor) {
    this.user = { userId: "" };
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: true,
      context: () => ({
        user: this.user,
      }),
      plugins: [{
        requestDidStart() {
          return Promise.resolve({
            didEncounterErrors(requestContext) {
              const context = requestContext.context;

              for (const error of requestContext.errors) {
                const err = error.originalError || error;

                console.error("Error while processing request", err);
                onError?.(err, context.user)
              }
              return Promise.resolve();
            }
          })
        }
      }]
    });
  }

  createLambdaHandler = (): APIGatewayProxyHandler => {
    const handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      const {
        headers: _headers,
        multiValueHeaders: _multiValueHeaders,
        requestContext: _requestContext,
        ...loggableEvent
      } = event;
      console.log("Received request", {
        ...loggableEvent,
        body: JSON.parse(event.body ?? ""),
      });

      context.callbackWaitsForEmptyEventLoop = false;
      const token = event.headers.authorization ?? event.headers.Authorization;

      if (token != null) {
        const payload = jwt.decode(token?.replace("Bearer ", "") ?? "");
        this.user.userId = payload?.sub as string;
      }

      try {
        const results = await handler(event, context, () => {});
        callback(null, results);
        return results;
      } catch (error) {
        console.error("Error while processing request", error);
        callback(error as Error);
      }
    };
  };
}

export * from "apollo-server-lambda";
export * from "aws-lambda";
export * from "graphql";
