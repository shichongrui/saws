// graphql.js

import { gql } from 'apollo-server-lambda';
import { SawsAPI } from 'saws';

// Construct a schema, using GraphQL schema language
export const typeDefs = gql`
  type Query {
    hello: String
  }
`;

// Provide resolver functions for your schema fields
export const resolvers = {
  Query: {
    hello: () => 'Hello world! Changed',
  },
};

export default new SawsAPI({
    typeDefs,
    resolvers,
});
