import { Color, SpecialMoveType, importCSA, isKnownSpecialMove, reverseColor } from "tsshogi";
import {
  emptyCSAGameSummary,
  CSAGameSummary,
  CSAPlayerStates,
  emptyCSAPlayerStates,
  CSAGameResult,
  CSASpecialMove,
} from "@/common/game/csa.js";
import { CSAProtocolVersion, CSAServerSettings } from "@/common/settings/csa.js";
import { Socket } from "./socket.js";
import { Logger } from "@/background/log.js";
import { t } from "@/common/i18n/index.js";
import {
  Command,
  CommandHistory,
  addCommand,
  newCommand,
  CommandType,
} from "@/common/advanced/command.js";

type GameSummaryCallback = (gameSummary: CSAGameSummary) => void;
type RejectCallback = () => void;
type StartCallback = (playerStates: CSAPlayerStates) => void;
type MoveCallback = (move: string, playerStates: CSAPlayerStates) => void;
type GameResultCallback = (move: CSASpecialMove, result: CSAGameResult) => void;
type CloseCallback = () => void;
type ErrorCallback = (e: Error) => void;
type CommandCallback = (command: Command) => void;

export enum State {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  WAITING_GAME_SUMMARY = "waitingGameSummary",
  GAME_SUMMARY = "gameSummary",
  GAME_TIME = "gameTime",
  GAME_TIME_B = "gameTimeB",
  GAME_TIME_W = "gameTimeW",
  GAME_POSITION = "gamePosition",
  READY = "ready",
  WAITING_START = "waitingStart",
  WAITING_REJECT = "waitingReject",
  PLAYING = "playing",
  WAITING_LOGOUT = "waitingLogout",
  WAITING_CLOSE = "waitingClose",
  CLOSED = "closed",
}

export class Client {
  private _state: State = State.IDLE;
  private gameSummaryCallback?: GameSummaryCallback;
  private rejectCallback?: RejectCallback;
  private startCallback?: StartCallback;
  private moveCallback?: MoveCallback;
  private gameResultCallback?: GameResultCallback;
  private closeCallback?: CloseCallback;
  private errorCallback?: ErrorCallback;
  private commandCallback?: CommandCallback;
  private socket?: Socket;
  private gameSummary = emptyCSAGameSummary();
  private playerStates: CSAPlayerStates = emptyCSAPlayerStates();
  private specialMove = CSASpecialMove.UNKNOWN;
  private _lastReceived?: Command;
  private _lastSent?: Command;
  private _commandHistory: CommandHistory = {
    discarded: 0,
    commands: [],
  };
  private _createdMs: number = Date.now();
  private _loggedInMs?: number;
  private blankLinePingTimeout: NodeJS.Timeout | null = null;

  constructor(
    private _sessionID: number,
    private _settings: CSAServerSettings,
    private logger: Logger,
  ) {}

  get sessionID(): number {
    return this._sessionID;
  }

  get settings(): CSAServerSettings {
    return this._settings;
  }

  get state(): State {
    return this._state;
  }

  get lastReceived(): Command | undefined {
    return this._lastReceived;
  }

  get lastSent(): Command | undefined {
    return this._lastSent;
  }

  get commandHistory(): CommandHistory {
    return this._commandHistory;
  }

  get createdMs(): number {
    return this._createdMs;
  }

  get loggedInMs(): number | undefined {
    return this._loggedInMs;
  }

  on(event: "gameSummary", callback: GameSummaryCallback): this;
  on(event: "reject", callback: RejectCallback): this;
  on(event: "start", callback: StartCallback): this;
  on(event: "move", callback: MoveCallback): this;
  on(event: "gameResult", callback: GameResultCallback): this;
  on(event: "close", callback: CloseCallback): this;
  on(event: "error", callback: ErrorCallback): this;
  on(event: "command", callback: CommandCallback): this;
  on(event: string, callback: unknown): this {
    switch (event) {
      case "gameSummary":
        this.gameSummaryCallback = callback as GameSummaryCallback;
        break;
      case "reject":
        this.rejectCallback = callback as RejectCallback;
        break;
      case "start":
        this.startCallback = callback as StartCallback;
        break;
      case "move":
        this.moveCallback = callback as MoveCallback;
        break;
      case "gameResult":
        this.gameResultCallback = callback as GameResultCallback;
        break;
      case "close":
        this.closeCallback = callback as CloseCallback;
        break;
      case "error":
        this.errorCallback = callback as ErrorCallback;
        break;
      case "command":
        this.commandCallback = callback as CommandCallback;
        break;
    }
    return this;
  }

  login(): void {
    this.logger.info(
      "sid=%d: connecting to %s:%d",
      this.sessionID,
      this.settings.host,
      this.settings.port,
    );
    this._state = State.CONNECTING;
    this.socket = new Socket(
      this.settings.host,
      this.settings.port,
      {
        onConnect: this.onConnect.bind(this),
        onError: this.onConnectionError.bind(this),
        onFIN: this.onFIN.bind(this),
        onClose: this.onClose.bind(this),
        onRead: this.onRead.bind(this),
      },
      {
        keepaliveInitialDelay: this.settings.tcpKeepalive.initialDelay,
      },
    );
  }

  logout(): void {
    switch (this.settings.protocolVersion) {
      case CSAProtocolVersion.V121_FLOODGATE:
        // Floodgate では LOGOUT コマンドを使用しない。
        if (this.socket) {
          this.logger.info("sid=%d: disconnect", this.sessionID);
          this.socket.end();
          this._state = State.WAITING_CLOSE;
        }
        break;
      default:
        if (
          this.state === State.WAITING_GAME_SUMMARY ||
          this.state === State.GAME_SUMMARY ||
          this.state === State.GAME_TIME ||
          this.state === State.GAME_TIME_B ||
          this.state === State.GAME_TIME_W ||
          this.state === State.GAME_POSITION ||
          this.state === State.READY
        ) {
          this.send("LOGOUT");
          this._state = State.WAITING_LOGOUT;
        }
        break;
    }
  }

  agree(gameID: string): void {
    if (this.state !== State.READY) {
      return;
    }
    if (gameID !== this.gameSummary.id) {
      return;
    }
    this._state = State.WAITING_START;
    this.send(`AGREE ${this.gameSummary.id}`);
  }

  reject(gameID: string): void {
    if (this.state !== State.READY) {
      return;
    }
    if (gameID !== this.gameSummary.id) {
      return;
    }
    this._state = State.WAITING_REJECT;
    this.send(`REJECT ${this.gameSummary.id}`);
  }

  doMove(move: string, score?: number, pv?: string): void {
    if (this.state !== State.PLAYING) {
      return;
    }
    let command = move;
    if (score !== undefined) {
      command += `,'* ${Math.round(score)}`;
      if (pv !== undefined) {
        command += ` ${pv}`;
      }
    }
    this.send(command);
  }

  resign(): void {
    if (this.state !== State.PLAYING) {
      return;
    }
    this.send("%TORYO");
  }

  win(): void {
    if (this.state !== State.PLAYING) {
      return;
    }
    this.send("%KACHI");
  }

  stop(): void {
    if (this.state !== State.PLAYING) {
      return;
    }
    this.send("%CHUDAN");
  }

  private send(command: string): void {
    if (!this.socket) {
      this.logger.error(
        "sid=%d: failed to send command caused by invalid socket: %s",
        this.sessionID,
        command,
      );
      return;
    }
    this.socket.write(command);
    this._lastSent = newCommand(CommandType.SEND, this.hideSecureValues(command));
    this.updateCommendHistory(this._lastSent);
    this.commandCallback?.(this._lastSent);
    this.logger.info("sid=%d: > %s", this.sessionID, this.hideSecureValues(command));
    this.setBlankLinePing(command);
  }

  private hideSecureValues(command: string): string {
    if (this.settings.password) {
      command = command.replaceAll(this.settings.password, "*****");
    }
    return command;
  }

  private onConnect(): void {
    this.logger.info("sid=%d: connected", this.sessionID);
    this._state = State.CONNECTED;
    let suffix = "";
    if (this.settings.protocolVersion === CSAProtocolVersion.V121_X1) {
      suffix = " x1";
    }
    this.send(`LOGIN ${this.settings.id} ${this.settings.password}${suffix}`);
  }

  private onConnectionError(e: Error): void {
    if (this.state === State.CLOSED) {
      return;
    }
    this.onError(e);
    this._state = State.CLOSED;
    this.closeCallback?.();
    const command = newCommand(CommandType.SYSTEM, "connection error");
    this.updateCommendHistory(command);
    this.commandCallback?.(command);
  }

  private onError(e: Error): void {
    this.logger.error("sid=%d: error: %s %s", this.sessionID, e.name, e.message);
    this.errorCallback?.(e);
  }

  private onFIN(): void {
    this.logger.info("sid=%d: FIN packet received", this.sessionID);
    this.clearBlankLinePing();
  }

  private onClose(hadError: boolean): void {
    this.clearBlankLinePing();
    if (this.state === State.CLOSED) {
      return;
    }
    switch (this.state) {
      case State.WAITING_GAME_SUMMARY:
      case State.WAITING_LOGOUT:
      case State.WAITING_CLOSE:
        if (!hadError) {
          this.logger.info("sid=%d: socket closed", this.sessionID);
        } else {
          this.onError(new Error(t.errorOccuredWhileDisconnectingFromCSAServer));
        }
        break;
      case State.CONNECTING:
        this.onError(new Error(t.failedToConnectToCSAServer));
        break;
      default:
        this.onError(new Error(t.disconnectedFromCSAServer));
        break;
    }
    this._state = State.CLOSED;
    this.closeCallback?.();
    const command = newCommand(CommandType.SYSTEM, hadError ? "closed (error)" : "closed");
    this.updateCommendHistory(command);
    this.commandCallback?.(command);
  }

  private onRead(command: string): void {
    this.setBlankLinePing();
    this._lastReceived = newCommand(CommandType.RECEIVE, command);
    this.updateCommendHistory(this._lastReceived);
    this.commandCallback?.(this._lastReceived);
    this.logger.info("sid=%d: < %s", this.sessionID, command);
    if (command === "") {
      return;
    }
    if (this.state === State.GAME_SUMMARY) {
      this.onGameSummary(command);
    } else if (this.state === State.GAME_TIME) {
      this.onGameTime(command);
    } else if (this.state === State.GAME_TIME_B) {
      this.onGameTime(command, Color.BLACK);
    } else if (this.state === State.GAME_TIME_W) {
      this.onGameTime(command, Color.WHITE);
    } else if (this.state === State.GAME_POSITION) {
      this.onGamePosition(command);
    } else if (this.state === State.PLAYING) {
      this.onMove(command);
    } else if (/^LOGIN:.* OK$/.test(command)) {
      this.onLoginOK();
    } else if (command === "LOGIN:incorrect") {
      this.onLoginIncorrect();
    } else if (command === "LOGOUT:completed") {
      this.onLogout();
    } else if (command === "BEGIN Game_Summary") {
      this.onBeginGameSummary();
    } else if (command.startsWith("REJECT:")) {
      this.onReject();
    } else if (command.startsWith("START:")) {
      this.onStart();
    } else {
      this.logger.warn("sid=%d: unknown command received", this.sessionID);
    }
  }

  private onLoginOK(): void {
    this._loggedInMs = Date.now();
    this.logger.info("sid=%d: login ok", this.sessionID);
    this._state = State.WAITING_GAME_SUMMARY;
  }

  private onLoginIncorrect(): void {
    this.onError(new Error(t.csaServerLoginDenied));
    if (!this.socket) {
      return;
    }
    this.socket.end();
  }

  private onLogout(): void {
    this.logger.info("sid=%d: logout", this.sessionID);
    this._state = State.WAITING_CLOSE;
  }

  private onBeginGameSummary(): void {
    this._state = State.GAME_SUMMARY;
    this.gameSummary = emptyCSAGameSummary();
  }

  private onEndGameSummary(): void {
    // 残り時間を初期化する。その際、初回分の Increment を与える。
    const blackTime = this.gameSummary.players.black.time;
    const whiteTime = this.gameSummary.players.white.time;
    this.playerStates.black.time = blackTime.totalTime + blackTime.increment;
    this.playerStates.white.time = whiteTime.totalTime + whiteTime.increment;

    // 途中から再開する場合に、前回消費した時間を計算する。
    const record = importCSA(this.gameSummary.position);
    if (record instanceof Error) {
      this.onError(new Error("invalid game position received from CSA server"));
      this.logout();
      return;
    }
    for (const entry of record.moves) {
      if (isKnownSpecialMove(entry.move) && entry.move.type === SpecialMoveType.START) {
        continue;
      }
      const color = reverseColor(entry.nextColor);
      this.updateTime(color, entry.elapsedMs);
    }

    this._state = State.READY;
    this.gameSummaryCallback?.(this.gameSummary);
  }

  private onGameSummary(command: string): void {
    switch (command) {
      case "END Game_Summary":
        this.onEndGameSummary();
        return;
      case "BEGIN Time":
        this._state = State.GAME_TIME;
        return;
      case "BEGIN Time+":
        this._state = State.GAME_TIME_B;
        return;
      case "BEGIN Time-":
        this._state = State.GAME_TIME_W;
        return;
      case "BEGIN Position":
        this._state = State.GAME_POSITION;
        return;
    }
    const [key, value] = command.split(":", 2);
    switch (key) {
      case "Protocol_Version":
        // TODO: サポートしないバージョンならエラーにする。
        break;
      case "Protocol_Mode":
        // TODO: サポートしないモードならエラーにする。
        break;
      case "Format":
        // TODO: 知らないフォーマットならエラーにする。
        break;
      case "Declaration":
        // TODO: v1.2 では Jishogi 1.1 のみ許可されている。
        break;
      case "Rematch_On_Draw":
        // TODO: YES は v1.2 で使用できないのでエラーにする。
        break;
      case "Max_Moves":
        // TODO: USI 経由でエンジンに伝える方法がなさそう。
        break;
      case "Game_ID":
        this.gameSummary.id = value;
        break;
      case "Name+":
        this.gameSummary.players.black.playerName = value;
        break;
      case "Name-":
        this.gameSummary.players.white.playerName = value;
        break;
      case "Your_Turn":
        this.gameSummary.myColor = value === "+" ? Color.BLACK : Color.WHITE;
        break;
      case "To_Move":
        this.gameSummary.toMove = value === "+" ? Color.BLACK : Color.WHITE;
        break;
      default:
        this.logger.warn("sid=%d: unknown command received", this.sessionID);
        break;
    }
  }

  private onGameTime(command: string, color?: Color): void {
    switch (command) {
      case "END Time":
      case "END Time+":
      case "END Time-":
        this._state = State.GAME_SUMMARY;
        return;
    }

    // 対象の手番が指定されている場合は、その手番のみを設定する。
    // そうでない場合は、両方の手番に設定する。
    const timeConfigSet = color
      ? [this.gameSummary.players[color].time]
      : [this.gameSummary.players.black.time, this.gameSummary.players.white.time];
    const [key, value] = command.split(":", 2);
    switch (key) {
      case "Least_Time_Per_Move":
      case "Time_Roundup":
        // do nothing
        break;
      case "Time_Unit":
        for (const timeConfig of timeConfigSet) {
          if (value.endsWith("msec")) {
            timeConfig.timeUnitMs = Number(value.slice(0, -4));
          } else if (value.endsWith("sec")) {
            timeConfig.timeUnitMs = Number(value.slice(0, -3)) * 1e3;
          } else if (value.endsWith("min")) {
            timeConfig.timeUnitMs = Number(value.slice(0, -3)) * 60 * 1e3;
          }
        }
        break;
      case "Total_Time":
        for (const timeConfig of timeConfigSet) {
          timeConfig.totalTime = Number(value);
        }
        break;
      case "Byoyomi":
        for (const timeConfig of timeConfigSet) {
          timeConfig.byoyomi = Number(value);
        }
        break;
      case "Delay":
        for (const timeConfig of timeConfigSet) {
          timeConfig.delay = Number(value);
        }
        break;
      case "Increment":
        for (const timeConfig of timeConfigSet) {
          timeConfig.increment = Number(value);
        }
        break;
      default:
        this.logger.warn("sid=%d: unknown command received", this.sessionID);
        break;
    }
  }

  private onGamePosition(command: string): void {
    if (command === "END Position") {
      this._state = State.GAME_SUMMARY;
      return;
    }
    this.gameSummary.position += command + "\n";
  }

  private onReject(): void {
    this._state = State.WAITING_GAME_SUMMARY;
    this.rejectCallback?.();
  }

  private onStart(): void {
    this._state = State.PLAYING;
    this.startCallback?.(this.playerStates);
  }

  private onMove(command: string): void {
    if (command.startsWith("+")) {
      this.onMoveWithColor(command, Color.BLACK);
    } else if (command.startsWith("-")) {
      this.onMoveWithColor(command, Color.WHITE);
    } else if (command.startsWith("#")) {
      this.onEndingCommand(command);
    } else if (command.startsWith("%")) {
      // noop
    } else {
      this.logger.warn("sid=%d: unknown move command received", this.sessionID);
    }
  }

  private onMoveWithColor(command: string, color: Color): void {
    const parsed = /^.*,T([0-9]+)$/.exec(command);
    if (parsed) {
      const elapsed = Number(parsed[1]);
      this.updateTime(color, elapsed * 1e3);
    } else {
      this.logger.error("sid=%d: invalid move format", this.sessionID);
    }
    this.moveCallback?.(command, this.playerStates);
  }

  private updateTime(color: Color, elapsedMs: number): void {
    const timeConfig = this.gameSummary.players[color].time;
    const elapsed = elapsedMs / timeConfig.timeUnitMs;
    const time = this.playerStates[color].time - elapsed + timeConfig.increment;
    this.playerStates[color].time = Math.max(time, 0);
  }

  private onEndingCommand(command: string): void {
    switch (command) {
      // 特殊な指し手
      case "#RESIGN":
        this.specialMove = CSASpecialMove.RESIGN;
        break;
      case "#SENNICHITE":
        this.specialMove = CSASpecialMove.SENNICHITE;
        break;
      case "#OUTE_SENNICHITE":
        this.specialMove = CSASpecialMove.OUTE_SENNICHITE;
        break;
      case "#ILLEGAL_MOVE":
        this.specialMove = CSASpecialMove.ILLEGAL_MOVE;
        break;
      case "#ILLEGAL_ACTION":
        this.specialMove = CSASpecialMove.ILLEGAL_ACTION;
        break;
      case "#TIME_UP":
        this.specialMove = CSASpecialMove.TIME_UP;
        break;
      case "#JISHOGI":
        this.specialMove = CSASpecialMove.JISHOGI;
        break;
      case "#MAX_MOVES":
        this.specialMove = CSASpecialMove.MAX_MOVES;
        break;

      // 対局結果
      case "#WIN":
        this.onGameResult(CSAGameResult.WIN);
        break;
      case "#LOSE":
        this.onGameResult(CSAGameResult.LOSE);
        break;
      case "#DRAW":
        this.onGameResult(CSAGameResult.DRAW);
        break;
      case "#CENSORED":
        this.onGameResult(CSAGameResult.CENSORED);
        break;
      case "#CHUDAN":
        this.onGameResult(CSAGameResult.CHUDAN);
        break;
    }
  }

  private onGameResult(gameResult: CSAGameResult) {
    this._state = State.WAITING_GAME_SUMMARY;
    this.gameResultCallback?.(this.specialMove, gameResult);
  }

  invoke(type: CommandType, command: string): void {
    switch (type) {
      case CommandType.SEND:
        this.send(command);
        break;
      case CommandType.RECEIVE:
        this.onRead(command);
        break;
    }
  }

  private setBlankLinePing(lastSent?: string): void {
    if (!this.settings.blankLinePing) {
      return;
    }
    this.clearBlankLinePing();
    this.blankLinePingTimeout = setTimeout(
      () => {
        this.send("");
      },
      (lastSent === ""
        ? this.settings.blankLinePing.interval
        : this.settings.blankLinePing.initialDelay) * 1e3,
    );
  }

  private clearBlankLinePing(): void {
    if (this.blankLinePingTimeout) {
      clearTimeout(this.blankLinePingTimeout);
      this.blankLinePingTimeout = null;
    }
  }

  private updateCommendHistory(command: Command): void {
    addCommand(this._commandHistory, command, 100, 10);
  }
}
