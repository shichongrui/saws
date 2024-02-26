const { lambdaServer } = require("../dist/src/LambdaServer");
const path = require("node:path");

(async () => {
  try {
    await lambdaServer.registerFunction({
      type: "javascript",
      name: "func-a",
      path: path.resolve(__dirname, "func-a.js"),
      environment: {},
    });
  } catch (err) {
    console.log(err);
  }

  console.log('loaded')

  const response = await lambdaServer.invokeFunction('func-a', {
    test: 'yo'
  })

  console.log(response)

  lambdaServer.close();
})();
