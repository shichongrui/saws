"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphqlHelloWorldIndexTemplate = void 0;
const graphqlHelloWorldIndexTemplate = () => /* ts */ `export const types = /* graphql */\`
type HelloWorld {
  hello: String
}

type Query {
  helloWorld: HelloWorld
}
\`

export const resolvers = {
  Query: {
    helloWorld: () => ({
      hello: 'world'
    }),
  }
}
`;
exports.graphqlHelloWorldIndexTemplate = graphqlHelloWorldIndexTemplate;
