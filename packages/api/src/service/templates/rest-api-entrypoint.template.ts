export const restApiEntrypointTemplate = () => /* ts */`import { RestAPI } from "@shichongrui/saws-api/rest-api";
import express from 'express'

const app = express();

app.use(express.json());

app.get("/hello-world", async (req, res) => {
  res.send('Hello World!')
  res.end()
});

const api = new RestAPI(app);
export const handler = api.createLambdaHandler();
`