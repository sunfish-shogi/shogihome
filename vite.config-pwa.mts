/// <reference types="vitest" />
import { defineConfig } from "vite";
import base from "./vite.config.mjs";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  ...base,
  plugins: [
    ...(base.plugins || []),
    VitePWA({
      // 更新版は自動で適用せず、アプリ内で通知してユーザーの操作で再読み込みする。
      // 対局中や検討中に予期せず画面が再読み込みされるのを防ぐため。
      registerType: "prompt",
      // Service Worker は src/sw.js に手書きしたものを使う。
      // ナビゲーションのレスポンスへ cross-origin isolation のヘッダーを足すため、
      // 自動生成 (generateSW) では足りない。キャッシュの挙動は sw.js 側に移してある。
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      devOptions: {
        // 開発サーバーでは既定で Service Worker を無効にする。
        // 古いキャッシュが返ることによる混乱を避けるため。
        // PWA の挙動を確認したい場合は PWA_DEV=1 を指定する。
        enabled: process.env.PWA_DEV === "1",
        // injectManifest では import を解決するためモジュールとして読み込む。
        type: "module",
      },
      injectManifest: {
        // 画面の描画に必ず必要となるものを事前キャッシュの対象とする。
        // 盤・駒の画像は種類が多く合計 4MB 近くあるため、ここには含めず実行時にキャッシュする。
        globPatterns: [
          "**/*.{js,css,html,webmanifest}",
          // オフラインでも対局できるように、組み込みエンジンの wasm とマニフェストも
          // 事前キャッシュする。評価パラメータなどの大きなファイルは対象外で、
          // sw.js の実行時キャッシュで保持する。
          "engines/**/*.{wasm,json}",
          "favicon*.png",
          "icon/**/*.svg",
          "arrow/**/*.svg",
          "board/**/*.svg",
          "stand/**/*.png",
          "sound/**/*.mp3",
        ],
        // 実行時キャッシュとナビゲーションの扱いは src/sw.js に書いてある。
      },
      manifest: {
        name: "ShogiHome",
        short_name: "ShogiHome",
        description: "将棋の対局や棋譜の編集ができるアプリ",
        background_color: "#2f4f4f",
        theme_color: "#5f8f5f",
        display: "standalone",
        lang: "ja",
        icons: [
          { sizes: "192x192", src: "favicon-192.png", type: "image/png", purpose: "any" },
          { sizes: "512x512", src: "favicon.png", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
});
