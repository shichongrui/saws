import http from 'http';

const collectHttpBody = async (req: http.IncomingMessage): Promise<string> => {
  return new Promise((resolve) => {
    if (req.method !== "POST") {
      resolve("");
      return;
    }
    let body = "";
    req.on("data", function (chunk) {
      body += chunk;
    });

    req.on("end", function () {
      resolve(body);
    });
  });
};

export default collectHttpBody;