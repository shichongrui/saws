import http from "http";
import path from "path";
import { SAWS_DIR } from "../src/utils/constants";
import { graphiqlTemplate } from "../templates/graphiql.template";

export const startGraphiql = async () => {
  const outputsPath = path.resolve(SAWS_DIR, "saws-api-output.json");
  const { SawsApiEndpoint: endpoint } = require(outputsPath);
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/graphiql") {
      const html = graphiqlTemplate({
        graphqlServerUrl: endpoint,
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
