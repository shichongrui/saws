import { IExecutableSchemaDefinition } from '@graphql-tools/schema';
import { ApolloServer } from 'apollo-server-lambda';

type SawsAPIConstructor = {
    typeDefs: IExecutableSchemaDefinition['typeDefs'],
    resolvers: IExecutableSchemaDefinition['resolvers']
}

export class SawsAPI {
    
    apolloServer: ApolloServer

    constructor({
        typeDefs,
        resolvers
    }: SawsAPIConstructor) {
        this.apolloServer = new ApolloServer({ typeDefs, resolvers, csrfPrevention: true });
    }
}

