const TerserPlugin = require("terser-webpack-plugin");
const webpack = require("webpack");
const customPlugins = require("./plugins/webpack");
const path = require("path");

const optimization = {
  minimize: true,
  minimizer: [
    new TerserPlugin({
      terserOptions: {
        format: {
          comments: false,
        },
      },
      extractComments: false,
    }),
  ],
};

const moduleForCJS = {
  rules: [
    {
      test: /\.ts$/,
      use: "ts-loader",
    },
  ],
};

const resolveForCJS = {
  alias: {
    "@": path.resolve(__dirname, "src"),
  },
  extensions: [".ts", ".js"],
  extensionAlias: {
    ".js": [".ts", ".js", ".cjs"],
  },
};

module.exports = [
  {
    name: "background",
    mode: "production",
    entry: "./dist/src/background/index.js",
    target: "electron-main",
    output: {
      filename: "background.js",
      path: __dirname + "/dist/packed",
    },
    externals: ["electron"],
    experiments: {
      outputModule: true,
    },
    optimization,
  },
  {
    name: "preload",
    mode: "production",
    entry: "./src/renderer/ipc/preload.ts",
    target: "electron-preload",
    output: {
      filename: "preload.js",
      path: __dirname + "/dist/packed",
      libraryTarget: "commonjs2",
    },
    module: moduleForCJS,
    resolve: resolveForCJS,
    externals: ["electron"],
    optimization,
  },
  {
    name: "command:usi-csa-bridge",
    mode: "production",
    entry: "./src/command/usi-csa-bridge/index.ts",
    target: "node",
    output: {
      filename: "index.js",
      path: __dirname + "/dist/command/usi-csa-bridge",
      libraryTarget: "commonjs2",
    },
    module: moduleForCJS,
    resolve: resolveForCJS,
    externals: /^[^.@].*$/,
    optimization,
    plugins: [
      new webpack.NormalModuleReplacementPlugin(/^.*-electron\.js$/, (resource) => {
        const newResource = resource.request.replace(/^(.*)-electron\.js$/, "$1-cmd.js");
        resource.request = newResource;
      }),
      new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
      customPlugins.AddExecPermission,
    ],
  },
];
