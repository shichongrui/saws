import http from "http";
import path from "path";
import { SAWS_DIR } from "../src/utils/constants";
import { getStageOutputs } from "../src/utils/stage-outputs";
import { graphiqlTemplate } from "../templates/graphiql.template";

export const startGraphiql = async (stage: string) => {
  const { graphqlEndpoint } = await getStageOutputs(stage);

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/graphiql") {
      const html = graphiqlTemplate({
        graphqlServerUrl: graphqlEndpoint,
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
