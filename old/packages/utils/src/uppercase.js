"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uppercase = void 0;
const uppercase = (text) => {
    const [first, ...rest] = text;
    return first.toUpperCase() + rest.join("");
};
exports.uppercase = uppercase;
