import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { finished } from "node:stream";
import { promisify } from "node:util";
import { MaxPartSizeExceededError } from "@remix-run/server-runtime";
import type { UploadHandler } from "@remix-run/server-runtime";
import { FileUploadHandlerPathResolver } from "@remix-run/node/dist/upload/fileUploadHandler";

let defaultFilePathResolver: FileUploadHandlerPathResolver = ({ filename }) => {
  let ext = filename ? extname(filename) : "";
  return "upload_" + randomBytes(4).readUInt32LE(0) + ext;
};

export function createFileUploadHandler({
  directory = tmpdir(),
  file = defaultFilePathResolver,
  maxPartSize = 3000000,
} = {}): UploadHandler {
  return async ({ name, filename, contentType, data }) => {
    if (!filename) {
      return undefined;
    }

    let filedir = resolvePath(directory);
    let path =
      typeof file === "string" ? file : file({ name, filename, contentType });

    if (!path) {
      return undefined;
    }

    let filepath = resolvePath(filedir, path);

    await mkdir(dirname(filepath), { recursive: true }).catch(() => {});

    let writeFileStream = createWriteStream(filepath);
    let size = 0;
    let deleteFile = false;
    try {
      for await (let chunk of data) {
        size += chunk.byteLength;
        if (size > maxPartSize) {
          deleteFile = true;
          throw new MaxPartSizeExceededError(name, maxPartSize);
        }
        writeFileStream.write(chunk);
      }
    } finally {
      writeFileStream.end();
      await promisify(finished)(writeFileStream);

      if (deleteFile) {
        await rm(filepath).catch(() => {});
      }
    }

    return filepath
  };
}
