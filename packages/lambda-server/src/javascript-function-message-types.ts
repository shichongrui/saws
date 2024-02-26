export type ReadyMessage = {
  type: "ready";
};

export type LoadFailedMessage = {
  type: "load-failed";
  error?: string;
};

export type LoadFunctionMessage = {
  type: "load-function";
  path: string;
};

export type InvokeFunctionMessage = {
  type: "invoke";
  event: any;
  context: any;
};

export type ResponseMessage = {
  type: "response";
  response: any;
};

export type ErrorMessage = {
  type: "error";
  error: string;
};

export type JavascriptFunctionMessage =
  | ReadyMessage
  | LoadFailedMessage
  | LoadFunctionMessage
  | InvokeFunctionMessage
  | ResponseMessage
  | ErrorMessage;
