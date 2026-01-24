import { USIEngine, USIEngineLaunchOptions, emptyUSIEngine } from "@/common/settings/usi.js";
import { EngineProcess, GameResult as USIGameResult, TimeState, State } from "./engine.js";
import * as uri from "@/common/uri.js";
import { GameResult } from "@/common/game/result.js";
import { t } from "@/common/i18n/index.js";
import { resolveEnginePath } from "@/background/usi/path.js";
import { getUSILogger } from "@/background/log.js";
import { USISessionState } from "@/common/advanced/monitor.js";
import { CommandHistory, CommandType, Command } from "@/common/advanced/command.js";
import { USIInfoCommand } from "@/common/game/usi.js";
import { Color, getNextColorFromUSI } from "tsshogi";
import { TimeStates } from "@/common/game/time.js";
import { newUSIEngineStatsEntry, USIEngineStatsEntry } from "@/background/stats/types.js";

interface Handlers {
  onUSIBestMove(sessionID: number, usi: string, usiMove: string, ponder?: string): void;
  onUSICheckmate(sessionID: number, usi: string, usiMoves: string[]): void;
  onUSICheckmateNotImplemented(sessionID: number): void;
  onUSICheckmateTimeout(sessionID: number, usi: string): void;
  onUSINoMate(sessionID: number, usi: string): void;
  onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand): void;
  onEngineProcessStats(
    sessionID: number,
    usi: string,
    stats: USIEngineStatsEntry,
    launchTimeMs: number,
  ): void;
  sendPromptCommand(sessionID: number, command: Command): void;
}

let h: Handlers | undefined;

export function setHandlers(handlers: Handlers): void {
  if (h) {
    throw new Error("handlers already set");
  }
  h = handlers;
}

function newTimeoutError(timeoutSeconds: number): Error {
  return new Error(t.noResponseFromEnginePleaseExtendTimeout(timeoutSeconds));
}

function newUnexpectedError(message: string, lastReceived?: string): Error {
  if (!lastReceived) {
    return new Error(message);
  }
  return new Error(`${message}: ${t.lastReceived}=[${lastReceived}]`);
}

export function getUSIEngineInfo(path: string, timeoutSeconds: number): Promise<USIEngine> {
  const sessionID = issueSessionID();
  return new Promise<USIEngine>((resolve, reject) => {
    const process = new EngineProcess(resolveEnginePath(path), sessionID, getUSILogger(), {
      timeout: timeoutSeconds * 1e3,
    })
      .on("error", (err) => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(err.message, lastReceived));
      })
      .on("close", () => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(t.engineProcessWasClosedUnexpectedly, lastReceived));
      })
      .on("timeout", () => reject(newTimeoutError(timeoutSeconds)))
      .on("usiok", () => {
        resolve({
          ...emptyUSIEngine(),
          uri: uri.issueEngineURI(),
          name: process.name,
          defaultName: process.name,
          author: process.author,
          path,
          options: process.engineOptions,
        });
        process.quit();
      })
      .on("command", (command) => {
        h?.sendPromptCommand(sessionID, command);
      });
    process.launch();
  });
}

export function sendOptionButtonSignal(
  path: string,
  name: string,
  timeoutSeconds: number,
): Promise<void> {
  const sessionID = issueSessionID();
  return new Promise((resolve, reject) => {
    const process = new EngineProcess(resolveEnginePath(path), sessionID, getUSILogger(), {
      timeout: timeoutSeconds * 1e3,
    })
      .on("error", (err) => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(err.message, lastReceived));
      })
      .on("close", () => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(t.engineProcessWasClosedUnexpectedly, lastReceived));
      })
      .on("timeout", () => {
        reject(newTimeoutError(timeoutSeconds));
      })
      .on("usiok", () => {
        process.setOption(name);
        resolve();
        process.quit();
      })
      .on("command", (command) => {
        h?.sendPromptCommand(sessionID, command);
      });
    process.launch();
  });
}

type StatsTemporaryData = {
  nodes?: number;
  nps?: number;
  depth?: number;
  hashfullPerMill?: number;
};

type Session = {
  process: EngineProcess;
  engine: USIEngine;
  createdMs: number;
  stats: USIEngineStatsEntry;
  statsTempData?: StatsTemporaryData;
};

let lastSessionID = 0;

function issueSessionID(): number {
  lastSessionID += 1;
  return lastSessionID;
}

const sessions = new Map<number, Session>();
let sessionRemoveDelay = 20e3;

export function setSessionRemoveDelay(delay: number): void {
  sessionRemoveDelay = delay;
}

function newSession(process: EngineProcess, engine: USIEngine): Session {
  return {
    process,
    engine: engine,
    createdMs: Date.now(),
    stats: newUSIEngineStatsEntry(),
  };
}

function isSessionExists(sessionID: number): boolean {
  return sessions.has(sessionID);
}

function getSession(sessionID: number): Session {
  const session = sessions.get(sessionID);
  if (!session) {
    throw new Error("No engine session: SessionID=" + sessionID);
  }
  return session;
}

function updateStatsOnUSIOK(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.runCount += 1;
}

function updateStatsOnReady(sessionID: number, readyTimeMs: number): void {
  const session = getSession(sessionID);
  session.stats.gameCount += 1;
  session.stats.totalReadyTimeMs += readyTimeMs;
}

function updateStatsOnGo(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.goCount += 1;
  session.statsTempData = undefined;
}

function updateStatsOnGoPonder(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.goPonderCount += 1;
  session.statsTempData = undefined;
}

function updateStatsOnPonderHit(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.ponderHitCount += 1;
  session.statsTempData = undefined;
}

function updateStatsOnGoInfinite(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.goInfiniteCount += 1;
  session.statsTempData = undefined;
}

function updateStatsOnGoMate(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.goMateCount += 1;
  session.statsTempData = undefined;
}

function updateStatsOnGameover(sessionID: number, result: GameResult): void {
  const session = getSession(sessionID);
  switch (result) {
    case GameResult.WIN:
      session.stats.winCount += 1;
      break;
    case GameResult.LOSE:
      session.stats.loseCount += 1;
      break;
    case GameResult.DRAW:
      session.stats.drawCount += 1;
      break;
  }
}

function updateStatsOnUSIInfo(sessionID: number, info: USIInfoCommand): void {
  const session = getSession(sessionID);
  session.stats.maxNPS = Math.max(session.stats.maxNPS, info.nps ?? 0);
  if (info.depth && (!session.stats.maxDepth || session.stats.maxDepth < info.depth)) {
    session.stats.maxDepth = info.depth;
    session.stats.maxDepthTimeMs = info.timeMs ?? 0;
    session.stats.maxSelDepth = info.seldepth ?? info.depth;
  }
  if (info.depth) {
    if ((session.statsTempData?.depth ?? 0) < 20 && info.depth >= 20) {
      session.stats.depth20Count += 1;
      session.stats.depth20TotalTimeMs += info.timeMs ?? 0;
    }
    if ((session.statsTempData?.depth ?? 0) < 30 && info.depth >= 30) {
      session.stats.depth30Count += 1;
      session.stats.depth30TotalTimeMs += info.timeMs ?? 0;
    }
    if ((session.statsTempData?.depth ?? 0) < 40 && info.depth >= 40) {
      session.stats.depth40Count += 1;
      session.stats.depth40TotalTimeMs += info.timeMs ?? 0;
    }
    if ((session.statsTempData?.depth ?? 0) < 50 && info.depth >= 50) {
      session.stats.depth50Count += 1;
      session.stats.depth50TotalTimeMs += info.timeMs ?? 0;
    }
  }
  session.stats.maxHashUsagePercent = Math.max(
    session.stats.maxHashUsagePercent,
    (info.hashfullPerMill ?? 0) / 10,
  );
  session.statsTempData = {
    nodes: info.nodes ?? session.statsTempData?.nodes,
    nps: info.nps ?? session.statsTempData?.nps,
    depth: Math.max(info.depth || 0, session.statsTempData?.depth || 0),
    hashfullPerMill: info.hashfullPerMill ?? session.statsTempData?.hashfullPerMill,
  };
}

function updateStatsOnGoEndCommon(sessionID: number): void {
  const session = getSession(sessionID);
  session.stats.totalNodeCount += session.statsTempData?.nodes ?? 0;
  if (session.statsTempData?.nps) {
    session.stats.npsSampleCount += 1;
    session.stats.meanNPS =
      (session.stats.meanNPS * (session.stats.npsSampleCount - 1) + session.statsTempData.nps) /
      session.stats.npsSampleCount;
  }
  if (session.statsTempData?.hashfullPerMill) {
    const hashUsagePercent = session.statsTempData.hashfullPerMill / 10;
    session.stats.hashUsageSampleCount += 1;
    session.stats.meanHashUsagePercent =
      (session.stats.meanHashUsagePercent * (session.stats.hashUsageSampleCount - 1) +
        hashUsagePercent) /
      session.stats.hashUsageSampleCount;
    if (hashUsagePercent >= 50) {
      session.stats.hashUsageOver50PercentCount += 1;
    }
    if (hashUsagePercent >= 70) {
      session.stats.hashUsageOver70PercentCount += 1;
    }
    if (hashUsagePercent >= 90) {
      session.stats.hashUsageOver90PercentCount += 1;
    }
  }
}

function updateStatsOnGoEnd(sessionID: number, goTimeMs: number): void {
  const session = getSession(sessionID);
  session.stats.totalGoTimeMs += goTimeMs;
  updateStatsOnGoEndCommon(sessionID);
}

function updateStatsOnCheckMate(sessionID: number, mateTimeMs: number): void {
  const session = getSession(sessionID);
  session.stats.totalMateTimeMs += mateTimeMs;
  updateStatsOnGoEndCommon(sessionID);
}

function updateStatsOnClose(sessionID: number): void {
  const session = getSession(sessionID);
  const closedMs = Date.now();
  session.stats.totalUptimeMs += closedMs - session.createdMs;
}

export function setupPlayer(engine: USIEngine, options?: USIEngineLaunchOptions): Promise<number> {
  const sessionID = issueSessionID();
  const timeoutSeconds = options?.timeoutSeconds || 10;
  const process = new EngineProcess(resolveEnginePath(engine.path), sessionID, getUSILogger(), {
    timeout: timeoutSeconds * 1e3,
    engineOptions: Object.values(engine.options),
    enableEarlyPonder: engine.enableEarlyPonder,
    discardUSIInfo: options?.discardUSIInfo,
  });
  const session = newSession(process, engine);
  sessions.set(sessionID, session);
  return new Promise<number>((resolve, reject) => {
    process
      .on("close", () => {
        updateStatsOnClose(sessionID);
        h?.onEngineProcessStats(sessionID, engine.uri, session.stats, session.createdMs);
        setTimeout(() => {
          sessions.delete(sessionID);
        }, sessionRemoveDelay);
      })
      .on("error", (err) => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(err.message, lastReceived));
      })
      .on("timeout", () => reject(newTimeoutError(timeoutSeconds)))
      .on("bestmove", (usi, usiMove, ponder) => {
        h?.onUSIBestMove(sessionID, usi, usiMove, ponder);
      })
      .on("checkmate", (position, moves) => {
        h?.onUSICheckmate(sessionID, position, moves);
      })
      .on("checkmateNotImplemented", () => {
        h?.onUSICheckmateNotImplemented(sessionID);
      })
      .on("checkmateTimeout", (position) => {
        h?.onUSICheckmateTimeout(sessionID, position);
      })
      .on("noMate", (position) => {
        h?.onUSINoMate(sessionID, position);
      })
      .on("goEnd", (goTimeMs) => {
        updateStatsOnGoEnd(sessionID, goTimeMs);
      })
      .on("checkmateEnd", (mateTimeMs) => {
        updateStatsOnCheckMate(sessionID, mateTimeMs);
      })
      .on("usiok", () => {
        resolve(sessionID);
        updateStatsOnUSIOK(sessionID);
      })
      .on("command", (command) => {
        h?.sendPromptCommand(sessionID, command);
      });
    process.launch();
  });
}

export function ready(sessionID: number): Promise<void> {
  const session = getSession(sessionID);
  const process = session.process;
  return new Promise<void>((resolve, reject) => {
    process
      .on("ready", (readyTimeMs) => {
        resolve();
        updateStatsOnReady(sessionID, readyTimeMs);
      })
      .on("error", (err) => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(err.message, lastReceived));
      });
    const error = process.ready();
    if (error) {
      const lastReceived = process.lastReceived?.command;
      reject(newUnexpectedError(error.message, lastReceived));
    }
  });
}

export function setOption(sessionID: number, name: string, value: string): void {
  const session = getSession(sessionID);
  session.process.setOption(name, value);
}

function buildTimeState(color: Color, timeStates: TimeStates): TimeState {
  const black = timeStates.black;
  const white = timeStates.white;
  const byoyomi = timeStates[color].byoyomi;
  return {
    // NOTE:
    //   USI では btime + binc (または wtime + winc) が今回利用可能な時間を表すとしている。
    //   ShogiHome では既に加算した後の値を保持しているため、ここで減算する。
    btime: black.timeMs - black.increment * 1e3,
    wtime: white.timeMs - white.increment * 1e3,
    byoyomi: byoyomi * 1e3,
    // NOTE:
    //   USI で byoyomi と binc, winc の同時使用は認められていない。
    //   ShogiHome では一方が秒読みでもう一方がフィッシャーという設定も可能なので、
    //   自分が秒読みの場合はそれを優先し、相手の加算時間は記述しない。
    binc: byoyomi === 0 ? black.increment * 1e3 : 0,
    winc: byoyomi === 0 ? white.increment * 1e3 : 0,
  };
}

function onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand) {
  h?.onUSIInfo(sessionID, usi, info);
  updateStatsOnUSIInfo(sessionID, info);
}

export function go(sessionID: number, usi: string, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(usi);
  session.process.go(usi, buildTimeState(nextColor, timeStates));
  session.process.on("info", (usi, info) => onUSIInfo(sessionID, usi, info));
  updateStatsOnGo(sessionID);
}

export function goPonder(sessionID: number, usi: string, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(usi);
  session.process.goPonder(usi, buildTimeState(nextColor, timeStates));
  session.process.on("info", (usi, info) => onUSIInfo(sessionID, usi, info));
  updateStatsOnGoPonder(sessionID);
}

export function goInfinite(sessionID: number, usi: string): void {
  const session = getSession(sessionID);
  session.process.go(usi);
  session.process.on("info", (usi, info) => onUSIInfo(sessionID, usi, info));
  updateStatsOnGoInfinite(sessionID);
}

export function goMate(sessionID: number, usi: string, maxSeconds?: number): void {
  const session = getSession(sessionID);
  session.process.goMate(usi, maxSeconds);
  session.process.on("info", (usi, info) => onUSIInfo(sessionID, usi, info));
  updateStatsOnGoMate(sessionID);
}

export function ponderHit(sessionID: number, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(session.process.currentPosition);
  session.process.ponderHit(buildTimeState(nextColor, timeStates));
  updateStatsOnPonderHit(sessionID);
}

export function stop(sessionID: number): void {
  const session = getSession(sessionID);
  session.process.stop();
}

export function gameover(sessionID: number, result: GameResult): void {
  const session = getSession(sessionID);
  switch (result) {
    case GameResult.WIN:
      session.process.gameover(USIGameResult.WIN);
      break;
    case GameResult.LOSE:
      session.process.gameover(USIGameResult.LOSE);
      break;
    case GameResult.DRAW:
      session.process.gameover(USIGameResult.DRAW);
      break;
  }
  updateStatsOnGameover(sessionID, result);
}

export function quit(sessionID: number): void {
  if (!isSessionExists(sessionID)) {
    return;
  }
  const session = getSession(sessionID);
  session.process.quit();
}

export function quitAll(): void {
  sessions.forEach((session) => {
    session.process.quit();
  });
}

export function isActiveSessionExists(): boolean {
  for (const session of sessions.values()) {
    if (session.process.state !== State.QuitCompleted) {
      return true;
    }
  }
  return false;
}

export function collectSessionStates(): USISessionState[] {
  return Array.from(sessions.entries())
    .map(([id, session]) => ({
      sessionID: id,
      uri: session.engine.uri,
      name: session.engine.name,
      path: session.engine.path,
      pid: session.process.pid,
      stateCode: session.process.state,
      createdMs: session.createdMs,
      lastReceived: session.process.lastReceived,
      lastSent: session.process.lastSent,
      updatedMs: Date.now(),
      closed: session.process.state === State.QuitCompleted,
    }))
    .sort((a, b) => b.sessionID - a.sessionID);
}

export function getCommandHistory(sessionID: number): CommandHistory {
  const session = getSession(sessionID);
  return session.process.commandHistory;
}

export function invokeCommand(sessionID: number, type: CommandType, command: string): void {
  const session = getSession(sessionID);
  session.process.invoke(type, command);
}
