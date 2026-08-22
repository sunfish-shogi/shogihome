/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import base from "./vite.config.mjs";
import { VitePWA } from "vite-plugin-pwa";

// cross-origin isolation のブートストラップを index.html の <head> へ埋め込む。
//
// アプリ本体を読み込む前に再読み込みの要否を決めたいので、外部ファイルではなく
// インラインにする。Web 版のビルドでしか読まれない設定ファイルに置くことで、
// Electron 版には混入しない。
function injectCrossOriginIsolationBootstrap(): Plugin {
  return {
    name: "shogihome-coi-bootstrap",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const file = path.resolve(import.meta.dirname, "src/coi-bootstrap.js");
        return {
          html,
          tags: [
            {
              tag: "script",
              injectTo: "head-prepend",
              children: fs.readFileSync(file, "utf8"),
            },
          ],
        };
      },
    },
  };
}

export default defineConfig({
  ...base,
  plugins: [
    ...(base.plugins || []),
    injectCrossOriginIsolationBootstrap(),
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
        // アプリの実体 (JS / CSS / HTML) だけを事前キャッシュの対象とする。
        //
        // 初回アクセスでは、事前キャッシュが完了して Service Worker が有効になるまで
        // 画面を描画しない (coi-bootstrap.js)。ここに積むほど最初の表示が遅れるので、
        // オフラインで動くために本当に必要なものだけに絞る。
        //
        // アイコンや効果音などの静的ファイルは実行時キャッシュへ回す。
        // これらは描画時にどのみち取得されるため、転送量は変わらず、
        // 事前キャッシュの完了を待たせなくなるぶんだけ早くなる。
        // 盤・駒の画像も同様に実行時キャッシュで扱う (種類が多く合計 4MB 近いため)。
        globPatterns: ["**/*.{js,css,html,webmanifest}", "favicon*.png"],
        // エンジンの成果物は事前キャッシュしない。
        //
        // 将来もっと大きなエンジンが載る可能性があり、事前キャッシュに含めると
        // エンジンを使わない利用者にも転送コストがかかる。加えて初回アクセスは
        // 事前キャッシュの完了を待ってから再読み込みするため (coi-bootstrap.js)、
        // ここが重いほど最初の表示が遅れる。
        //
        // 実際に使われたものだけを sw.js の実行時キャッシュで保持する。
        // したがって **エンジンの利用はオンラインを前提とする。**
        //
        // globIgnores が必要なのは、上の "**/*.{js,...}" が Emscripten の
        // グルーコード (engines/<dir>/<module>.js) を拾ってしまうため。
        globIgnores: ["engines/**"],
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
