import { USIInfoCommand } from "@/common/game/usi";
import { Color, ImmutablePosition, Move, Position, formatMove } from "tsshogi";
import { isActiveUSIPlayerSession } from "@/renderer/players/usi";

export type USIIteration = {
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

let nextIterationID = 0;

export class USIPlayerMonitor {
  public sfen = "";
  public nodes?: number;
  public nps?: number;
  public iterations: USIIteration[] = [];
  public hashfull?: number;
  public currentMove?: string;
  public currentMoveText?: string;
  public ponderMove?: string;

  constructor(
    public sessionID: number,
    public name: string,
  ) {}

  get latestIteration(): USIIteration[] {
    const result: USIIteration[] = [];
    const multiPVSet = new Set();
    const moveSet = new Set();
    for (const iteration of this.iterations) {
      // やねうら王のワークアラウンド
      // 定跡にヒットした場合に、定跡のPVよりも後に不要な情報が送られてくるのでそれを無視する。
      if (
        (iteration.depth === 1 || iteration.depth === 0) &&
        iteration.selectiveDepth === 0 &&
        iteration.score === 0
      ) {
        continue;
      }
      const move = iteration.pv ? iteration.pv[0] : undefined;
      if (!multiPVSet.has(iteration.multiPV) && !moveSet.has(move)) {
        result.push(iteration);
        multiPVSet.add(iteration.multiPV);
        moveSet.add(move);
      }
    }
    return result.sort((a, b) => {
      return (a.multiPV || 1) - (b.multiPV || 1);
    });
  }

  update(sfen: string, update: USIInfoCommand, maxPVTextLength: number, ponderMove?: Move): void {
    if (this.sfen !== sfen) {
      this.sfen = sfen;
      this.nodes = undefined;
      this.nps = undefined;
      this.iterations = [];
      this.hashfull = undefined;
      this.currentMove = undefined;
      this.currentMoveText = undefined;
      this.ponderMove = undefined;
    }
    const position = Position.newBySFEN(sfen);
    if (!position) {
      return;
    }
    const iteration: USIIteration = {
      id: nextIterationID++,
      position: sfen,
      color: position.color,
    };
    if (update.depth !== undefined) {
      iteration.depth = update.depth;
    }
    if (update.seldepth !== undefined) {
      iteration.selectiveDepth = update.seldepth;
    }
    if (update.timeMs !== undefined) {
      iteration.timeMs = update.timeMs;
    }
    if (update.nodes !== undefined) {
      this.nodes = update.nodes;
    }
    if (update.pv) {
      iteration.pv = update.pv;
      iteration.text = formatPV(position, update.pv, maxPVTextLength);
    }
    if (update.multipv !== undefined) {
      iteration.multiPV = update.multipv;
    }
    if (update.scoreCP !== undefined) {
      iteration.score = update.scoreCP;
    }
    if (update.scoreMate !== undefined) {
      iteration.scoreMate = update.scoreMate;
    }
    if (update.lowerbound !== undefined) {
      iteration.lowerBound = update.lowerbound;
    }
    if (update.upperbound !== undefined) {
      iteration.upperBound = update.upperbound;
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
      iteration.text = update.string;
    }
    if (Object.keys(iteration).length !== 0) {
      // USI プロトコルにおいて nodes は読み筋と関係なく定期的に送る事ができるとされている。
      // ただ、多くのエンジンが読み筋と一緒に送ってくるため読み筋等がある場合にはそちらにも記録する。
      if (update.nodes !== undefined) {
        iteration.nodes = update.nodes;
      }
      this.iterations.unshift(iteration);
    }
    this.ponderMove = ponderMove && formatMove(position, ponderMove);
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
}
