"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onProcessExit = void 0;
let registeredFunctions = [];
const onProcessExit = (callback) => {
    registeredFunctions.push(callback);
};
exports.onProcessExit = onProcessExit;
process.on('exit', () => {
    registeredFunctions.forEach(f => f());
    registeredFunctions = [];
    process.exit();
});
process.on('SIGINT', () => {
    registeredFunctions.forEach(f => f());
    registeredFunctions = [];
    process.exit();
});
