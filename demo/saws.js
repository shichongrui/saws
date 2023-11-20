const { ServiceDefinition } = require('@shichongrui/saws')
const { PostgresService } = require('@shichongrui/saws')

const serviceDefinition = new ServiceDefinition({
  name: 'saws-example',
  dependencies: [
    new PostgresService({
      name: 'saws-example-db'
    })
  ]
})

module.exports = serviceDefinition