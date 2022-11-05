import http from "http";
import prompt from "prompt";
import { Cognito } from "../../aws/cognito";
import { ModuleType, ServiceType } from "../../config";
import { getSawsConfig } from "../../utils/get-saws-config";
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

  const config = await getSawsConfig(".");
  const auth = Object.entries(config.services).find(
    ([_, c]) => c.type === ServiceType.AUTH
  );
  const api = Object.entries(config.modules).find(
    ([_, c]) => c.type === ModuleType.API
  );

  const {
    [auth?.[0] ?? ""]: { userPoolId, userPoolClientId },
    [api?.[0] ?? ""]: { graphqlEndpoint },
  } = await getStageOutputs(stage);

  const authResponse = await cognitoClient.initiateAuth(
    String(userPoolId),
    String(userPoolClientId),
    username.toString(),
    password.toString()
  );

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/graphiql") {
      const html = graphiqlTemplate({
        graphqlServerUrl: String(graphqlEndpoint),
        accessToken: authResponse.AuthenticationResult?.AccessToken ?? "",
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
