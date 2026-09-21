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
import {
  precache,
  addRoute,
  createHandlerBoundToURL,
  getCacheKeyForURL,
  matchPrecache,
} from "workbox-precaching";
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
const precacheManifest = self.__WB_MANIFEST;
precache(precacheManifest);

// --- cross-origin isolation ---------------------------------------------
//
// SharedArrayBuffer (マルチスレッドの wasm が要求する) を使うには、ページが
// cross-origin isolated でなければならない。それには COOP と COEP の
// レスポンスヘッダーが要るが、GitHub Pages はヘッダーを設定できない。
// そこで Service Worker が返すナビゲーションのレスポンスに自分で足す。
//
// ヘッダーが要るのはドキュメントと**専用 Worker のスクリプト**である
// (isWorkerRequest を参照)。それ以外のサブリソースには要らない。COEP の
// require-corp が CORP を要求するのは**クロスオリジンの**サブリソースに対してで、
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
      //
      // エンジンのディレクトリも同様である。ライセンス表示から開くライセンス全文は
      // 同一オリジンの URL を window.open() したもの、つまり**ナビゲーション**として
      // 届く。ここで除外しないと、事前キャッシュしてあってもアプリ本体の index.html を
      // 返してしまい、全文の代わりにアプリがもう 1 つ開く。
      // 除外した後は、下の addRoute() が事前キャッシュから text/plain のまま返す。
      denylist: [/\/(?:prompt|monitor|layout-manager)\.html$/, /\/engines\//],
    },
  ),
);

// 専用 Worker のスクリプトにもヘッダーを付ける。
//
// isolated なドキュメントから Worker を起動するには、**Worker のスクリプトの
// レスポンス自体**が COEP を持っていなければならない。上のクロスオリジンの
// サブリソースの話とは別の要件で、同一オリジンでも免除されない。付けないと
// Worker の生成が失敗する (DevTools のレスポンスに
// cross-origin-embedder-policy: not-set と出る)。
//
// 開発サーバーは全てのレスポンスにヘッダーを付ける (vite.config-pwa.mts) ため、
// この不足は Service Worker が応答する本番でしか現れない。
function isWorkerRequest({ request }) {
  return request.destination === "worker" || request.destination === "sharedworker";
}

// 事前キャッシュした Worker (src/renderer/wasm-engine/engine.worker.ts)。
// 事前キャッシュのルートより先に登録する。Workbox はルートを登録順に照合するため、
// 後に回すとそちらが先に拾ってヘッダーが付かない。
registerRoute(
  (options) => isWorkerRequest(options) && !!getCacheKeyForURL(options.url.href),
  async ({ request }) =>
    withCrossOriginIsolation((await matchPrecache(request.url)) || (await fetch(request))),
);

// ナビゲーション以外を事前キャッシュから返す。
addRoute();

// --- assetBaseURL で外部に置かれたエンジンのアセット ----------------------
//
// マニフェストが assetBaseURL を宣言している場合、wasm と評価パラメータは
// engines/<dir>/ の外から配信される (specs/wasm-engine-abi.md の「6. (d)」)。
// **Workbox の正規表現ルートは、クロスオリジンの URL には先頭から一致しなければ
// 当たらない**ため、下のパスで書いたルートでは拾えず、実行時キャッシュが効かない。
//
// どこを指しているかはマニフェストが知っている。engine.json はライセンス表示のために
// 事前キャッシュされているので、**ビルド時に値を注入する仕組みを足さなくても
// Service Worker 自身が読める。** 配信物と食い違わないのが利点である。
//
// 読み込みは非同期だが、**ルートの照合は同期でなければならない**
// (Workbox の findMatchingRoute は Promise を真として扱うため、非同期のマッチャは
// 全ての要求に一致してしまう)。そこで照合は拡張子で行い、エンジンのものかどうかの
// 判定はハンドラで行って、対象外ならそのまま素通しする。
const ENGINE_MANIFEST_ENTRY = /(?:^|\/)engines\/[^/]+\/engine\.json$/;

// 同一オリジンの本来の置き場所。
const ENGINE_DIR_PATH = /\/engines\/[^?]+$/;

let engineAssetBasesPromise;

// 宣言された取得先の一覧。**オリジンではなく URL の前方一致で持つ。**
// assetBaseURL は同じオリジンの engines/ の外を指すこともあり、オリジンだけでは
// 絞り込みにならない (逆に、取得先と無関係なファイルまで拾ってしまう)。
function engineAssetBases() {
  engineAssetBasesPromise =
    engineAssetBasesPromise ||
    (async () => {
      const bases = [];
      for (const entry of precacheManifest || []) {
        const url = typeof entry === "string" ? entry : entry.url;
        if (!ENGINE_MANIFEST_ENTRY.test(url)) {
          continue;
        }
        try {
          const response = await matchPrecache(url);
          const manifest = response && (await response.json());
          if (manifest && typeof manifest.assetBaseURL === "string") {
            // マニフェストの検証で末尾は "/" に限られる (manifest.ts)。
            bases.push(new URL(manifest.assetBaseURL).href);
          }
        } catch {
          // 読めないマニフェストは飛ばす。キャッシュの対象から漏れるだけで、
          // 取得そのものは素通しで成立する。
        }
      }
      return bases;
    })();
  return engineAssetBasesPromise;
}

// エンジンの置き場所のものか。同一オリジンの engines/ の下か、
// マニフェストが宣言した取得先の下にあるもの。
async function isEngineAssetURL(url) {
  if (url.origin === self.location.origin && ENGINE_DIR_PATH.test(url.pathname)) {
    return true;
  }
  return (await engineAssetBases()).some((base) => url.href.startsWith(base));
}

// 本来の置き場所のパスか、assetBaseURL が担う拡張子か。
// **オリジンでは分けない。** assetBaseURL は同じオリジンを指すこともある。
function engineAssetMatcher(pathPattern, assetPattern) {
  return ({ url }) => pathPattern.test(url.pathname) || assetPattern.test(url.pathname);
}

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
const engineModuleStrategy = new StaleWhileRevalidate({
  cacheName: "shogihome-engine-modules",
  plugins: [
    new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }), // 90 日
    new CacheableResponsePlugin({ statuses: [0, 200] }),
  ],
});

// -pthread でビルドしたエンジンは、グルーコード自身を Worker として読み直す
// (Emscripten が new Worker(new URL("<module>.js", import.meta.url)) を出力する)。
// 同じ URL がモジュールとしても Worker としても要求されるため、destination を見て
// 必要なときだけヘッダーを付ける。キャッシュにはヘッダーを足す前のものが入る。
// グルーコードとマニフェストは常に engines/<dir>/ から配信される
// (assetBaseURL の対象は JS 以外のアセットだけ)。その外で拾うのは .wasm のみ。
registerRoute(
  engineAssetMatcher(/\/engines\/[^?]+\.(?:json|js|wasm)$/, /\.wasm$/),
  async (options) => {
    if (!(await isEngineAssetURL(options.url))) {
      return fetch(options.request);
    }
    const response = await engineModuleStrategy.handle(options);
    return isWorkerRequest(options) ? withCrossOriginIsolation(response) : response;
  },
);

// エンジンの評価パラメータや定跡。事前キャッシュすると初回アクセスの
// 負担が大きすぎるため、実際に使われたものだけを保持する。
// 新しい拡張子を使う場合はここに追加する。
// NOTE: これらは事前キャッシュと違って revision を持たないため、
// ファイル名に内容のハッシュを含めること。同じ URL のまま差し替えると
// 古いファイルが返り続ける。specs/wasm-engine.md の「キャッシュ」を参照。
const engineDataStrategy = new CacheFirst({
  cacheName: "shogihome-engine-data",
  plugins: [
    new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 }), // 90 日
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new RangeRequestsPlugin(),
  ],
});

registerRoute(
  engineAssetMatcher(/\/engines\/[^?]+\.(?:data|bin|nnue)$/, /\.(?:data|bin|nnue)$/),
  async (options) => {
    if (!(await isEngineAssetURL(options.url))) {
      return fetch(options.request);
    }
    return engineDataStrategy.handle(options);
  },
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
