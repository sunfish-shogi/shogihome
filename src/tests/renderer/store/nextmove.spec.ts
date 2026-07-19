import { ImmutablePosition, Position } from "tsshogi";
import { Mocked, MockedClass } from "vitest";
import api, { API } from "@/renderer/ipc/api.js";
import { USIPlayer } from "@/renderer/players/usi.js";
import { NextMoveGenerationManager, NextMoveQuizState } from "@/renderer/store/nextmove.js";
import {
  NextMoveGenerationSettings,
  defaultNextMoveGenerationSettings,
} from "@/common/settings/nextmove.js";
import { USIEngine } from "@/common/settings/usi.js";
import { testUSIEngine } from "@/tests/mock/usi.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import {
  NextMoveCollection,
  nextMoveCollectionFormat,
  nextMoveCollectionVersion,
} from "@/common/nextmove/collection.js";

vi.mock("@/renderer/ipc/api.js");
vi.mock("@/renderer/players/usi.js");

const mockAPI = api as Mocked<API>;
const mockUSIPlayer = USIPlayer as MockedClass<typeof USIPlayer>;

const testEngineWithMultiPV: USIEngine = {
  ...testUSIEngine,
  options: {
    MultiPV: {
      name: "MultiPV",
      type: "spin",
      order: 1,
      default: 1,
      min: 1,
      max: 10,
      value: 1,
    },
  },
};

// 3手目 (▲2六歩) で先手の評価値が 600 -> -300 (勝率 73.1% -> 37.8%、下降 35.4pt) に
// 下降する棋譜。
const kif = `
先手：先手太郎
後手：後手次郎
手合割：平手
   1 ７六歩(77)
*#評価値=600
   2 ３四歩(33)
*#評価値=600
   3 ２六歩(27)
*#評価値=-300
   4 ８四歩(83)
*#評価値=-250
`;

const settings: NextMoveGenerationSettings = {
  ...defaultNextMoveGenerationSettings(),
  usi: testEngineWithMultiPV,
  sourceDirectory: "/path/to/records",
  minPly: 0,
  maxPly: 1000,
  multiPV: 2,
  maxSecondsPerPosition: 10,
  destinationFile: "/path/to/problems.json",
};

describe("store/nextmove", () => {
  describe("NextMoveGenerationManager", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    it("generate", async () => {
      mockAPI.listRecordFiles.mockResolvedValue(["/path/to/records/a.kif"]);
      mockAPI.openRecord.mockResolvedValue(new TextEncoder().encode(kif));
      mockUSIPlayer.prototype.launch.mockResolvedValue();
      mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
      mockUSIPlayer.prototype.startResearch.mockResolvedValue();
      mockUSIPlayer.prototype.stop.mockResolvedValue();
      mockUSIPlayer.prototype.close.mockResolvedValue();
      let infoHandler: ((position: ImmutablePosition, info: USIInfoCommand) => void) | undefined;
      mockUSIPlayer.prototype.setUSIInfoCommandHandler.mockImplementation((handler) => {
        infoHandler = handler;
      });
      const onFinish = vi.fn();
      const onError = vi.fn();
      const manager = new NextMoveGenerationManager().on("finish", onFinish).on("error", onError);
      await manager.start(settings);
      expect(mockUSIPlayer.prototype.launch).toBeCalledTimes(1);
      // 定跡がヒットすると再探索されないため、定跡を無効化してエンジンを起動する。
      expect(mockUSIPlayer.mock.calls[0][0].extraBook).toBeUndefined();
      expect(infoHandler).toBeTruthy();

      // 3手目の悪手候補に対する再探索が始まる。
      await vi.advanceTimersByTimeAsync(0);
      expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
      const position = new Position();
      // 手番 (先手) から見た評価値で MultiPV の候補を返す。
      infoHandler?.(position, { multipv: 1, depth: 20, scoreCP: 100, pv: ["6g6f", "8c8d"] });
      infoHandler?.(position, { multipv: 2, depth: 20, scoreCP: -300, pv: ["1g1f"] });
      await vi.advanceTimersByTimeAsync(10000);

      expect(onFinish).toBeCalledTimes(1);
      expect(onError).not.toBeCalled();
      expect(mockUSIPlayer.prototype.stop).toBeCalledTimes(1);
      expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
      const collection = onFinish.mock.calls[0][0] as NextMoveCollection;
      const summary = onFinish.mock.calls[0][1];
      expect(collection.format).toBe(nextMoveCollectionFormat);
      expect(collection.version).toBe(nextMoveCollectionVersion);
      expect(collection.metadata?.engine?.name).toBe(testUSIEngine.name);
      expect(collection.metadata?.engine?.multiPV).toBe(2);
      expect(collection.problems).toHaveLength(1);
      const problem = collection.problems[0];
      // 出題局面は ▲7六歩 △3四歩 の局面 (手数は 1 に正規化)。
      expect(problem.sfen).toBe(
        "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 1",
      );
      expect(problem.candidates).toStrictEqual([
        {
          usi: "6g6f",
          score: 100,
          mate: undefined,
          depth: 20,
          pv: ["6g6f", "8c8d"],
          accepted: true,
        },
        { usi: "1g1f", score: -300, mate: undefined, depth: 20, pv: ["1g1f"], accepted: false },
      ]);
      expect(problem.actualMove).toStrictEqual({
        usi: "2g2f",
        score: -300,
        scoreSource: "comment",
      });
      // 出題局面に至る直前の手 (△3四歩) と、その手を指す前の局面を記録する。
      expect(problem.previousMove).toStrictEqual({
        usi: "3c3d",
        sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
      });
      expect(problem.analysis).toStrictEqual({ scoreBeforeMove: 600, scoreAfterMove: -300 });
      expect(problem.source?.path).toBe("/path/to/records/a.kif");
      expect(problem.source?.ply).toBe(3);
      expect(problem.source?.blackPlayer).toBe("先手太郎");
      expect(problem.source?.whitePlayer).toBe("後手次郎");
      expect(summary).toStrictEqual({
        totalFiles: 1,
        skippedFiles: 0,
        blunderCount: 1,
        adoptedCount: 1,
        aborted: false,
      });
    });

    it("abort", async () => {
      mockAPI.listRecordFiles.mockResolvedValue(["/path/to/records/a.kif"]);
      mockAPI.openRecord.mockResolvedValue(new TextEncoder().encode(kif));
      mockUSIPlayer.prototype.launch.mockResolvedValue();
      mockUSIPlayer.prototype.readyNewGame.mockResolvedValue();
      mockUSIPlayer.prototype.startResearch.mockResolvedValue();
      mockUSIPlayer.prototype.close.mockResolvedValue();
      const onFinish = vi.fn();
      const manager = new NextMoveGenerationManager().on("finish", onFinish);
      await manager.start(settings);
      await vi.advanceTimersByTimeAsync(0);
      expect(mockUSIPlayer.prototype.startResearch).toBeCalledTimes(1);
      manager.stop();
      await vi.advanceTimersByTimeAsync(0);
      expect(onFinish).toBeCalledTimes(1);
      const summary = onFinish.mock.calls[0][1];
      expect(summary.aborted).toBe(true);
      expect(mockUSIPlayer.prototype.close).toBeCalledTimes(1);
    });
  });

  describe("NextMoveQuizState", () => {
    const collection: NextMoveCollection = {
      format: nextMoveCollectionFormat,
      version: nextMoveCollectionVersion,
      problems: [
        {
          sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          candidates: [
            { usi: "2g2f", score: 50, accepted: true },
            { usi: "7g7f", score: 40, accepted: true },
            { usi: "5g5f", score: -50, accepted: false },
          ],
          actualMove: { usi: "9g9f", score: -100 },
        },
        {
          sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 1",
          candidates: [{ usi: "8c8d", score: -20, accepted: true }],
          actualMove: { usi: "9c9d", score: 100 },
          previousMove: {
            usi: "7g7f",
            sfen: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1",
          },
        },
      ],
    };

    const createMove = (state: NextMoveQuizState, usi: string) => {
      const position = state.position as ImmutablePosition;
      const move = position.createMoveByUSI(usi);
      if (!move) {
        throw new Error(`invalid move: ${usi}`);
      }
      return move;
    };

    it("answer/best", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      expect(state.isActive).toBe(true);
      expect(state.problemCount).toBe(2);
      expect(state.problemNumber).toBe(1);
      expect(state.done).toBe(false);
      expect(state.displayPosition?.sfen).toBe(collection.problems[0].sfen);
      expect(state.answer(createMove(state, "2g2f"))).toBe("best");
      expect(state.done).toBe(true);
      expect(state.answeredCount).toBe(1);
      expect(state.correctCount).toBe(1);
      // 指した手が盤面に反映される。
      expect(state.playedMove?.usi).toBe("2g2f");
      expect(state.displayPosition?.sfen).toBe(
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 1",
      );
    });

    it("answer/accepted", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      expect(state.answer(createMove(state, "7g7f"))).toBe("accepted");
      expect(state.done).toBe(true);
      expect(state.correctCount).toBe(1);
    });

    it("answer/incorrect-and-retry", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      // 実戦の手は不正解として扱う。指した手は盤面に反映される。
      expect(state.answer(createMove(state, "9g9f"))).toBe("actual");
      expect(state.done).toBe(false);
      expect(state.playedMove?.usi).toBe("9g9f");
      expect(state.displayPosition?.sfen).not.toBe(collection.problems[0].sfen);
      // 再挑戦するまでは解答を受け付けない。
      expect(state.answer(createMove(state, "2g2f"))).toBeUndefined();
      // 再挑戦すると出題局面に戻る。
      state.retry();
      expect(state.playedMove).toBeUndefined();
      expect(state.displayPosition?.sfen).toBe(collection.problems[0].sfen);
      // 正解として扱われない候補手も不正解。
      expect(state.answer(createMove(state, "5g5f"))).toBe("incorrect");
      expect(state.done).toBe(false);
      state.retry();
      // 再挑戦で正解しても最初の解答が不正解なら正解数は増えない。
      expect(state.answer(createMove(state, "2g2f"))).toBe("best");
      expect(state.done).toBe(true);
      expect(state.answeredCount).toBe(1);
      expect(state.correctCount).toBe(0);
    });

    it("reveal", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      state.reveal();
      expect(state.done).toBe(true);
      expect(state.answeredCount).toBe(1);
      expect(state.correctCount).toBe(0);
      // 解答済みの問題は再解答できない。
      expect(state.answer(createMove(state, "2g2f"))).toBeUndefined();
    });

    it("reveal/afterIncorrectAnswer", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      expect(state.answer(createMove(state, "9g9f"))).toBe("actual");
      // 再挑戦しない場合は出題局面に戻して答えを表示する。
      state.reveal();
      expect(state.done).toBe(true);
      expect(state.playedMove).toBeUndefined();
      expect(state.displayPosition?.sfen).toBe(collection.problems[0].sfen);
      expect(state.answeredCount).toBe(1);
      expect(state.correctCount).toBe(0);
    });

    it("navigation", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      expect(state.hasPrevious).toBe(false);
      expect(state.hasNext).toBe(true);
      // previousMove のない問題では直前の指し手は取得できない。
      expect(state.previousMove).toBeUndefined();
      state.goNext();
      expect(state.problemNumber).toBe(2);
      expect(state.hasNext).toBe(false);
      expect(state.position?.sfen).toBe(collection.problems[1].sfen);
      // previousMove から直前の指し手 (Move) を復元する。
      expect(state.previousMove?.usi).toBe("7g7f");
      state.goPrevious();
      expect(state.problemNumber).toBe(1);
    });

    it("hide-and-resume", () => {
      const state = new NextMoveQuizState();
      state.open(collection, "/path/to/problems.json", false);
      expect(state.isActive).toBe(true);
      expect(state.visible).toBe(true);
      state.answer(createMove(state, "2g2f"));
      state.goNext();
      // 閉じてもセッション (成績・現在位置) は保持される。
      state.hide();
      expect(state.visible).toBe(false);
      expect(state.isActive).toBe(true);
      state.resume();
      expect(state.visible).toBe(true);
      expect(state.problemNumber).toBe(2);
      expect(state.correctCount).toBe(1);
      // 別の問題集を開くとセッションは初期化される。
      state.open(collection, "/path/to/problems.json", false);
      expect(state.problemNumber).toBe(1);
      expect(state.correctCount).toBe(0);
    });
  });
});
