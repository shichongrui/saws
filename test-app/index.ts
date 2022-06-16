// graphql.js

import { SawsAPI, gql, Secrets } from 'saws';

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
        hello: async () => {
          const secret = await Secrets.get('test');
          return 'Hello world! ' + secret;
        },
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
