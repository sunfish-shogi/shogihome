/// <reference types="vitest" />
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import base from "./vite.config.mjs";
import { VitePWA } from "vite-plugin-pwa";

// ライセンス表示に必要なファイルを事前キャッシュの一覧へ足す。
//
// エンジンの成果物は事前キャッシュしない方針だが (下の globIgnores を参照)、
// ライセンスの提示は配布物だけで完結していなければならず、エンジンを一度も
// 使っていない利用者がオフラインで開いても出せる必要がある。対象は
// engine.json と、そこで宣言されたライセンス全文だけで、合計でも数 KB に収まる。
//
// **どのファイルが必要かはマニフェストが知っている。** 拡張子や名前を決め打ちせず、
// licenses[].file の宣言をそのまま読む (specs/wasm-engine-abi.md の「9. ライセンス」)。
// マニフェストの本検証は適合性テストが行うため、ここでは読めない・宣言が無いものを
// 飛ばすだけにして、ビルドを止めない。
function engineLicenseManifestEntries(): { url: string; revision: string }[] {
  const enginesDir = path.resolve(import.meta.dirname, "public/engines");
  if (!fs.existsSync(enginesDir)) {
    return [];
  }
  const entries: { url: string; revision: string }[] = [];
  const add = (file: string) => {
    const fullPath = path.join(enginesDir, file);
    if (!fs.existsSync(fullPath)) {
      return;
    }
    entries.push({
      url: `engines/${file}`,
      // 事前キャッシュは URL と revision の組で更新を判断する。
      // エンジンの成果物はファイル名にハッシュを持たないため、内容から作る。
      revision: crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex"),
    });
  };
  for (const entry of fs.readdirSync(enginesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(enginesDir, entry.name, "engine.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    add(`${entry.name}/engine.json`);
    for (const license of manifest.licenses || []) {
      // 上位ディレクトリを参照するパスは適合性テストが弾く。ここでは無視する。
      if (typeof license?.file === "string" && !license.file.split("/").includes("..")) {
        add(`${entry.name}/${license.file}`);
      }
    }
  }
  return entries;
}

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
  server: {
    ...base.server,
    // 開発サーバーでは Service Worker を既定で無効にしているため
    // (devOptions.enabled)、COOP / COEP を付ける主体が居ない。
    // ここで直接付けて cross-origin isolated にする。
    //
    // 付けないと -pthread でビルドしたエンジンが SharedArrayBuffer を
    // 共有できず、"SharedArrayBuffer transfer requires self.crossOriginIsolated"
    // で起動に失敗する。本番では Service Worker が同じヘッダーを付ける。
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
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
        // 例外はライセンス表示に要るものだけ。上の関数を参照。
        additionalManifestEntries: engineLicenseManifestEntries(),
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
