export type BookMove = {
  usi: string; // 定跡手
  usi2?: string; // 相手の応手
  score?: number; // 評価値
  depth?: number; // 探索深さ
  count?: number; // 出現回数
  comments: string; // コメント
};
