let registeredFunctions: Array<() => void> = [];

export const onProcessExit = (callback: () => void) => {
  registeredFunctions.push(callback);
}

process.on('exit', () => {
  registeredFunctions.forEach(f => f());
  registeredFunctions = [];
  process.exit()
});

process.on('SIGINT', () => {
  registeredFunctions.forEach(f => f());
  registeredFunctions = [];
  process.exit()
})