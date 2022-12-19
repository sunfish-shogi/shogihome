import { Client } from "@/ipc/background/csa/client";
import { Socket } from "@/ipc/background/csa/socket";
import { CSAGameResult, CSASpecialMove } from "@/ipc/csa";
import { Color } from "@/shogi";
import * as log4js from "log4js";
import { csaServerSetting } from "../../../mock/csa";

jest.mock("@/ipc/background/csa/socket");

const mockSocket = Socket as jest.MockedClass<typeof Socket>;

const mockGameSummary = [
  "BEGIN Game_Summary",
  "Protocol_Version:1.2",
  "Protocol_Mode:Server",
  "Format:Shogi 1.0",
  "Declaration:Jishogi 1.1",
  "Game_ID:20150505-CSA25-3-5-7",
  "Name+:TANUKI",
  "Name-:KITSUNE",
  "Your_Turn:-",
  "Rematch_On_Draw:NO",
  "To_Move:+",
  "Max_Moves:256",
  "BEGIN Time",
  "Time_Unit:1sec",
  "Total_Time:600",
  "Byoyomi:10",
  "Least_Time_Per_Move:1",
  "END Time",
  "BEGIN Position",
  "局面1行目",
  "局面2行目",
  "END Position",
];

function bindHandlers(client: Client) {
  const handlers = {
    mockOnGameSummary: jest.fn(),
    mockOnReject: jest.fn(),
    mockOnStart: jest.fn(),
    mockOnMove: jest.fn(),
    mockOnGameResult: jest.fn(),
    mockOnClose: jest.fn(),
    mockOnError: jest.fn(),
  };
  client.on("gameSummary", handlers.mockOnGameSummary);
  client.on("reject", handlers.mockOnReject);
  client.on("start", handlers.mockOnStart);
  client.on("move", handlers.mockOnMove);
  client.on("gameResult", handlers.mockOnGameResult);
  client.on("close", handlers.mockOnClose);
  client.on("error", handlers.mockOnError);
  return handlers;
}

describe("ipc/background/csa/client", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("singleGame/winByResign", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    expect(mockSocket).toBeCalledTimes(0);
    client.login();
    expect(mockSocket).toBeCalledTimes(1);
    expect(mockSocket.mock.calls[0][0]).toBe("test-server");
    expect(mockSocket.mock.calls[0][1]).toBe(4081);
    const socketHandlers = mockSocket.mock.calls[0][2];
    expect(mockSocket.prototype.write).toBeCalledTimes(0);
    socketHandlers.onConnect();
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    expect(mockSocket.prototype.write.mock.calls[0][0]).toBe(
      "LOGIN TestPlayer test-password"
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(0);
    socketHandlers.onRead("END Game_Summary");
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      blackPlayerName: "TANUKI",
      whitePlayerName: "KITSUNE",
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
      timeUnitMs: 1000,
      totalTime: 600,
      byoyomi: 10,
      delay: 0,
      increment: 0,
    });
    client.agree("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe(
      "AGREE 20150505-CSA25-3-5-7"
    );
    expect(clientHandlers.mockOnStart).toBeCalledTimes(0);
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 600 },
      white: { time: 600 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T11");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T11");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 589 },
      white: { time: 600 },
    });
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.doMove("-3334FU");
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("-3334FU");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T8");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T8");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 589 },
      white: { time: 592 },
    });
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(0);
    socketHandlers.onRead("%TORYO,T20");
    socketHandlers.onRead("#RESIGN");
    socketHandlers.onRead("#WIN");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(
      CSASpecialMove.RESIGN
    );
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(
      CSAGameResult.WIN
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(4);
    expect(mockSocket.prototype.write.mock.calls[3][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
  });

  it("singleGame/loseByResign", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    socketHandlers.onRead("END Game_Summary");
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    socketHandlers.onRead("+7776FU,T11");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.resign();
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("%TORYO");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(0);
    socketHandlers.onRead("%TORYO,T20");
    socketHandlers.onRead("#RESIGN");
    socketHandlers.onRead("#LOSE");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(
      CSASpecialMove.RESIGN
    );
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(
      CSAGameResult.LOSE
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(4);
    expect(mockSocket.prototype.write.mock.calls[3][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
  });

  it("singleGame/floodgateComment", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    expect(mockSocket).toBeCalledTimes(0);
    client.login();
    expect(mockSocket).toBeCalledTimes(1);
    expect(mockSocket.mock.calls[0][0]).toBe("test-server");
    expect(mockSocket.mock.calls[0][1]).toBe(4081);
    const socketHandlers = mockSocket.mock.calls[0][2];
    expect(mockSocket.prototype.write).toBeCalledTimes(0);
    socketHandlers.onConnect();
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    expect(mockSocket.prototype.write.mock.calls[0][0]).toBe(
      "LOGIN TestPlayer test-password"
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(0);
    socketHandlers.onRead("END Game_Summary");
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      blackPlayerName: "TANUKI",
      whitePlayerName: "KITSUNE",
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
      timeUnitMs: 1000,
      totalTime: 600,
      byoyomi: 10,
      delay: 0,
      increment: 0,
    });
    client.agree("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe(
      "AGREE 20150505-CSA25-3-5-7"
    );
    expect(clientHandlers.mockOnStart).toBeCalledTimes(0);
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 600 },
      white: { time: 600 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T11");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T11");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 589 },
      white: { time: 600 },
    });
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.doMove("-3334FU", 45);
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("-3334FU,'* 45");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T8");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T8");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 589 },
      white: { time: 592 },
    });
    socketHandlers.onRead("+2726FU,T6");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(3);
    expect(clientHandlers.mockOnMove.mock.calls[2][0]).toBe("+2726FU,T6");
    expect(clientHandlers.mockOnMove.mock.calls[2][1]).toStrictEqual({
      black: { time: 583 },
      white: { time: 592 },
    });
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    client.doMove("-8384FU", 60, "+2625FU -8485FU +6978KI -4132KI");
    expect(mockSocket.prototype.write).toBeCalledTimes(4);
    expect(mockSocket.prototype.write.mock.calls[3][0]).toBe(
      "-8384FU,'* 60 +2625FU -8485FU +6978KI -4132KI"
    );
    expect(clientHandlers.mockOnMove).toBeCalledTimes(3);
    socketHandlers.onRead("-8384FU,T5");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(4);
    expect(clientHandlers.mockOnMove.mock.calls[3][0]).toBe("-8384FU,T5");
    expect(clientHandlers.mockOnMove.mock.calls[3][1]).toStrictEqual({
      black: { time: 583 },
      white: { time: 587 },
    });
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(0);
    socketHandlers.onRead("%TORYO,T20");
    socketHandlers.onRead("#RESIGN");
    socketHandlers.onRead("#WIN");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(
      CSASpecialMove.RESIGN
    );
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(
      CSAGameResult.WIN
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(4);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(5);
    expect(mockSocket.prototype.write.mock.calls[4][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
  });

  it("reject", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    socketHandlers.onRead("END Game_Summary");
    client.reject("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe(
      "REJECT 20150505-CSA25-3-5-7"
    );
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
    socketHandlers.onRead("REJECT:20150505-CSA25-3-5-7 by Player1");
    expect(clientHandlers.mockOnReject).toBeCalledTimes(1);
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
  });

  it("rejectByAnotherPlayer", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    socketHandlers.onRead("END Game_Summary");
    client.agree("20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
    socketHandlers.onRead("REJECT:20150505-CSA25-3-5-7 by Player2");
    expect(clientHandlers.mockOnReject).toBeCalledTimes(1);
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
  });

  it("stop", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    socketHandlers.onRead("END Game_Summary");
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    socketHandlers.onRead("+7776FU,T11");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    client.stop();
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    expect(mockSocket.prototype.write.mock.calls[2][0]).toBe("%CHUDAN");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(0);
    socketHandlers.onRead("#CHUDAN");
    expect(clientHandlers.mockOnGameResult).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(
      CSASpecialMove.UNKNOWN
    );
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(
      CSAGameResult.CHUDAN
    );
    expect(mockSocket.prototype.write).toBeCalledTimes(3);
    client.logout();
    expect(mockSocket.prototype.write).toBeCalledTimes(4);
    expect(mockSocket.prototype.write.mock.calls[3][0]).toBe("LOGOUT");
    socketHandlers.onRead("LOGOUT:completed");
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
    expect(clientHandlers.mockOnReject).toBeCalledTimes(0);
  });

  it("loginIncorrect", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    expect(clientHandlers.mockOnError).toBeCalledTimes(0);
    expect(mockSocket.prototype.end).toBeCalledTimes(0);
    socketHandlers.onRead("LOGIN:incorrect");
    expect(clientHandlers.mockOnError).toBeCalledTimes(1);
    expect(clientHandlers.mockOnError.mock.calls[0][0].toString()).toBe(
      "Error: CSAサーバーへのログインが拒否されました。"
    );
    expect(mockSocket.prototype.end).toBeCalledTimes(1);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnError).toBeCalledTimes(2);
    expect(clientHandlers.mockOnError.mock.calls[1][0].toString()).toBe(
      "Error: CSAサーバーへの接続が切れました。"
    );
  });

  it("failedToConnect", async () => {
    const client = new Client(123, csaServerSetting, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    expect(clientHandlers.mockOnError).toBeCalledTimes(0);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(true);
    expect(clientHandlers.mockOnError).toBeCalledTimes(1);
    expect(clientHandlers.mockOnError.mock.calls[0][0].toString()).toBe(
      "Error: CSAサーバーへ接続できませんでした。"
    );
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
  });
});
