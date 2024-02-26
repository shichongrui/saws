module.exports.handler = (event, context) => {
  console.log(event)
  return {
    handled: true,
  }
}