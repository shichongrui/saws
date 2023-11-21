const path = require("path");

/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  appDirectory: "./saws-example-website/app",
  assetsBuildDirectory: "./.saws/build/saws-example-website/public/build",
  serverBuildPath: "./saws-example-website/build/index.js",
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
