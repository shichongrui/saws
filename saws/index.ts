import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { ApolloServer } from "apollo-server-lambda";
import { APIGatewayProxyHandler } from "aws-lambda";
import jwt from 'jsonwebtoken';
import { PrismaClient } from ".prisma/client";
import { getSecretsManagerForStage } from "./src/secrets";
import { getDBPassword } from "./src/utils/get-db-parameters";

type SawsApolloContext = {
  db: PrismaClient;
  user: { userId: string };
}

type SawsAPIConstructor = {
  typeDefs: IExecutableSchemaDefinition<SawsApolloContext>["typeDefs"];
  resolvers: IExecutableSchemaDefinition<SawsApolloContext>["resolvers"];
};

let db: PrismaClient | null = null;

export class SawsAPI {
  apolloServer: ApolloServer;
  user: { userId: string; };

  constructor({ typeDefs, resolvers }: SawsAPIConstructor) {
    this.user = { userId: '' };
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers,
      csrfPrevention: true,
      context: async () => {
        const {
          DATABASE_USERNAME,
          DATABASE_HOST,
          DATABASE_PORT,
          DATABASE_NAME,
        } = process.env;

        const dbPassword = await getDBPassword(process.env.STAGE as string);

        if (db == null) {
          db = new PrismaClient({
            datasources: {
              db: {
                url: `postgres://${DATABASE_USERNAME}:${dbPassword}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`,
              },
            },
          });
        }

        return {
          db,
          user: this.user,
        };
      },
    });
  }

  createLambdaHandler = (): APIGatewayProxyHandler => {
    const handler = this.apolloServer.createHandler();
    return async (event, context, callback) => {
      console.log(event, context);
      const token = event.headers.authorization;
      const payload = jwt.decode(token?.replace('Bearer ', '') ?? '');
      this.user.userId = payload?.sub as string;
      context.callbackWaitsForEmptyEventLoop = false;
      try {
        const results = await handler(event, context, (...args) => {
          console.log(...args);
          callback(...args);
        });
        return results;
      } catch (err) {
        console.error(err);
        throw err;
      }
    };
  };
}

process.on("uncaughtException", (err) => {
  console.log("uncaught", err);
});

export * from "apollo-server-lambda";
export const secrets = getSecretsManagerForStage(process.env.STAGE as string);
