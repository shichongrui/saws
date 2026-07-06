"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectName = void 0;
const find_package_json_1 = __importDefault(require("find-package-json"));
const getProjectName = () => {
    const pkg = (0, find_package_json_1.default)(__dirname).next().value;
    return pkg.name;
};
exports.getProjectName = getProjectName;
