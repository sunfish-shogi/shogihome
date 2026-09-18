/// <reference types="vitest" />
import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { htmlTemplate } from "./plugins/html_template.ts";
import { builtinEngines } from "./plugins/builtin_engines.ts";
import { buildProfile } from "./plugins/build_profile.ts";

const appVersion = process.env.npm_package_version || "0.0.0";
const buildEnv = process.env.CI === "true" ? "ci" : "local";
const buildNumber =
  process.env.BUILD_NUMBER ||
  `${Date.now()}.${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
const buildVersion = process.env.BUILD_VERSION || `${buildEnv}-${buildNumber}`;

export default defineConfig({
  resolve: {
    alias: [
      // "@" は前方一致で照合されるため、より長い別名を先に置く。
      // ビルド時のプラグインを単体テストから読むために使う。
      { find: "@plugins", replacement: "/plugins" },
      { find: "@", replacement: "/src" },
    ],
  },
  plugins: [
    vue(),
    // 組み込みエンジンの一覧は public/engines/ とビルドプロファイルの
    // engines.dirs からビルド時に決める。Electron 版と単体テストでも同じ仮想モジュールを
    // 解決する必要があるため、Web 版だけの設定 (vite.config-pwa.mts) ではなくここに置く。
    builtinEngines(),
    // 特別版のビルドの設定 (SHOGIHOME_BUILD_PROFILE)。
    // 指定が無ければ既定のプロファイルになり、通常のビルドの挙動は変わらない。
    buildProfile(),
    htmlTemplate({
      APP_VERSION: appVersion,
      BUILD_VERSION: buildVersion,
    }),
  ],
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        prompt: resolve(import.meta.dirname, "prompt.html"),
        monitor: resolve(import.meta.dirname, "monitor.html"),
        "layout-manager": resolve(import.meta.dirname, "layout-manager.html"),
      },
    },
    outDir: resolve(import.meta.dirname, "dist"),
    chunkSizeWarningLimit: 5000000,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    dir: "./src/tests",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      exclude: [
        "docs",
        "plugins",
        "scripts",
        "dist",
        "dev-dist",

        // テストコード
        "src/tests",

        // 設定ファイル
        "vite.config.mts",
        "vite.config-pwa.mts",
        "webpack.config.mjs",
        ".*.*",
        "**/*.d.ts",
        "**/*.vue",

        // 定義/設定
        "src/common/ipc/**/*.ts",
        "src/common/control/**/*.ts",
        "src/common/i18n/**/*.ts",
        "src/command/common/preload.ts",

        // IPC
        "src/renderer/ipc/api.ts",
        "src/renderer/ipc/bridge.ts",
        "src/renderer/ipc/preload.ts",
        "src/renderer/ipc/web.ts",
        "src/renderer/ipc/setup.ts",

        // UI/Window
        "src/background/index.ts",
        "src/background/window/ipc.ts",
        "src/background/window/main.ts",
        "src/background/window/menu.ts",
        "src/background/window/prompt.ts",
        "src/background/window/layout.ts",
        "src/renderer/index.ts",
        "src/renderer/assets/icons.ts",
        "src/renderer/devices/audio.ts",
        "src/renderer/devices/hotkey.ts",

        // コマンド
        "src/command/usi-csa-bridge/index.ts",
      ],
    },
  },
});
