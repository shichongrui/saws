// graphql.js

import { API, Secrets, RDS, Functions, gql } from 'saws';

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
    currentUser: String
    fromFunction: String
  }

  type Mutation {
    createUser(email: String!, name: String): User!
  }
`;

const api = new API({
    typeDefs,
    resolvers: {
      Query: {
        hello: async () => {
          const secret = await Secrets.get('test');
          return 'Hello world! ' + secret;
        },
        allUsers: async () => {
          const db = await RDS.getDBClient();
          return db.user.findMany();
        },
        currentUser: (_, __, { user }) => user.userId,
        fromFunction: async () => {
          const response = await Functions.call('test-container', 'Test');
          return response;
        }
      },
      Mutation: {
        createUser: async (_: unknown, { email, name }: { email: string, name?: string }) => {
          const db = await RDS.getDBClient();
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
