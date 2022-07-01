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
        accessToken:
          "eyJraWQiOiI5TXA3Qlp2K2hOcnBwS0lJZnBmZGxIN0N5NWl5em9FVU90OGhPTGY1ZmNvPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmYThmMmMwZC02ZTQyLTQwNjMtYjU3Yi01MTVhNWEwYTAxNDYiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9ONW85MG5sSnkiLCJjbGllbnRfaWQiOiI1NXY5dWo4bTFrMXJrc3ZucG80ZDZpNXVlZSIsIm9yaWdpbl9qdGkiOiI3YWZmZjUwZS05NmIyLTQ2ODYtODk5Ny04Y2QyMmE1MzQyYzciLCJldmVudF9pZCI6ImM3MzVkNjQ3LTUwZjgtNGVkMy05OTRjLWY5YmFiN2QzMTIyOSIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE2NTY2NDExNTIsImV4cCI6MTY1NjY0NDc1MiwiaWF0IjoxNjU2NjQxMTUyLCJqdGkiOiI0M2UxMzAyZi00NzQyLTQ1ZDEtYTE3Yy1lMjdlMDkzMDdjMDIiLCJ1c2VybmFtZSI6ImZhOGYyYzBkLTZlNDItNDA2My1iNTdiLTUxNWE1YTBhMDE0NiJ9.AGpNbFolb97n8_kO0L325KI7YfTFZ9v-D3T-_RpkwbMZveFbSHhCDgUjMw-x5LJg6GFcMK1Fw2XVwYoTTS6OlinmmpLRBMGj5L8n-pGw_9w43Fb3eUIWw2YBL7TdC6hWx8ziyZK2VFxRGF_1EFiauA1SF0Xwf360qXqIvz3f2t00XsxS6gGZd6v69RQakWGZnFoOBJDHG1CXbgHkCbpWThXh5FQv3lOEwfDqWuGkgQhfSXuxZkeb85taGUeoo_HrapCxyQpO6GwR7nLJ467rGTJzJX38hL_s3SJ8ASviXOPADZtYlyt01fnky65aKnHdJ3stnJ3zImQeMgMY0CV8hg",
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
