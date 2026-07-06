"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLAPI = void 0;
const apollo_server_lambda_1 = require("apollo-server-lambda");
const API_1 = require("./API");
class GraphQLAPI extends API_1.API {
    apolloServer;
    sourceMap;
    constructor({ typeDefs, resolvers, onError }) {
        super();
        this.user = { userId: "", username: "" };
        this.token = "";
        this.apolloServer = new apollo_server_lambda_1.ApolloServer({
            typeDefs,
            resolvers,
            csrfPrevention: true,
            context: () => ({
                user: this.user,
                authToken: this.token,
            }),
            plugins: [
                {
                    requestDidStart() {
                        return Promise.resolve({
                            didEncounterErrors(requestContext) {
                                const context = requestContext.context;
                                for (const error of requestContext.errors) {
                                    const err = error.originalError || error;
                                    console.error("Error while processing request", err);
                                    onError?.(err, context.user);
                                }
                                return Promise.resolve();
                            },
                        });
                    },
                },
            ],
        });
    }
    createLambdaHandler = () => {
        const handler = this.apolloServer.createHandler();
        return async (event, context, callback) => {
            context.callbackWaitsForEmptyEventLoop = false;
            this.authenticateRequest(event);
            this.logEvent(event);
            try {
                const results = await handler(event, context, () => { });
                return results;
            }
            catch (error) {
                console.error("Error while processing request", JSON.stringify(error, null, 2));
                throw error;
            }
        };
    };
}
exports.GraphQLAPI = GraphQLAPI;
