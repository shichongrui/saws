// graphql.js

import { SawsAPI } from 'saws';
import { gql, PrismaClient } from 'saws';

const prisma = new PrismaClient();

// Construct a schema, using GraphQL schema language
export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String
  }

  type Query {
    hello: String
    allUsers: [User]!
  }

  type Mutation {
    createUser(email: String!, name: String): User!
  }
`;

// Provide resolver functions for your schema fields
export const resolvers = {
  Query: {
    hello: () => 'Hello world! Changed',
    allUsers: () => prisma.user.findMany(),
  },
  Mutation: {
    createUser: async (_: unknown, { email, name }: { email: string, name?: string }) => {
      return prisma.user.create({
        data: {
          email,
          name,
        }
      })
    }
  }
};

const api = new SawsAPI({
    typeDefs,
    resolvers,
});

export const handler = api.createLambdaHandler();
