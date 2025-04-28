import { USIInfoCommand } from "@/common/game/usi.js";
import { Color, ImmutablePosition, Move, Position, formatMove } from "tsshogi";
import { isActiveUSIPlayerSession } from "@/renderer/players/usi.js";

export type USIInfo = {
  id: number;
  position: string;
  color: Color;
  depth?: number;
  selectiveDepth?: number;
  timeMs?: number;
  nodes?: number;
  score?: number;
  scoreMate?: number;
  lowerBound?: boolean;
  upperBound?: boolean;
  multiPV?: number;
  pv?: string[];
  text?: string;
};

function formatPV(position: ImmutablePosition, pv: string[], maxLength: number): string {
  const p = position.clone();
  let lastMove: Move | undefined;
  let result = "";
  let i = 0;
  for (; i < pv.length && i < maxLength; i++) {
    const move = p.createMoveByUSI(pv[i]);
    if (!move) {
      break;
    }
    result += formatMove(p, move, { lastMove });
    p.doMove(move, { ignoreValidation: true });
    lastMove = move;
  }
  for (; i < pv.length && i < maxLength; i++) {
    result += " " + pv[i];
  }
  if (i < pv.length) {
    result += " ...";
  }
  return result;
}

let nextInfoID = 0;

export class USIPlayerMonitor {
  public sfen = "";
  public nodes?: number;
  public nps?: number;
  public infoList: USIInfo[] = [];
  public hashfull?: number;
  public currentMove?: string;
  public currentMoveText?: string;
  public ponderMove?: string;
  public refreshOnNextUpdate = false;

  constructor(
    public sessionID: number,
    public name: string,
  ) {}

  /**
   * Returns latest info group.
   */
  get latestInfo(): USIInfo[] {
    const result: USIInfo[] = [];
    const multiPVSet = new Set();
    const moveSet = new Set();
    for (const info of this.infoList) {
      const move = info.pv ? info.pv[0] : undefined;
      // Break if the same multiPV index is found twice.
      if (move && multiPVSet.has(info.multiPV)) {
        break;
      }
      multiPVSet.add(info.multiPV);
      // Add the info if not already added.
      if (!moveSet.has(move)) {
        result.push(info);
        moveSet.add(move);
      }
    }
    return result.sort((a, b) => {
      return (a.multiPV || 1) - (b.multiPV || 1);
    });
  }

  update(sfen: string, update: USIInfoCommand, maxPVTextLength: number, ponderMove?: Move): void {
    if (this.sfen !== sfen || this.refreshOnNextUpdate) {
      this.sfen = sfen;
      this.nodes = undefined;
      this.nps = undefined;
      this.infoList = [];
      this.hashfull = undefined;
      this.currentMove = undefined;
      this.currentMoveText = undefined;
      this.ponderMove = undefined;
      this.refreshOnNextUpdate = false;
    }
    const position = Position.newBySFEN(sfen);
    if (!position) {
      return;
    }
    const info: USIInfo = {
      id: nextInfoID++,
      position: sfen,
      color: position.color,
    };
    const baseInfoKeyCount = 3;
    if (update.depth !== undefined) {
      info.depth = update.depth;
    }
    if (update.seldepth !== undefined) {
      info.selectiveDepth = update.seldepth;
    }
    if (update.timeMs !== undefined) {
      info.timeMs = update.timeMs;
    }
    if (update.nodes !== undefined) {
      this.nodes = update.nodes;
    }
    if (update.pv) {
      info.pv = update.pv;
      info.text = formatPV(position, update.pv, maxPVTextLength);
    }
    if (update.multipv !== undefined) {
      info.multiPV = update.multipv;
    }
    if (update.scoreCP !== undefined) {
      info.score = update.scoreCP;
    }
    if (update.scoreMate !== undefined) {
      info.scoreMate = update.scoreMate;
    }
    if (update.lowerbound !== undefined) {
      info.lowerBound = update.lowerbound;
    }
    if (update.upperbound !== undefined) {
      info.upperBound = update.upperbound;
    }
    if (update.currmove !== undefined) {
      this.currentMove = update.currmove;
      const move = position.createMoveByUSI(update.currmove);
      if (move) {
        this.currentMoveText = formatMove(position, move);
      }
    }
    if (update.hashfullPerMill !== undefined) {
      this.hashfull = update.hashfullPerMill / 1000;
    }
    if (update.nps !== undefined) {
      this.nps = update.nps;
    }
    if (update.string) {
      info.text = update.string;
    }
    this.ponderMove = ponderMove && formatMove(position, ponderMove);

    // 要素が何もない場合はリストに登録しない。
    if (Object.keys(info).length === baseInfoKeyCount) {
      return;
    }
    // USI プロトコルにおいて nodes は読み筋と関係なく定期的に送る事ができるとされている。
    // ただ、多くのエンジンが読み筋と一緒に送ってくるため読み筋等がある場合にはそちらにも記録する。
    if (update.nodes !== undefined) {
      info.nodes = update.nodes;
    }

    this.infoList.unshift(info);
  }

  endIteration() {
    this.refreshOnNextUpdate = true;
  }
}

type USIUpdate = {
  sessionID: number;
  sfen: string;
  name: string;
  info: USIInfoCommand;
  maxPVLength: number;
  ponderMove?: Move;
};

export class USIMonitor {
  private _sessions: USIPlayerMonitor[] = [];
  private updateQueue: USIUpdate[] = [];
  private timeoutHandle?: number;

  get sessions(): USIPlayerMonitor[] {
    return this._sessions;
  }

  update(
    sessionID: number,
    position: ImmutablePosition,
    name: string,
    info: USIInfoCommand,
    maxPVLength: number,
    ponderMove?: Move,
  ): void {
    this.updateQueue.push({
      sessionID,
      sfen: position.sfen,
      name,
      info,
      maxPVLength,
      ponderMove,
    });
    // 高頻度でコマンドが送られてくると描画が追いつかないので、一定時間ごとに反映する。
    if (!this.timeoutHandle) {
      this.timeoutHandle = window.setTimeout(() => {
        this.dequeue();
      }, 500);
    }
  }

  private dequeue() {
    // 終了しているセッションを検出して削除する。
    // ただし、現在の更新処理に含まれているセッションは削除しない。
    this._sessions = this._sessions.filter((session) => {
      return (
        isActiveUSIPlayerSession(session.sessionID) ||
        this.updateQueue.some((update) => update.sessionID === session.sessionID)
      );
    });

    for (const update of this.updateQueue) {
      this._update(update);
    }
    this.updateQueue = [];

    clearTimeout(this.timeoutHandle);
    this.timeoutHandle = undefined;
  }

  private _update(update: USIUpdate) {
    let monitor = this._sessions.find((session) => session.sessionID === update.sessionID);
    if (!monitor) {
      monitor = this.addSession(update.sessionID, update.name);
    }
    monitor.update(update.sfen, update.info, update.maxPVLength, update.ponderMove);
  }

  private addSession(sessionID: number, name: string): USIPlayerMonitor {
    const monitor = new USIPlayerMonitor(sessionID, name);
    this.sessions.push(monitor);
    this.sessions.sort((a, b) => {
      return a.sessionID - b.sessionID;
    });
    return monitor;
  }

  endIteration(sessionID: number) {
    const monitor = this._sessions.find((session) => session.sessionID === sessionID);
    if (monitor) {
      // Invoke asynchronously to prevent IPC message delay.
      setTimeout(() => {
        this.dequeue(); // flush the queue
        monitor.endIteration();
      });
    }
  }
}
