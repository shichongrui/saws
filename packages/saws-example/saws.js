const { ServiceDefinition } = require('@shichongrui/saws-core')
const { PostgresService } = require('@shichongrui/saws-postgres/dist/PostgresService')

const serviceDefinition = new ServiceDefinition({
  name: 'saws-example',
  dependencies: [
    new PostgresService({
      name: 'saws-example-db'
    })
  ]
})

module.exports = serviceDefinition