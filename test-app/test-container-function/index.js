module.exports.handler = (event, context, callback) => {
  callback(null, 'It worked!' + event);
}