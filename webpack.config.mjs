import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import { AddExecPermission } from "./plugins/webpack.mjs";
import path from "path";

const resolveForCJS = {
  alias: {
    "@": path.resolve(import.meta.dirname, "src"),
  },
  extensions: [".ts", ".js"],
  extensionAlias: {
    ".js": [".ts", ".js", ".cjs"],
  },
};

// `--env dev` is used by `electron:serve` to skip minification and type-checking
// (already covered by `vue-tsc`/lint) so the preload bundle rebuilds quickly.
export default (env = {}) => {
  const dev = !!env.dev;

  // In dev mode `minimize` is false, so the minimizer is never consulted and
  // TerserPlugin does not run — no need to branch the minimizer array itself.
  const optimization = {
    minimize: !dev,
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
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: dev,
            onlyCompileBundledFiles: true,
            compilerOptions: { rootDir: "./src" },
          },
        },
      },
    ],
  };

  const cache = dev ? { type: "filesystem" } : undefined;

  return [
    {
      name: "background",
      mode: "production",
      entry: "./dist/src/background/index.js",
      target: "electron-main",
      output: {
        filename: "background.js",
        path: import.meta.dirname + "/dist/packed",
      },
      externals: ["electron"],
      experiments: {
        outputModule: true,
      },
      optimization,
      cache,
    },
    {
      name: "preload",
      mode: "production",
      entry: "./src/renderer/ipc/preload.ts",
      target: "electron-preload",
      output: {
        filename: "preload.js",
        path: import.meta.dirname + "/dist/packed",
        libraryTarget: "commonjs2",
      },
      module: moduleForCJS,
      resolve: resolveForCJS,
      externals: ["electron"],
      optimization,
      cache,
    },
    {
      name: "command:usi-csa-bridge",
      mode: "production",
      entry: "./src/command/usi-csa-bridge/index.ts",
      target: "node",
      output: {
        filename: "index.js",
        path: import.meta.dirname + "/dist/command/usi-csa-bridge",
        libraryTarget: "commonjs2",
      },
      module: moduleForCJS,
      resolve: resolveForCJS,
      externals: /^[^.@].*$/,
      optimization,
      cache,
      plugins: [
        new webpack.NormalModuleReplacementPlugin(/^.*-electron\.js$/, (resource) => {
          const newResource = resource.request.replace(/^(.*)-electron\.js$/, "$1-cmd.js");
          resource.request = newResource;
        }),
        new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
        AddExecPermission,
      ],
    },
  ];
};
