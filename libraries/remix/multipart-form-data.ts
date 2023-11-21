import {
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { createFileUploadHandler } from "./create-file-upload-handler";

export const multipartFormData = (request: Request) => {
  return unstable_parseMultipartFormData(
    request,
    unstable_composeUploadHandlers(
      createFileUploadHandler({
        maxPartSize: 5_000_000,
        file: ({ filename }) => filename,
      }),
      unstable_createMemoryUploadHandler()
    )
  );
};
