import api from "@/renderer/ipc/api.js";
import { parseUSIPV, USIInfoCommand } from "@/common/game/usi.js";
import {
  getUSIEngineMultiPV,
  getUSIEnginePonder,
  getUSIEngineStochasticPonder,
  MultiPV,
  USIEngine,
  USIMultiPV,
} from "@/common/settings/usi.js";
import { Color, ImmutablePosition, Move, Position } from "tsshogi";
import { Player, SearchInfo, SearchHandler, MateHandler } from "./player.js";
import { GameResult } from "@/common/game/result.js";
import { TimeStates } from "@/common/game/time.js";

type onStartSearchHandler = (sessionID: number, position: ImmutablePosition) => void;

type onUpdateUSIInfoHandler = (
  sessionID: number,
  position: ImmutablePosition,
  name: string,
  info: USIInfoCommand,
  ponderMove?: Move,
) => void;

let onStartSearch: onStartSearchHandler = () => {};
let onUpdateUSIInfo: onUpdateUSIInfoHandler = () => {};

export function setOnStartSearchHandler(handler: onStartSearchHandler) {
  onStartSearch = handler;
}

export function setOnUpdateUSIInfoHandler(handler: onUpdateUSIInfoHandler) {
  onUpdateUSIInfo = handler;
}

export class USIPlayer implements Player {
  private _sessionID = 0;
  private usi?: string;
  private position?: Position;
  private searchHandler?: SearchHandler;
  private mateHandler?: MateHandler;
  private ponder?: string;
  private ponderMove?: Move;
  private info?: SearchInfo;
  private usiInfoTimeout?: number;
  private customMultiPV?: number;

  constructor(
    private engine: USIEngine,
    private timeoutSeconds: number,
    private onSearchInfo?: (info: SearchInfo) => void,
  ) {}

  get name(): string {
    return this.engine.name;
  }

  get sessionID(): number {
    return this._sessionID;
  }

  async launch(): Promise<void> {
    this._sessionID = await api.usiLaunch(this.engine, this.timeoutSeconds);
    usiPlayers[this.sessionID] = this;
  }

  isEngine(): boolean {
    return true;
  }

  async readyNewGame(): Promise<void> {
    await api.usiReady(this.sessionID);
  }

  async startSearch(
    position: ImmutablePosition,
    usi: string,
    timeStates: TimeStates,
    handler: SearchHandler,
  ): Promise<void> {
    this.clearHandlers();
    this.searchHandler = handler;
    this.usi = usi;
    this.position = position.clone();
    if (this.ponderMove && this.ponder === this.usi) {
      api.usiPonderHit(this.sessionID, timeStates);
    } else {
      this.info = undefined;
      await api.usiGo(this.sessionID, this.usi, timeStates);
      onStartSearch(this.sessionID, this.position);
    }
    this.ponderMove = undefined;
    this.ponder = undefined;
  }

  async startPonder(
    position: ImmutablePosition,
    usi: string,
    timeStates: TimeStates,
  ): Promise<void> {
    // エンジンの USI_Ponder オプションが無効なら何もしない。
    if (!getUSIEnginePonder(this.engine)) {
      return;
    }
    // 連続して Ponder を開始しない。
    // NOTE: 早期 Ponder 機能を有効にすると早期実行と通常実行の 2 回の呼び出しが来る。
    if (this.ponderMove) {
      return;
    }
    // 現在局面までの USI が前方一致しているか確認する。
    const baseUSI = usi;
    if (!this.ponder || !this.ponder.startsWith(baseUSI)) {
      return;
    }
    // 予想した 1 手を取り出す。
    const ponderMove = position.createMoveByUSI(this.ponder.slice(baseUSI.length + 1));
    // 合法手かどうかをチェックする。
    if (!ponderMove || !position.isValidMove(ponderMove)) {
      return;
    }

    this.clearHandlers();
    this.usi = this.ponder;
    this.position = position.clone();
    if (!this.stochasticPonder) {
      this.position.doMove(ponderMove);
    }
    this.info = undefined;
    this.ponderMove = ponderMove;
    await api.usiGoPonder(this.sessionID, this.ponder, timeStates);
    onStartSearch(this.sessionID, this.position);
  }

  async startMateSearch(
    position: ImmutablePosition,
    usi: string,
    maxSeconds: number | undefined,
    handler: MateHandler,
  ): Promise<void> {
    this.clearHandlers();
    this.usi = usi;
    this.info = undefined;
    this.position = position.clone();
    this.mateHandler = handler;
    await api.usiGoMate(this.sessionID, this.usi, maxSeconds);
    onStartSearch(this.sessionID, this.position);
  }

  async startResearch(position: ImmutablePosition, usi: string): Promise<void> {
    this.clearHandlers();
    this.usi = usi;
    this.info = undefined;
    this.position = position.clone();
    await api.usiGoInfinite(this.sessionID, usi);
    onStartSearch(this.sessionID, this.position);
  }

  async stop(): Promise<void> {
    await api.usiStop(this.sessionID);
  }

  async gameover(result: GameResult): Promise<void> {
    await api.usiGameover(this.sessionID, result);
  }

  async close(): Promise<void> {
    this.clearHandlers();
    await api.usiQuit(this.sessionID);
    delete usiPlayers[this.sessionID];
  }

  private clearHandlers(): void {
    this.searchHandler = undefined;
    this.mateHandler = undefined;
  }

  onBestMove(usi: string, usiMove: string, ponder?: string): void {
    const searchHandler = this.searchHandler;
    this.clearHandlers();
    if (!searchHandler || !this.position) {
      return;
    }
    if (usi !== this.usi) {
      return;
    }
    if (usiMove === "resign") {
      searchHandler.onResign();
      return;
    }
    if (usiMove === "win") {
      searchHandler.onWin();
      return;
    }
    const move = this.position.createMoveByUSI(usiMove);
    if (!move) {
      searchHandler.onError("エンジンから不明な指し手を受信しました:" + usiMove);
      searchHandler.onResign();
      return;
    }
    const includesMoves = usi.indexOf(" moves ") > 0;
    this.ponder = ponder && `${usi}${includesMoves ? "" : " moves"} ${usiMove} ${ponder}`;
    this.flushUSIInfo();
    if (this.info?.pv && this.info.pv.length >= 1 && this.info.pv[0].equals(move)) {
      const info = {
        ...this.info,
        pv: this.info.pv.slice(1),
      };
      searchHandler.onMove(move, info);
    } else {
      searchHandler.onMove(move);
    }
  }

  onCheckmate(usi: string, usiMoves: string[]): void {
    if (usi !== this.usi || !this.position) {
      return;
    }
    onUpdateUSIInfo(this.sessionID, this.position, this.name, { pv: usiMoves });
    const mateHandler = this.mateHandler;
    this.clearHandlers();
    if (!mateHandler) {
      return;
    }
    const position = this.position;
    const moves: Move[] = [];
    for (const usiMove of usiMoves) {
      const move = position.createMoveByUSI(usiMove);
      if (!move) {
        mateHandler.onError("エンジンから不明な指し手を受信しました:" + usiMove);
        return;
      }
      moves.push(move);
      if (!position.doMove(move)) {
        mateHandler.onError("エンジンから無効な指し手を受信しました:" + usiMove);
        return;
      }
    }
    mateHandler.onCheckmate(moves);
  }

  onCheckmateNotImplemented(): void {
    const mateHandler = this.mateHandler;
    this.clearHandlers();
    mateHandler?.onNotImplemented();
  }

  onCheckmateTimeout(usi: string): void {
    if (usi !== this.usi || !this.position) {
      return;
    }
    const mateHandler = this.mateHandler;
    this.clearHandlers();
    mateHandler?.onTimeout();
  }

  onNoMate(usi: string): void {
    if (usi !== this.usi || !this.position) {
      return;
    }
    const mateHandler = this.mateHandler;
    this.clearHandlers();
    mateHandler?.onNoMate();
  }

  onUSIInfo(usi: string, infoCommand: USIInfoCommand) {
    if (usi !== this.usi || !this.position) {
      return;
    }
    onUpdateUSIInfo(this.sessionID, this.position, this.name, infoCommand, this.ponderMove);
    if (infoCommand.multipv && infoCommand.multipv !== 1) {
      return;
    }
    const sign = this.position.color === Color.BLACK ? 1 : -1;
    const pv =
      infoCommand.pv && infoCommand.pv.length >= 1
        ? infoCommand.pv
        : infoCommand.currmove
          ? [infoCommand.currmove]
          : undefined;
    // 情報を更新する。
    this.info = {
      usi: usi,
      depth: infoCommand.depth ?? this.info?.depth,
      nodes: infoCommand.nodes ?? this.info?.nodes,
      score: (infoCommand.scoreCP && infoCommand.scoreCP * sign) ?? this.info?.score,
      mate: (infoCommand.scoreMate && infoCommand.scoreMate * sign) ?? this.info?.mate,
      pv: (pv && parseUSIPV(this.position, pv)) ?? this.info?.pv,
    };
    // Ponder 中はハンドラーを呼ばない。
    if (this.ponderMove) {
      return;
    }
    // 高頻度でコマンドが送られてくると描画が追いつかないので、一定時間ごとに反映する。
    if (this.usiInfoTimeout) {
      return;
    }
    this.usiInfoTimeout = window.setTimeout(() => {
      this.flushUSIInfo();
    }, 500);
  }

  private flushUSIInfo() {
    if (this.usiInfoTimeout) {
      clearTimeout(this.usiInfoTimeout);
      this.usiInfoTimeout = undefined;
    }
    if (this.info) {
      this.onSearchInfo?.(this.info);
    }
  }

  get multiPV(): number | undefined {
    return this.customMultiPV || getUSIEngineMultiPV(this.engine);
  }

  async setMultiPV(multiPV: number): Promise<void> {
    const option = this.engine.options[USIMultiPV] || this.engine.options[MultiPV];
    if (!option || option.type !== "spin") {
      throw new Error("The engine does not support MultiPV option.");
    }
    if ((option.min && multiPV < option.min) || (option.max && multiPV > option.max)) {
      throw new Error("The MultiPV value is out of range.");
    }
    await api.usiSetOption(this.sessionID, option.name, multiPV.toFixed(0));
    this.customMultiPV = multiPV;
  }

  get stochasticPonder(): boolean {
    return getUSIEngineStochasticPonder(this.engine);
  }
}

const usiPlayers: { [sessionID: number]: USIPlayer } = {};

export function onUSIBestMove(sessionID: number, usi: string, usiMove: string, ponder?: string) {
  usiPlayers[sessionID]?.onBestMove(usi, usiMove, ponder);
}

export function onUSICheckmate(sessionID: number, usi: string, usiMoves: string[]) {
  usiPlayers[sessionID]?.onCheckmate(usi, usiMoves);
}

export function onUSICheckmateNotImplemented(sessionID: number) {
  usiPlayers[sessionID]?.onCheckmateNotImplemented();
}

export function onUSICheckmateTimeout(sessionID: number, usi: string) {
  usiPlayers[sessionID]?.onCheckmateTimeout(usi);
}

export function onUSINoMate(sessionID: number, usi: string) {
  usiPlayers[sessionID]?.onNoMate(usi);
}

export function onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand) {
  usiPlayers[sessionID]?.onUSIInfo(usi, info);
}

export function isActiveUSIPlayerSession(sessionID: number): boolean {
  return !!usiPlayers[sessionID];
}
