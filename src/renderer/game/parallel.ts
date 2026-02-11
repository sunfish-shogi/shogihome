import { defaultGameSettings, GameSettings } from "@/common/settings/game.js";
import { GameManager } from "./game.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { Clock } from "./clock.js";
import { PlayerBuilder } from "@/renderer/players/builder.js";
import { buildGameCoordinator } from "./coordinator.js";
import { GameResults, newGameResults, SPRTSummary } from "./result.js";
import { RecordMetadataKey } from "tsshogi";
import { GameResult } from "@/common/game/result.js";
import { calculateSPRT } from "./sprt.js";

export type WorkerStats = {
  gameCount: number;
  currentGameTitle?: string;
  currentBlackPlayerName?: string;
  currentWhitePlayerName?: string;
  currentGameStartTime?: number;
};

export type ParallelGameProgress = {
  workerStats: WorkerStats[];
  gameResults: GameResults;
  sprtSummary?: SPRTSummary;
};

type ProgressCallback = (progress: ParallelGameProgress) => void;
type SaveRecordCallback = (dir: string, recordManager: RecordManager) => void;
type ClosedCallback = (results: GameResults, sprt?: SPRTSummary) => void;
type ErrorCallback = (e: unknown) => void;

type Worker = {
  gameManager: GameManager;
} & WorkerStats;

export class ParallelGameManager {
  private settings = defaultGameSettings();
  private _workers: Worker[] = [];
  private runningWorkers = 0;
  private pairIndexToFirstResult = new Map<number, GameResult>();
  private pentanomial = {
    loseLose: 0,
    loseDraw: 0,
    drawDrawOrWinLose: 0,
    winDraw: 0,
    winWin: 0,
  };
  private sprtSummary: SPRTSummary | undefined = undefined;

  private onProgress: ProgressCallback = () => {
    /* noop */
  };
  private onSaveRecord: SaveRecordCallback = () => {
    /* noop */
  };
  private onClosed: ClosedCallback = () => {
    /* noop */
  };
  private onError: ErrorCallback = () => {
    /* noop */
  };

  on(event: "progress", handler: ProgressCallback): this;
  on(event: "saveRecord", handler: SaveRecordCallback): this;
  on(event: "closed", handler: ClosedCallback): this;
  on(event: "error", handler: ErrorCallback): this;
  on(event: string, handler: unknown): this {
    switch (event) {
      case "progress":
        this.onProgress = handler as ProgressCallback;
        break;
      case "saveRecord":
        this.onSaveRecord = handler as SaveRecordCallback;
        break;
      case "closed":
        this.onClosed = handler as ClosedCallback;
        break;
      case "error":
        this.onError = handler as ErrorCallback;
        break;
    }
    return this;
  }

  async start(settings: GameSettings, playerBuilder: PlayerBuilder) {
    if (settings.parallelism < 1) {
      throw new Error("ParallelGameManager#start: settings.parallelism must be 1 or more.");
    }
    if (this._workers.length > 0) {
      throw new Error("ParallelGameManager#start: already started.");
    }
    this.settings = settings;

    const gameConditions = await buildGameCoordinator({
      settings: this.settings,
      currentPly: 0,
    });

    this._workers = [];
    this.runningWorkers = 0;
    this.pairIndexToFirstResult.clear();
    this.pentanomial = {
      loseLose: 0,
      loseDraw: 0,
      drawDrawOrWinLose: 0,
      winDraw: 0,
      winWin: 0,
    };
    this.sprtSummary = undefined;

    // worker の追加を非同期で実行すると途中で stop が呼ばれたときに不整合が起きるため
    // 全ての worker を同期的に start してから Promise.allSettled で結果を待つ。
    const promises: Promise<void>[] = [];
    for (let i = 0; i < settings.parallelism; i++) {
      // Create a new worker
      const recordManager = new RecordManager();
      const blackClock = new Clock();
      const whiteClock = new Clock();
      const gameManager = new GameManager(recordManager, blackClock, whiteClock);
      const worker: Worker = {
        gameManager: gameManager,
        gameCount: 0,
      };
      this._workers.push(worker);

      // Setup event handlers
      const onGameNext = () => {
        worker.gameCount++;
        worker.currentGameTitle = recordManager.record.metadata.getStandardMetadata(
          RecordMetadataKey.TITLE,
        );
        worker.currentBlackPlayerName = recordManager.record.metadata.getStandardMetadata(
          RecordMetadataKey.BLACK_NAME,
        );
        worker.currentWhitePlayerName = recordManager.record.metadata.getStandardMetadata(
          RecordMetadataKey.WHITE_NAME,
        );
        worker.currentGameStartTime = Date.now();
        this.onProgress({
          workerStats: this._workers,
          gameResults: this.results,
          sprtSummary: this.sprtSummary,
        });
      };
      const onClosed = () => {
        worker.currentGameTitle = undefined;
        worker.currentBlackPlayerName = undefined;
        worker.currentWhitePlayerName = undefined;
        worker.currentGameStartTime = undefined;
        this.runningWorkers--;
        if (this.runningWorkers === 0) {
          const results = this.results;
          this._workers = [];
          this.onClosed(results, this.sprtSummary);
        }
      };
      gameManager
        .on("saveRecord", (dir) => {
          this.onSaveRecord(dir, recordManager);
        })
        .on("gameNext", onGameNext)
        .on("gameResult", (summary) => {
          this.trackPairResult(summary.pairIndex, summary.result);
        })
        .on("closed", onClosed)
        .on("error", (e) => {
          this.onError(e);
        });

      // Start the game manager
      this.runningWorkers++;
      promises.push(
        gameManager.start(gameConditions, playerBuilder).catch((e) => {
          this.onError(e);
          onClosed();
          return Promise.reject(e);
        }),
      );
    }

    // エラーが発生した場合に worker 全体のクリーンアップを待機すると実装が複雑になるため
    // この関数自体の Promise は resolve して、エラー時は後から stop() を呼び出す。
    Promise.allSettled(promises).then((results) => {
      if (results.some((r) => r.status === "rejected")) {
        this.stop();
      }
    });
  }

  stop() {
    for (const worker of this._workers) {
      worker.gameManager.stop();
    }
  }

  private get results(): GameResults {
    const results = newGameResults("", "");
    for (const worker of this._workers) {
      const workerResults = worker.gameManager.results;
      results.player1.name = workerResults.player1.name;
      results.player1.win += workerResults.player1.win;
      results.player1.winBlack += workerResults.player1.winBlack;
      results.player1.winWhite += workerResults.player1.winWhite;
      results.player2.name = workerResults.player2.name;
      results.player2.win += workerResults.player2.win;
      results.player2.winBlack += workerResults.player2.winBlack;
      results.player2.winWhite += workerResults.player2.winWhite;
      results.draw += workerResults.draw;
      results.invalid += workerResults.invalid;
      results.total += workerResults.total;
    }
    return results;
  }

  private trackPairResult(pairIndex: number, current: GameResult): void {
    const first = this.pairIndexToFirstResult.get(pairIndex);
    if (first === undefined) {
      this.pairIndexToFirstResult.set(pairIndex, current);
      return;
    }
    this.pairIndexToFirstResult.delete(pairIndex);
    const winCount = (first === GameResult.WIN ? 1 : 0) + (current === GameResult.WIN ? 1 : 0);
    const loseCount = (first === GameResult.LOSE ? 1 : 0) + (current === GameResult.LOSE ? 1 : 0);
    const drawCount = (first === GameResult.DRAW ? 1 : 0) + (current === GameResult.DRAW ? 1 : 0);
    if (winCount === 2) {
      this.pentanomial.winWin++;
    } else if (winCount === 1 && drawCount === 1) {
      this.pentanomial.winDraw++;
    } else if (loseCount === 2) {
      this.pentanomial.loseLose++;
    } else if (loseCount === 1 && drawCount === 1) {
      this.pentanomial.loseDraw++;
    } else {
      this.pentanomial.drawDrawOrWinLose++;
    }

    if (
      this.settings.sprtEnabled &&
      (this.sprtSummary === undefined || this.sprtSummary.result === "inconclusive")
    ) {
      const { llr, lowerBound, upperBound } = calculateSPRT(this.pentanomial, this.settings.sprt);
      this.sprtSummary = {
        elo0: this.settings.sprt.elo0,
        elo1: this.settings.sprt.elo1,
        alpha: this.settings.sprt.alpha,
        beta: this.settings.sprt.beta,
        pentanomial: { ...this.pentanomial },
        llr,
        lowerBound,
        upperBound,
        result: "inconclusive",
      };
      if (llr >= upperBound) {
        this.sprtSummary.result = "accept";
        this.stop();
      } else if (llr <= lowerBound) {
        this.sprtSummary.result = "reject";
        this.stop();
      }
    }
  }
}
