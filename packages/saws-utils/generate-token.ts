import crypto from "crypto";

export const generateToken = async () => {
  return new Promise<string>((resolve, reject) => {
    crypto.randomBytes(20, (err, buffer) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(buffer.toString("hex"));
      return;
    });
  });
};
