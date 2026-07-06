"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCache = void 0;
exports.default = createEmotionCache;
// createEmotionCache.ts
const cache_1 = __importDefault(require("@emotion/cache"));
exports.defaultCache = createEmotionCache();
function createEmotionCache() {
    return (0, cache_1.default)({ key: 'cha' });
}
