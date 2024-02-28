export const sawsJsTemplate = ({ name }: { name: string}) => `const { ServiceDefinition } = require('@shichongrui/saws-core')

module.exports = new ServiceDefinition({
  name: '${name}',
  dependencies: []
})
`