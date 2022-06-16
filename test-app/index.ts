// graphql.js

import { SawsAPI } from 'saws';
import { gql } from 'saws';

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

const api = new SawsAPI({
    typeDefs,
    resolvers: {
      Query: {
        hello: () => 'Hello world! Changed',
        allUsers: (_, __, { db }) => db.user.findMany(),
      },
      Mutation: {
        createUser: async (_: unknown, { email, name }: { email: string, name?: string }, { db }) => {
          return db.user.create({
            data: {
              email,
              name,
            }
          })
        }
      }
    },
});

export const handler = api.createLambdaHandler();
