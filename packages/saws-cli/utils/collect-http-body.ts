import http from 'http';

export const collectHttpBody = async (req: http.IncomingMessage): Promise<string | undefined> => {
  return new Promise((resolve) => {
    if (req.method !== "POST") {
      resolve(undefined);
      return;
    }
    const dataChunks: Uint8Array[] = [];
    req.on("data", function (chunk) {
      dataChunks.push(chunk);
    });

    req.on("end", function () {
      let buffer = Buffer.concat(dataChunks);
      let base64EncodedData = buffer.toString('base64');
      resolve(base64EncodedData);
    });
  });
};
