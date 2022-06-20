import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { ApolloServer } from "apollo-server-lambda";
import { Handler } from "aws-lambda";
import { PrismaClient } from ".prisma/client";
import { getParameter } from "./src/aws/ssm";
import { getSecretsManagerForStage } from './src/secrets';
import { getDBPassword } from "./src/utils/get-db-parameters";

type SawsAPIConstructor = {
  typeDefs: IExecutableSchemaDefinition<{ db: PrismaClient }>["typeDefs"];
  resolvers: IExecutableSchemaDefinition<{ db: PrismaClient }>["resolvers"];
};

let db: PrismaClient | null = null;

export class SawsAPI {
  apolloServer: ApolloServer;

  constructor({ typeDefs, resolvers }: SawsAPIConstructor) {
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
              }
            }
          });
        }

        return {
          db,
        };
      },
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

export * from "apollo-server-lambda";
export const secrets = getSecretsManagerForStage(process.env.STAGE as string);