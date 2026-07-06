"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitignoreTemplate = void 0;
const gitignoreTemplate = () => `node_modules
.saws/postgres
.saws/cognito
.saws/saws-*-local-output.json
.saws/cache
.saws/build
.saws/.secrets
.DS_Store`;
exports.gitignoreTemplate = gitignoreTemplate;
