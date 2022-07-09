import http from "http";
import prompt from "prompt";
import { Cognito } from "../../aws/cognito";
import { getStageOutputs } from "../../utils/stage-outputs";
import { graphiqlTemplate } from "../templates/graphiql.template";

export const startGraphiql = async (stage: string) => {
  const cognitoClient = new Cognito(stage);

  prompt.start();
  prompt.message = "";
  prompt.delimiter = "";

  const { username, password } = await prompt.get({
    properties: {
      username: {
        description: "Username:",
        required: true,
      },
      password: {
        description: "Password:",
        // @ts-ignore
        hidden: true,
        replace: "*",
        required: true,
      },
    },
  });

  const { graphqlEndpoint, userPoolId, userPoolClientId } =
    await getStageOutputs(stage);

  const authResponse = await cognitoClient.initiateAuth(userPoolId, userPoolClientId, username.toString(), password.toString());

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/graphiql") {
      const html = graphiqlTemplate({
        graphqlServerUrl: graphqlEndpoint,
        accessToken: authResponse.AuthenticationResult?.AccessToken ?? '',
      });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
  });

  server.listen(8000, "0.0.0.0", () => {
    console.log("Started");
  });
};
