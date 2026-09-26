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
        // This entry is already compiled to JavaScript by `tsc`, so webpack's built-in
        // TypeScript support is unnecessary. Leaving it on "auto" (the default since
        // webpack 5.109) turns it on for this config because no ts-loader is registered
        // here, which in turn enables `resolve.tsconfig` and makes the resolver read the
        // `tsconfig.json` files bundled in dependencies. jimp ships one that extends
        // `@jimp/config-typescript`, a devDependency that is not installed for consumers,
        // and the unresolvable `extends` breaks every module resolution from jimp.
        typescript: false,
      },
      optimization,
      cache,
    },
    {
      // WebAssembly エンジンを動かす utility プロセスのエントリ (src/background/usi/wasm/host.ts)。
      // background と同じく tsc の出力をまとめる。
      name: "wasm-engine-host",
      mode: "production",
      entry: "./dist/src/background/usi/wasm/host.js",
      target: "electron-main",
      output: {
        filename: "wasm-engine-host.js",
        path: import.meta.dirname + "/dist/packed",
      },
      externals: ["electron"],
      experiments: {
        outputModule: true,
        typescript: false,
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
      // 先頭が "." でも "@" でもない request は npm のパッケージとみなして外部化する。
      //
      // **仮想モジュール (virtual:) は外部化しない。** 外部化してしまうと、解決先の
      // 無い仮想モジュールが npm のパッケージとして扱われ、ビルドは成功するのに
      // 実行時に MODULE_NOT_FOUND で落ちる成果物ができる。除外しておけば、下の
      // NormalModuleReplacementPlugin で差し替え忘れた仮想モジュールは
      // UnhandledSchemeError としてビルド時に露見する。
      //
      // なお externals の判定は元の request で行われるため、この除外なしでは
      // NormalModuleReplacementPlugin も resolve.alias も効かない。
      externals: /^(?!virtual:)[^.@].*$/,
      optimization,
      cache,
      plugins: [
        // Vite のプラグインが作る仮想モジュール (plugins/builtin_engines.ts) は
        // webpack では解決できないため、CLI 用の実装へ差し替える。
        new webpack.NormalModuleReplacementPlugin(
          /^virtual:shogihome\/builtin-engines$/,
          path.resolve(import.meta.dirname, "src/command/common/builtin-engines.ts"),
        ),
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
