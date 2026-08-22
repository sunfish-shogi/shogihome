// Web 版の Service Worker。vite-plugin-pwa の injectManifest モードでビルドされる。
//
// キャッシュの内容と更新の流れは specs/webapp-update.md を参照。
// generateSW で自動生成していたものを手書きに移したのは、ナビゲーションのレスポンスへ
// cross-origin isolation のヘッダーを足すためで、キャッシュの挙動は元のままである。
//
// renderer / background / common のいずれにも属さないため src/ の直下に置く。
// TypeScript ではなく JavaScript なのは、Service Worker のグローバルの型
// (ServiceWorkerGlobalScope) が DOM の型と衝突し、tsconfig を分けないと
// 型検査が通らないため。
import { precache, addRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { RangeRequestsPlugin } from "workbox-range-requests";

// ビルド時に事前キャッシュの一覧が差し込まれる。
//
// precacheAndRoute() ではなく precache() と addRoute() に分けているのは、
// ナビゲーションのルートを先に登録するためである。Workbox はルートを登録順に
// 照合するので、先に事前キャッシュのルートを足すとそちらがナビゲーションを
// 拾ってしまい、下の cross-origin isolation のヘッダーが付かない。
// なお createHandlerBoundToURL() は一覧の登録後でなければ使えない。
precache(self.__WB_MANIFEST);

// --- cross-origin isolation ---------------------------------------------
//
// SharedArrayBuffer (マルチスレッドの wasm が要求する) を使うには、ページが
// cross-origin isolated でなければならない。それには COOP と COEP の
// レスポンスヘッダーが要るが、GitHub Pages はヘッダーを設定できない。
// そこで Service Worker が返すナビゲーションのレスポンスに自分で足す。
//
// ヘッダーが要るのはドキュメントだけである。COEP の require-corp が
// CORP を要求するのは**クロスオリジンの**サブリソースに対してで、
// ShogiHome の Web 版は外部のサブリソースを一切読み込まないため影響がない。
//
// 初回アクセスは Service Worker の制御下に無いので isolated にならない。
// 次回以降のナビゲーションから有効になる。現時点でこれを必要とするエンジンは
// 無いため、そのために再読み込みを強制することはしない。
function withCrossOriginIsolation(response) {
  // opaque なレスポンス (status 0) は本文を読めないので触らない。
  if (!response || response.status === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ナビゲーションは事前キャッシュした index.html で応答する。
const navigationHandler = createHandlerBoundToURL("index.html");
registerRoute(
  new NavigationRoute(
    async (options) => withCrossOriginIsolation(await navigationHandler(options)),
    {
      // Electron 専用のページは index.html にフォールバックさせない。
      denylist: [/\/(?:prompt|monitor|layout-manager)\.html$/],
    },
  ),
);

// ナビゲーション以外を事前キャッシュから返す。
addRoute();

// --- 実行時キャッシュ ----------------------------------------------------

// 実際に使用された盤・駒の画像だけをキャッシュする。
// これらの URL にはハッシュが含まれないため、キャッシュを返した後に
// 再取得して次回以降に反映する。
registerRoute(
  /\/(?:board|piece)\/[^?]+\.png$/,
  new StaleWhileRevalidate({
    cacheName: "shogihome-board-images",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }), // 30 日
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// UI のアイコン・矢印・盤の枠線・駒台・効果音。
//
// 事前キャッシュに含めると、初回アクセスで画面が出るまでの待ち時間がそのぶん延びる
// (coi-bootstrap.js の再読み込みは事前キャッシュの完了を待つ)。これらは描画時に
// どのみち取得されるので、実行時にキャッシュすれば転送量は変わらない。
//
// 事前キャッシュと違って revision を持たないため StaleWhileRevalidate にする。
// URL にハッシュを含まないので、返した後に取り直して次回以降へ反映する。
registerRoute(
  /\/(?:icon|arrow|board)\/[^?]+\.svg$|\/stand\/[^?]+\.png$|\/sound\/[^?]+\.mp3$/,
  new StaleWhileRevalidate({
    cacheName: "shogihome-ui-assets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 }), // 90 日
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// エンジンの成果物 (マニフェスト・グルーコード・wasm)。
// 事前キャッシュしないので、初めて使うときはネットワークから取得する
// (**エンジンの利用はオンラインが前提**)。一度使えば次回以降は速い。
//
// 事前キャッシュと違って revision を持たないため StaleWhileRevalidate にして、
// 返した後に取り直す。ファイル名が変わらないまま中身が差し替わっても、
// 次回の起動には新しいものが使われる。
registerRoute(
  /\/engines\/[^?]+\.(?:json|js|wasm)$/,
  new StaleWhileRevalidate({
    cacheName: "shogihome-engine-modules",
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }), // 90 日
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// エンジンの評価パラメータや定跡。事前キャッシュすると初回アクセスの
// 負担が大きすぎるため、実際に使われたものだけを保持する。
// 新しい拡張子を使う場合はここに追加する。
// NOTE: これらは事前キャッシュと違って revision を持たないため、
// ファイル名に内容のハッシュを含めること。同じ URL のまま差し替えると
// 古いファイルが返り続ける。specs/wasm-engine.md の「キャッシュ」を参照。
registerRoute(
  /\/engines\/[^?]+\.(?:data|bin|nnue)$/,
  new CacheFirst({
    cacheName: "shogihome-engine-data",
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 }), // 90 日
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new RangeRequestsPlugin(),
    ],
  }),
);

// --- 更新 ----------------------------------------------------------------

// 更新版は自動で適用せず、アプリ内で通知してユーザーの操作で再読み込みする
// (registerType: "prompt")。対局中や検討中に予期せず画面が再読み込みされるのを防ぐため。
// src/renderer/webapp/update.ts が待機中の Service Worker へこれを送る。
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
