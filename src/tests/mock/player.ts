import { parseUSIPV } from "@/common/game/usi.js";
import { Player, SearchHandler } from "@/renderer/players/player.js";
import { PlayerSettings } from "@/common/settings/player.js";
import { ImmutablePosition, Move } from "tsshogi";
import { TimeStates } from "@/common/game/time.js";

export type MoveWithOption = {
  usi: string;
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
    readyNewGame: vi.fn(() => Promise.resolve()),
    startSearch: vi.fn((p: ImmutablePosition, usi: string, t: TimeStates, h: SearchHandler) => {
      const m = moves[usi];
      if (!m) {
        throw new Error("unexpected USI: " + usi);
      }
      if (m.usi === "no-reply") {
        return new Promise<void>(() => {});
      }
      if (m.usi === "resign") {
        h.onResign();
        return Promise.resolve();
      }
      if (m.usi === "win") {
        h.onWin();
        return Promise.resolve();
      }
      const move = p.createMoveByUSI(m.usi) as Move;
      h.onMove(
        move,
        m.info && {
          usi,
          score: m.info?.score,
          mate: m.info?.mate,
          pv: m.info?.pv && parseUSIPV(p, [m.usi].concat(...m.info.pv)).slice(1),
        },
      );
      return Promise.resolve();
    }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startPonder: vi.fn((p: ImmutablePosition, usi: string, t: TimeStates) => Promise.resolve()),
    startMateSearch: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    gameover: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
}

export function createMockPlayerBuilder(playerMap: { [uri: string]: Player }) {
  return {
    build: vi.fn().mockImplementation((playerSettings: PlayerSettings) => {
      const player = playerMap[playerSettings.uri];
      if (!player) {
        throw new Error("unexpected player URI");
      }
      return new Promise<Player>((resolve) => resolve(player));
    }),
  };
}

export function createErrorPlayerBuilder() {
  return {
    build: vi.fn().mockImplementation(() => Promise.reject(new Error("failed to create player"))),
  };
}
