import { Move } from "tsshogi";

export type SearchInfo = {
  depth?: number; // 探索深さ
  nodes?: number; // 探索ノード数
  score?: number; // 先手から見た評価値
  mate?: number; // 先手勝ちの場合に正の値、後手勝ちの場合に負の値
  pv?: Move[];
};

export type RecordCustomData = {
  playerSearchInfo?: SearchInfo;
  opponentSearchInfo?: SearchInfo;
  researchInfo?: SearchInfo;
  researchInfo2?: SearchInfo;
  researchInfo3?: SearchInfo;
  researchInfo4?: SearchInfo;
};

export enum SearchInfoSenderType {
  PLAYER,
  OPPONENT,
  RESEARCHER,
  RESEARCHER_2,
  RESEARCHER_3,
  RESEARCHER_4,
}
