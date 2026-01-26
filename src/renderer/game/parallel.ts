import { defaultGameSettings, GameSettings } from "@/common/settings/game.js";
import { GameManager } from "./game.js";
import { RecordManager } from "@/renderer/record/manager.js";
import { Clock } from "./clock.js";
import { PlayerBuilder } from "@/renderer/players/builder.js";
import { buildGameCoordinator } from "./coordinator.js";
import { GameResults, newGameResults } from "./result.js";
import { RecordMetadataKey } from "tsshogi";
import { GameResult } from "@/common/game/result.js";

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
};

type ProgressCallback = (progress: ParallelGameProgress) => void;
type SaveRecordCallback = (dir: string, recordManager: RecordManager) => void;
type ClosedCallback = (results: GameResults) => void;
type ErrorCallback = (e: unknown) => void;

type Worker = {
  gameManager: GameManager;
} & WorkerStats;

export class ParallelGameManager {
  private settings = defaultGameSettings();
  private _workers: Worker[] = [];
  private runningWorkers = 0;
  private sprtPairResults = new Map<number, GameResult[]>();
  private sprtPairCounts = {
    loseLose: 0,
    loseDraw: 0,
    drawDrawOrWinLose: 0,
    winDraw: 0,
    winWin: 0,
  };

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
    if (settings.repeat < 2) {
      throw new Error("ParallelGameManager#start: settings.repeat must be 2 or more.");
    }
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
    this.sprtPairResults.clear();
    this.sprtPairCounts = {
      loseLose: 0,
      loseDraw: 0,
      drawDrawOrWinLose: 0,
      winDraw: 0,
      winWin: 0,
    };
    try {
      for (let i = 0; i < settings.parallelism; i++) {
        const recordManager = new RecordManager();
        const blackClock = new Clock();
        const whiteClock = new Clock();
        const gameManager = new GameManager(recordManager, blackClock, whiteClock);
        const worker: Worker = {
          gameManager: gameManager,
          gameCount: 0,
        };
        gameManager
          .on("saveRecord", (dir) => {
            this.onSaveRecord(dir, recordManager);
          })
          .on("gameNext", () => {
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
            });
          })
          .on("gameResult", (summary) => {
            this.trackSprtPairResult(summary.pairIndex, summary.result);
          })
          .on("closed", () => {
            worker.currentGameTitle = undefined;
            worker.currentBlackPlayerName = undefined;
            worker.currentWhitePlayerName = undefined;
            worker.currentGameStartTime = undefined;
            this.runningWorkers--;
            if (this.runningWorkers === 0) {
              const results = this.results;
              this._workers = [];
              console.log("SPRT pair stats", this.sprtPairCounts);
              this.onClosed(results);
            }
          })
          .on("error", (e) => {
            this.onError(e);
          });
        await gameManager.start(gameConditions, playerBuilder);
        this._workers.push(worker);
        this.runningWorkers++;
      }
    } catch (e) {
      this.onError(e);
      this.stop();
    }
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

  private trackSprtPairResult(pairIndex: number, result: GameResult): void {
    const pairResults = this.sprtPairResults.get(pairIndex) ?? [];
    pairResults.push(result);
    if (pairResults.length < 2) {
      this.sprtPairResults.set(pairIndex, pairResults);
      return;
    }
    this.sprtPairResults.delete(pairIndex);
    const winCount = pairResults.filter((item) => item === GameResult.WIN).length;
    const loseCount = pairResults.filter((item) => item === GameResult.LOSE).length;
    const drawCount = pairResults.filter((item) => item === GameResult.DRAW).length;
    if (winCount === 2) {
      this.sprtPairCounts.winWin++;
    } else if (winCount === 1 && drawCount === 1) {
      this.sprtPairCounts.winDraw++;
    } else if (loseCount === 2) {
      this.sprtPairCounts.loseLose++;
    } else if (loseCount === 1 && drawCount === 1) {
      this.sprtPairCounts.loseDraw++;
    } else if ((winCount === 1 && loseCount === 1) || drawCount === 2) {
      this.sprtPairCounts.drawDrawOrWinLose++;
    }
  }
}
