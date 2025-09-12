import { USIEngine, emptyUSIEngine } from "@/common/settings/usi.js";
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

interface Handlers {
  onUSIBestMove(sessionID: number, usi: string, usiMove: string, ponder?: string): void;
  onUSICheckmate(sessionID: number, usi: string, usiMoves: string[]): void;
  onUSICheckmateNotImplemented(sessionID: number): void;
  onUSICheckmateTimeout(sessionID: number, usi: string): void;
  onUSINoMate(sessionID: number, usi: string): void;
  onUSIInfo(sessionID: number, usi: string, info: USIInfoCommand): void;
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

type Session = {
  process: EngineProcess;
  engine: USIEngine;
  createdMs: number;
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

export function setupPlayer(engine: USIEngine, timeoutSeconds: number): Promise<number> {
  const sessionID = issueSessionID();
  const process = new EngineProcess(resolveEnginePath(engine.path), sessionID, getUSILogger(), {
    timeout: timeoutSeconds * 1e3,
    engineOptions: Object.values(engine.options),
    enableEarlyPonder: engine.enableEarlyPonder,
  });
  sessions.set(sessionID, {
    process,
    engine: engine,
    createdMs: Date.now(),
  });
  return new Promise<number>((resolve, reject) => {
    process
      .on("close", () => {
        setTimeout(() => {
          sessions.delete(sessionID);
        }, sessionRemoveDelay);
      })
      .on("error", (err) => {
        const lastReceived = process.lastReceived?.command;
        reject(newUnexpectedError(err.message, lastReceived));
      })
      .on("timeout", () => reject(newTimeoutError(timeoutSeconds)))
      .on("bestmove", (usi, usiMove, ponder) => h?.onUSIBestMove(sessionID, usi, usiMove, ponder))
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
      .on("usiok", () => resolve(sessionID))
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
    process.on("ready", resolve).on("error", (err) => {
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

export function go(sessionID: number, usi: string, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(usi);
  session.process.go(usi, buildTimeState(nextColor, timeStates));
  session.process.on("info", (usi, info) => h?.onUSIInfo(sessionID, usi, info));
}

export function goPonder(sessionID: number, usi: string, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(usi);
  session.process.goPonder(usi, buildTimeState(nextColor, timeStates));
  session.process.on("info", (usi, info) => h?.onUSIInfo(sessionID, usi, info));
}

export function goInfinite(sessionID: number, usi: string): void {
  const session = getSession(sessionID);
  session.process.go(usi);
  session.process.on("info", (usi, info) => h?.onUSIInfo(sessionID, usi, info));
}

export function goMate(sessionID: number, usi: string, maxSeconds?: number): void {
  const session = getSession(sessionID);
  session.process.goMate(usi, maxSeconds);
  session.process.on("info", (usi, info) => h?.onUSIInfo(sessionID, usi, info));
}

export function ponderHit(sessionID: number, timeStates: TimeStates): void {
  const session = getSession(sessionID);
  const nextColor = getNextColorFromUSI(session.process.currentPosition);
  session.process.ponderHit(buildTimeState(nextColor, timeStates));
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
