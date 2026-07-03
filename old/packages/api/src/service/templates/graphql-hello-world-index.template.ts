export const graphqlHelloWorldIndexTemplate = () => /* ts */`export const types = /* graphql */\`
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
`