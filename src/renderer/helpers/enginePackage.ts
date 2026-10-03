import { mergeUSIEngine, USIEngine } from "@/common/settings/usi";

// ダウンロード画面 (EngineDownloadDialog) でインストールした後に、エンジン管理画面の一覧を
// どう変えるかを決める。
//
// **判定には編集中の一覧だけを使う。** エンジン管理画面は「保存して閉じる」で編集中の一覧を
// 丸ごと保存するため、保存済みの一覧にだけ残っている項目は、保存すれば消える。
// 例えば項目を削除して保存せずにダウンロード画面を開いた場合、保存済みの一覧に項目が
// 残っていても、再ダウンロードしたエンジンは一覧に加えなければならない。
// (保存済みの一覧はアンインストールの可否の判定にだけ使う。)

export type EngineListChange =
  // 一覧に新しい項目を加える。
  | { type: "add" }
  // 古い版を参照している項目の path を新しい版に向ける。
  | { type: "update"; oldEnginePaths: string[] }
  // 一覧は変えない (同じ版が既に一覧にあり、ファイルの修復だけを行った場合)。
  | { type: "none" };

export function planEngineListChange(
  // 編集中の一覧の各項目の path。
  editingEnginePaths: string[],
  // インストールしたパッケージの path (engine.json)。
  newEnginePath: string,
  // 同じ id の他の版の path。
  otherVersionEnginePaths: string[],
): EngineListChange {
  const editing = new Set(editingEnginePaths);
  const oldEnginePaths = otherVersionEnginePaths.filter((p) => editing.has(p));
  if (oldEnginePaths.length) {
    return { type: "update", oldEnginePaths };
  }
  if (editing.has(newEnginePath)) {
    return { type: "none" };
  }
  return { type: "add" };
}

// 更新した版のエンジンを、一覧の項目に反映したものを返す。
//
// オプションの定義・既定の名前・作者・path はインストール時に新しい版から取得したもの (fresh) を
// 使う。古い版の定義を残すと、削除されたオプションを送り続け、追加されたオプションが使えない。
// 一方、URI・表示名・利用者が変えたオプションの値 (型が同じもの)・タグなどは項目 (local) から
// 引き継ぐ (mergeUSIEngine)。URI を変えないのは、対局や検討の設定が URI でエンジンを参照するため。
export function mergeUpdatedEngine(local: USIEngine, fresh: USIEngine): USIEngine {
  const engine = JSON.parse(JSON.stringify(fresh)) as USIEngine;
  mergeUSIEngine(engine, local);
  return engine;
}
