"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sawsJsTemplate = void 0;
const sawsJsTemplate = ({ name }) => `const { ServiceDefinition } = require('@saws/core')

module.exports = new ServiceDefinition({
  name: '${name}',
  dependencies: []
})
`;
exports.sawsJsTemplate = sawsJsTemplate;
