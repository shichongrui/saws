import fs from "fs";
import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { ApolloServer } from "apollo-server-lambda";
import { APIGatewayProxyHandler } from "aws-lambda";
import jwt from "jsonwebtoken";
import SecretsManager from "../secrets";

export type ApolloContext = {
  user: { userId: string };
};

type APIConstructor = {
  typeDefs: IExecutableSchemaDefinition<ApolloContext>["typeDefs"];
  resolvers: IExecutableSchemaDefinition<ApolloContext>["resolvers"];
};

export const secretsManager = new SecretsManager(process.env.STAGE as string);

export default class API {
  apolloServer: ApolloServer;
  user: { userId: string };
  sourceMap?: string;

  constructor({ typeDefs, resolvers }: APIConstructor) {
    this.user = { userId: "" };
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: true,
      context: () => ({
        user: this.user,
      }),
    });
  }

  createLambdaHandler = (): APIGatewayProxyHandler => {
    const handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      const token = event.headers.authorization ?? event.headers.Authorization;
      const payload = jwt.decode(token?.replace("Bearer ", "") ?? "");
      this.user.userId = payload?.sub as string;
      context.callbackWaitsForEmptyEventLoop = false;
      const results = await handler(event, context, callback);
      return results;
    };
  };
}

export * from "apollo-server-lambda";
export * from "aws-lambda";
