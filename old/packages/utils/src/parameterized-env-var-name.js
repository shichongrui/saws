"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parameterizedEnvVarName = void 0;
const parameterizedEnvVarName = (name, variable) => `${name.replace(/[^a-zA-Z\d]/g, "_").toUpperCase()}_${variable}`;
exports.parameterizedEnvVarName = parameterizedEnvVarName;
