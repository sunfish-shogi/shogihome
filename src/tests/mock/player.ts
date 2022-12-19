import { parseSFENPV } from "@/ipc/usi";
import { Player, SearchHandler } from "@/players/player";
import { TimeLimitSetting } from "@/settings/game";
import { PlayerSetting } from "@/settings/player";
import { ImmutableRecord, Move } from "@/shogi";

export type MoveWithOption = {
  sfen: string;
  info?: {
    score?: number; // 先手から見た評価値
    mate?: number; // 先手勝ちの場合に正の値、後手勝ちの場合に負の値
    pv?: string[];
  };
};

export function createMockPlayer(moves: { [usi: string]: MoveWithOption }) {
  return {
    isEngine(): boolean {
      return false;
    },
    startSearch: jest.fn(
      (
        r: ImmutableRecord,
        t: TimeLimitSetting,
        bt: number,
        wt: number,
        h: SearchHandler
      ) => {
        const m = moves[r.usi];
        if (m.sfen === "no-reply") {
          // eslint-disable-next-line  @typescript-eslint/no-empty-function
          return new Promise<void>(() => {});
        }
        if (m.sfen === "resign") {
          h.onResign();
          return Promise.resolve();
        }
        const move = r.position.createMoveBySFEN(m.sfen) as Move;
        h.onMove(
          move,
          m.info && {
            usi: r.usi,
            score: m.info?.score,
            mate: m.info?.mate,
            pv:
              m.info?.pv &&
              parseSFENPV(r.position, [m.sfen].concat(...m.info.pv)).slice(1),
          }
        );
        return Promise.resolve();
      }
    ),
    startPonder: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    gameover: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
  };
}

export function createMockPlayerBuilder(playerMap: { [uri: string]: Player }) {
  return {
    build: (playerSetting: PlayerSetting) => {
      const player = playerMap[playerSetting.uri];
      if (!player) {
        throw new Error("unexpected player URI");
      }
      return new Promise<Player>((resolve) => resolve(player));
    },
  };
}
