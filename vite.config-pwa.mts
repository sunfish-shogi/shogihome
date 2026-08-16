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
      devOptions: {
        // 開発サーバーでは既定で Service Worker を無効にする。
        // 古いキャッシュが返ることによる混乱を避けるため。
        // PWA の挙動を確認したい場合は PWA_DEV=1 を指定する。
        enabled: process.env.PWA_DEV === "1",
      },
      workbox: {
        // 画面の描画に必ず必要となるものを事前キャッシュの対象とする。
        // 盤・駒の画像は種類が多く合計 4MB 近くあるため、ここには含めず実行時にキャッシュする。
        globPatterns: [
          "**/*.{js,css,html,webmanifest}",
          // オフラインでも対局できるように、組み込みエンジンの wasm とマニフェストも
          // 事前キャッシュする。評価パラメータなどの大きなファイルは対象外で、
          // 下の runtimeCaching で実行時にキャッシュする。
          "engines/**/*.{wasm,json}",
          "favicon*.png",
          "icon/**/*.svg",
          "arrow/**/*.svg",
          "board/**/*.svg",
          "stand/**/*.png",
          "sound/**/*.mp3",
        ],
        // 実際に使用された盤・駒の画像だけをキャッシュする。
        // これらの URL にはハッシュが含まれないため、キャッシュを返した後に
        // 再取得して次回以降に反映する。
        runtimeCaching: [
          {
            urlPattern: /\/(?:board|piece)\/[^?]+\.png$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "shogihome-board-images",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 日
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // エンジンの評価パラメータや定跡。事前キャッシュすると初回アクセスの
          // 負担が大きすぎるため、実際に使われたものだけを保持する。
          // 新しい拡張子を使う場合はここに追加する。
          // NOTE: これらは事前キャッシュと違って revision を持たないため、
          // ファイル名に内容のハッシュを含めること。同じ URL のまま差し替えると
          // 古いファイルが返り続ける。specs/wasm-engine.md の「キャッシュ」を参照。
          {
            urlPattern: /\/engines\/[^?]+\.(?:data|bin|nnue)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "shogihome-engine-data",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 日
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
        // Electron 専用のページを index.html にフォールバックさせない。
        navigateFallbackDenylist: [/\/(?:prompt|monitor|layout-manager)\.html$/],
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
