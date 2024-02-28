import type { IncomingMessage } from 'node:http';

export const collectHttpBody = async (req: IncomingMessage): Promise<string | undefined> => {
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
      resolve(Buffer.from(base64EncodedData || "", "base64").toString());
    });
  });
};
