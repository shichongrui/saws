const path = require("path");

/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  appDirectory: "./demo-remix/app",
  assetsBuildDirectory: "./.saws/build/demo-remix/public/build",
  serverBuildPath: "./demo-remix/build/index.js",
  serverModuleFormat: "cjs",
  cacheDirectory: "./.saws/.remix-cache",
  publicPath: '/public/build/',
  browserNodeBuiltinsPolyfill: {
    modules: {
      url: true,
      buffer: true,
      events: true,
    },
  },
};
