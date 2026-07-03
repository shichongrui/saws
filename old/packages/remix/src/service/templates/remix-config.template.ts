export const remixConfig = ({ name }: { name: string }) => /* js */`const path = require("path");

/** @type {import('@remix-run/dev').AppConfig} */
module.exports = {
  appDirectory: "./${name}/app",
  assetsBuildDirectory: "./.saws/build/${name}/public/build",
  serverBuildPath: "./${name}/build/index.js",
  serverModuleFormat: "cjs",
  cacheDirectory: "./.saws/.remix-cache",
  publicPath: '/public/build/',
};
`