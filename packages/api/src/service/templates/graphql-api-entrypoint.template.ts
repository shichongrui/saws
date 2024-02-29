export const graphqlApiEntrypointTemplate = () => /* ts*/`import { GraphQLAPI } from '@saws/api/graphql-api';
import { ApolloContext } from 'apollo-server-lambda';
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import {
  types as helloWorldTypeDefs,
  resolvers as helloWorldResolvers,
} from "./hello-world";

import { IExecutableSchemaDefinition } from "@graphql-tools/schema";

const api = new GraphQLAPI({
  typeDefs: mergeTypeDefs([
    helloWorldTypeDefs
  ]),
  resolvers: mergeResolvers([
    helloWorldResolvers
  ]) as IExecutableSchemaDefinition<ApolloContext>["resolvers"],
});

export const handler = api.createLambdaHandler();
`