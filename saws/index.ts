import { IExecutableSchemaDefinition } from "@graphql-tools/schema";
import { ApolloServer } from "apollo-server-lambda";
import { Handler } from "aws-lambda";
import { PrismaClient } from ".prisma/client";
import { getParameter } from "./src/aws/ssm";
import { DB_PASSWORD_PARAMETER_NAME } from "./src/utils/constants";
import Secrets from './src/secrets';

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
          NODE_ENV,
        } = process.env;

        let dbPassword = 'password';
        if (NODE_ENV === 'prod') {
          dbPassword = await getParameter(DB_PASSWORD_PARAMETER_NAME, true);
        }

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
export { default as Secrets } from './src/secrets'; 