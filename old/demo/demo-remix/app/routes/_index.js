"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loader = void 0;
const node_1 = require("@remix-run/node");
const prisma_server_1 = require("../utils/prisma.server");
const react_1 = require("@remix-run/react");
const session_server_1 = require("../utils/session.server");
const react_2 = require("@chakra-ui/react");
const session_client_1 = require("../utils/session.client");
const secrets_server_1 = require("../utils/secrets.server");
const functions_server_1 = require("../utils/functions.server");
const loader = async ({ request }) => {
    const session = await (0, session_server_1.getSession)("demo-cognito", request);
    const secret = await secrets_server_1.secrets.get('super-secret');
    let user = null;
    if (session != null) {
        user = await prisma_server_1.prisma.user.upsert({
            where: {
                id: 1,
            },
            update: {},
            create: {
                id: 1,
                cognito_id: session.sub ?? '',
                email: "email@email.com",
                first_name: "First",
                last_name: "Last",
                account_id: 1234,
            },
        });
    }
    const response = await functions_server_1.functionsClient.call('demo-typescript-function', {
        call: 'me'
    });
    return (0, node_1.json)({
        user,
        secret,
        functionResponse: response,
    });
};
exports.loader = loader;
exports.default = () => {
    const data = (0, react_1.useLoaderData)();
    const { revalidate } = (0, react_1.useRevalidator)();
    return (<div>
      <p>Hello world!</p>
      <h3>Current User:</h3>
      <pre>{JSON.stringify(data.user, null, 2)}</pre>
      {data.user != null ? <react_2.Button onClick={() => {
                session_client_1.sessionClient.signOut();
                revalidate();
            }}>Log out</react_2.Button> : <react_1.Link to='/auth'>Sign In</react_1.Link>}
      <p>{data.secret}</p>
      <p>{JSON.stringify(data.functionResponse)}</p>
    </div>);
};
