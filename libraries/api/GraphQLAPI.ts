import type { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import type { APIGatewayProxyHandler } from "aws-lambda";
import { ApolloServer } from "apollo-server-lambda";
import { API } from "./API";

export type ApolloContext = {
  user: {
    userId: string;
    username: string;
  };
  authToken: string;
};

type APIConstructor = {
  typeDefs: IExecutableSchemaDefinition<ApolloContext>["typeDefs"];
  resolvers: IExecutableSchemaDefinition<ApolloContext>["resolvers"];
  onError?: (err: Error, user: { userId: string }) => void;
};

export class GraphQLAPI extends API {
  apolloServer: ApolloServer;
  sourceMap?: string;

  constructor({ typeDefs, resolvers, onError }: APIConstructor) {
    super();
    this.user = { userId: "", username: "" };
    this.token = "";
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: true,
      context: () => ({
        user: this.user,
        authToken: this.token,
      }),
      plugins: [
        {
          requestDidStart() {
            return Promise.resolve({
              didEncounterErrors(requestContext) {
                const context = requestContext.context;

                for (const error of requestContext.errors) {
                  const err = error.originalError || error;

                  console.error("Error while processing request", err);
                  onError?.(err, context.user);
                }
                return Promise.resolve();
              },
            });
          },
        },
      ],
    });
  }

  createLambdaHandler = (): APIGatewayProxyHandler => {
    const handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      context.callbackWaitsForEmptyEventLoop = false;

      this.authenticateRequest(event);
      this.logEvent(event);

      try {
        const results = await handler(event, context, () => {});
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

export * from "apollo-server-lambda";
export * from "graphql";
