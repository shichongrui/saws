import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { PrismaClient } from "@prisma/client";
import { ApolloServer } from "apollo-server-lambda";
import { Handler } from "aws-lambda";

type SawsAPIConstructor = {
  typeDefs: IExecutableSchemaDefinition["typeDefs"];
  resolvers: IExecutableSchemaDefinition["resolvers"];
};

export class SawsAPI {
  apolloServer: ApolloServer;
  prismaClient: PrismaClient;

  constructor({ typeDefs, resolvers }: SawsAPIConstructor) {
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: true,
    });
  }

  createLambdaHandler = (): Handler<any, any> => {
    const handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      context.callbackWaitsForEmptyEventLoop = false;
      const results = await handler(event, context, callback);
      return results;
    };
  };
}

process.on("uncaughtException", (err) => {
  console.log("uncaught", err);
});
