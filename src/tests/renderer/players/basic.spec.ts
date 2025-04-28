import * as uri from "@/common/uri.js";
import { BasicPlayer } from "@/renderer/players/basic.js";
import { importKI2, Move, Record } from "tsshogi";

const timeStates = {
  black: {
    timeMs: 250,
    byoyomi: 30,
    increment: 0,
  },
  white: {
    timeMs: 160,
    byoyomi: 0,
    increment: 5,
  },
};

describe("players/basic", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("randomPlayer", () => {
    const player = new BasicPlayer(uri.ES_BASIC_ENGINE_RANDOM);
    const record = new Record();
    const handler = {
      onMove: vi.fn(),
      onResign: vi.fn(),
      onWin: vi.fn(),
      onError: vi.fn(),
    };
    player.startSearch(record.position, record.usi, timeStates, handler);
    vi.runOnlyPendingTimers();
    expect(handler.onMove).toHaveBeenCalled();
    expect(handler.onResign).not.toHaveBeenCalled();
    expect(handler.onWin).not.toHaveBeenCalled();
    expect(handler.onError).not.toHaveBeenCalled();
    const result = handler.onMove.mock.calls[0][0] as Move;
    expect(record.position.isValidMove(result)).toBeTruthy();
  });

  it("specificMoves", () => {
    const testCases = [
      {
        uri: uri.ES_BASIC_ENGINE_STATIC_ROOK_V1,
        ki2: "手合割：平手\n▲２六歩 △３四歩 ▲７六歩 △８八角成 ▲同　銀 △３二金 ▲２五歩",
        want: "3a2b",
      },
      {
        uri: uri.ES_BASIC_ENGINE_STATIC_ROOK_V1,
        ki2: "手合割：平手\n▲２六歩 △８四歩 ▲２五歩 △８五歩",
        want: "7g7f",
      },
      {
        uri: uri.ES_BASIC_ENGINE_RANGING_ROOK_V1,
        ki2: "手合割：平手\n▲７六歩 △３四歩 ▲２六歩 △４四歩 ▲２五歩",
        want: "2b3c",
      },
      {
        uri: uri.ES_BASIC_ENGINE_RANGING_ROOK_V1,
        ki2: "手合割：平手\n▲７六歩 △８四歩 ▲６八飛 △８五歩",
        want: "8h7g",
      },
    ];
    for (let i = 0; i < 10; i++) {
      for (const testCase of testCases) {
        const player = new BasicPlayer(testCase.uri);
        const record = importKI2(testCase.ki2) as Record;
        record.goto(record.moves.length);
        const handler = {
          onMove: vi.fn(),
          onResign: vi.fn(),
          onWin: vi.fn(),
          onError: vi.fn(),
        };
        player.startSearch(record.position, record.usi, timeStates, handler);
        vi.runOnlyPendingTimers();
        expect(handler.onMove).toHaveBeenCalled();
        expect(handler.onResign).not.toHaveBeenCalled();
        expect(handler.onWin).not.toHaveBeenCalled();
        expect(handler.onError).not.toHaveBeenCalled();
        const result = handler.onMove.mock.calls[0][0] as Move;
        expect(result.usi).toBe(testCase.want);
      }
    }
  });

  it("resign", () => {
    for (const playerURI of uri.ES_BASIC_ENGINE_LIST) {
      const player = new BasicPlayer(playerURI);
      const ki2 = `後手の持駒：なし
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
| ・ ・ ・ ・ ・ 全 ・ ・v香|一
| ・ 龍 ・ ・ ・ ・ ・ ・ ・|二
| ・ ・v歩 ・v歩 馬v銀v歩 ・|三
| ・v歩 ・v歩 ・ ・ ・ ・v歩|四
| ・ ・ ・ ・ ・ ・ ・ ・v玉|五
| 香 ・ ・ ・ 歩 ・v歩 ・ 香|六
| ・ ・ ・ ・ ・ ・ 歩 歩 歩|七
| ・ 歩 金 角 ・ ・ ・ 飛 ・|八
| ・ ・ ・ 玉 ・ ・ 銀 桂 香|九
+---------------------------+
先手の持駒：　金三　銀　桂三　歩六
後手番`;
      const record = importKI2(ki2) as Record;
      const handler = {
        onMove: vi.fn(),
        onResign: vi.fn(),
        onWin: vi.fn(),
        onError: vi.fn(),
      };
      player.startSearch(record.position, record.usi, timeStates, handler);
      vi.runOnlyPendingTimers();
      expect(handler.onMove).not.toHaveBeenCalled();
      expect(handler.onResign).toHaveBeenCalled();
      expect(handler.onWin).not.toHaveBeenCalled();
      expect(handler.onError).not.toHaveBeenCalled();
    }
  });
});
