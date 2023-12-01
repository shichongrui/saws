import { FunctionsClient } from "../../libraries";

(async () => {
  const client = new FunctionsClient();

  const results = await client.call('saws-example-function', {})

  console.log(results)
})();
