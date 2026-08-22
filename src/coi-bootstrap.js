// cross-origin isolation を初回アクセスから成立させるためのブートストラップ。
//
// Web 版のビルド (vite.config-pwa.mts) が index.html の <head> へインラインで埋め込む。
// Electron 版のビルドには含まれない。
//
// ドキュメントのレスポンスに COOP / COEP を足せるのは Service Worker だけだが、
// その Service Worker を登録するコードはドキュメントを受け取った後に動く。
// つまり初回アクセスのドキュメントには必ずヘッダーが付かない。
// crossOriginIsolated はドキュメント生成時に確定し以後変わらないため、
// isolated にするにはドキュメントを作り直す (再読み込みする) しかない。
// 詳細は specs/webapp-update.md の「cross-origin isolation」を参照。
//
// 再読み込みするかどうかが決まるまでアプリを起動させないよう、
// window.__shogihomeCOIReady に Promise を置く。src/renderer/index.ts がこれを待つ。
// 描画してから再読み込みすると、画面がちらついた上に描画の処理が無駄になる。
(function () {
  "use strict";

  // 再読み込みを試みたことを記録するキー。無限ループを防ぐ。
  var FLAG = "shogihome-coi-reload";
  // Service Worker が有効になるのを待つ上限。
  // 有効になるまでには事前キャッシュの完了を含むため、回線が細いと時間がかかる。
  // 待ちきれない場合は isolated でないまま起動し、次回のアクセスで有効になる。
  var TIMEOUT_MS = 10000;

  var resolveReady;
  // アプリの起動を待たせる Promise。同期的に置く必要がある。
  window.__shogihomeCOIReady = new Promise(function (resolve) {
    resolveReady = resolve;
  });

  // 再読み込みする場合は解決しない。アプリを起動させないまま画面を作り直す。
  function reload() {
    window.location.reload();
  }

  // 2 回目以降のアクセス。既に Service Worker がヘッダーを付けている。
  if (window.crossOriginIsolated || !("serviceWorker" in navigator)) {
    resolveReady();
    return;
  }

  // プライベートモードなどで sessionStorage が使えない場合は再読み込みしない。
  // 試行を記録できないとループになるため。
  var storage;
  try {
    storage = window.sessionStorage;
    if (storage.getItem(FLAG)) {
      // 再読み込みしても isolated にならなかった。諦めてそのまま起動する。
      resolveReady();
      return;
    }
  } catch {
    resolveReady();
    return;
  }

  var settled = false;
  function giveUp() {
    if (!settled) {
      settled = true;
      resolveReady();
    }
  }
  var timer = window.setTimeout(giveUp, TIMEOUT_MS);

  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then(function () {
      // 有効になれば、次のナビゲーションから Service Worker が応答する。
      // 初回のインストールは待機状態を経ずに activate するため、
      // 更新時の挙動 (registerType: "prompt") には影響しない。
      return navigator.serviceWorker.ready;
    })
    .then(function () {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      storage.setItem(FLAG, "1");
      reload();
    })
    .catch(function () {
      window.clearTimeout(timer);
      // 登録に失敗しても、アプリ自体は isolated でない状態で動作する。
      giveUp();
    });
})();
