"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.action = exports.loader = void 0;
const node_1 = require("@remix-run/node");
const file_storage_server_1 = require("../utils/file-storage.server");
const react_1 = require("@remix-run/react");
const react_2 = require("@chakra-ui/react");
const multipartFormData_server_1 = require("../utils/multipartFormData.server");
const path_1 = __importDefault(require("path"));
const node_fs_1 = __importDefault(require("node:fs"));
const loader = async () => {
    const allFiles = await file_storage_server_1.files.listFiles("");
    return (0, node_1.json)({ files: allFiles });
};
exports.loader = loader;
const action = async ({ request }) => {
    const formData = await (0, multipartFormData_server_1.multipartFormData)(request);
    const filePath = formData.get('file')?.toString();
    if (filePath == null)
        throw new Response('Missing file', { status: 400 });
    const parsed = path_1.default.parse(filePath);
    await file_storage_server_1.files.writeFile(parsed.base, node_fs_1.default.readFileSync(filePath));
    return (0, node_1.json)({ uploaded: true });
};
exports.action = action;
exports.default = () => {
    const data = (0, react_1.useLoaderData)();
    return (<div>
      <react_1.Form method='post' encType="multipart/form-data">
        <label>
          Upload File
          <input type='file' name='file'/>
        </label>
        <react_2.Button type='submit'>Upload</react_2.Button>
      </react_1.Form>
      <ul>
        {data.files?.map((file) => (<li>{file.Key}</li>))}
      </ul>
    </div>);
};
