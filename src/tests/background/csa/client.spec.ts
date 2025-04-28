import { Client } from "@/background/csa/client.js";
import { Socket } from "@/background/csa/socket.js";
import { CSAGameResult, CSASpecialMove } from "@/common/game/csa.js";
import { Color } from "tsshogi";
import * as log4js from "log4js";
import { csaServerSettings } from "@/tests/mock/csa.js";
import { MockedClass } from "vitest";

vi.mock("@/background/csa/socket.js");

const mockSocket = Socket as MockedClass<typeof Socket>;

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
  "END Game_Summary",
];

const mockGameSummaryWithIncrement = [
  "BEGIN Game_Summary",
  "Protocol_Version:1.2",
  "Protocol_Mode:Server",
  "Format:Shogi 1.0",
  "Declaration:Jishogi 1.1",
  "Game_ID:20150505-CSA25-3-5-7",
  "Name+:TANUKI",
  "Name-:KITSUNE",
  "Your_Turn:+",
  "Rematch_On_Draw:NO",
  "To_Move:+",
  "Max_Moves:256",
  "BEGIN Time",
  "Time_Unit:1sec",
  "Total_Time:900",
  "Increment:5",
  "Least_Time_Per_Move:0",
  "END Time",
  "BEGIN Position",
  "局面1行目",
  "局面2行目",
  "END Position",
  "END Game_Summary",
];

const mockGameSummaryWithMoves = [
  "BEGIN Game_Summary",
  "Protocol_Version:1.2",
  "Protocol_Mode:Server",
  "Format:Shogi 1.0",
  "Declaration:Jishogi 1.1",
  "Game_ID:20150505-CSA25-3-5-7",
  "Name+:TANUKI",
  "Name-:KITSUNE",
  "Your_Turn:+",
  "Rematch_On_Draw:NO",
  "To_Move:+",
  "Max_Moves:256",
  "BEGIN Time",
  "Time_Unit:1sec",
  "Total_Time:900",
  "Increment:5",
  "Least_Time_Per_Move:0",
  "END Time",
  "BEGIN Position",
  "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY",
  "P2 * -HI *  *  *  *  * -KA * ",
  "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU",
  "P4 *  *  *  *  *  *  *  *  * ",
  "P5 *  *  *  *  *  *  *  *  * ",
  "P6 *  *  *  *  *  *  *  *  * ",
  "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU",
  "P8 * +KA *  *  *  *  * +HI * ",
  "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY",
  "P+",
  "P-",
  "+",
  "+2726FU,T12",
  "-3334FU,T6",
  "+7776FU,T5",
  "-8384FU,T7",
  "END Position",
  "END Game_Summary",
];

const mockGameSummary1msec = [
  "BEGIN Game_Summary",
  "Protocol_Version:1.2",
  "Protocol_Mode:Server",
  "Format:Shogi 1.0",
  "Declaration:Jishogi 1.1",
  "Game_ID:20150505-CSA25-3-5-7",
  "Name+:TANUKI",
  "Name-:KITSUNE",
  "Your_Turn:+",
  "Rematch_On_Draw:NO",
  "To_Move:+",
  "Max_Moves:256",
  "BEGIN Time",
  "Time_Unit:1msec",
  "Total_Time:900000",
  "Increment:5000",
  "Least_Time_Per_Move:0",
  "END Time",
  "BEGIN Position",
  "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY",
  "P2 * -HI *  *  *  *  * -KA * ",
  "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU",
  "P4 *  *  *  *  *  *  *  *  * ",
  "P5 *  *  *  *  *  *  *  *  * ",
  "P6 *  *  *  *  *  *  *  *  * ",
  "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU",
  "P8 * +KA *  *  *  *  * +HI * ",
  "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY",
  "P+",
  "P-",
  "+",
  "+2726FU,T12",
  "-3334FU,T6",
  "+7776FU,T5",
  "-8384FU,T7",
  "END Position",
  "END Game_Summary",
];

const mockGameSummary1min = [
  "BEGIN Game_Summary",
  "Protocol_Version:1.2",
  "Protocol_Mode:Server",
  "Format:Shogi 1.0",
  "Declaration:Jishogi 1.1",
  "Game_ID:20150505-CSA25-3-5-7",
  "Name+:TANUKI",
  "Name-:KITSUNE",
  "Your_Turn:+",
  "Rematch_On_Draw:NO",
  "To_Move:+",
  "Max_Moves:256",
  "BEGIN Time",
  "Time_Unit:1min",
  "Total_Time:15",
  "Byoyomi:1",
  "Least_Time_Per_Move:0",
  "END Time",
  "BEGIN Position",
  "局面1行目",
  "局面2行目",
  "END Position",
  "END Game_Summary",
];

const mockGameSummaryInvalidPosition = [
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
  "+2726FU,T12",
  "END Position",
  "END Game_Summary",
];

const mockGameSummaryWithUnequalTime = [
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
  "BEGIN Time+",
  "Time_Unit:1sec",
  "Total_Time:300",
  "Byoyomi:10",
  "Least_Time_Per_Move:1",
  "END Time+",
  "BEGIN Time-",
  "Time_Unit:1sec",
  "Total_Time:600",
  "Byoyomi:30",
  "Least_Time_Per_Move:1",
  "END Time-",
  "BEGIN Position",
  "局面1行目",
  "局面2行目",
  "END Position",
  "END Game_Summary",
];

const mockGameSummaryWithUnequalTimeAndIncremnt = [
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
  "BEGIN Time+",
  "Time_Unit:1sec",
  "Total_Time:300",
  "Increment:5",
  "Delay:1",
  "Least_Time_Per_Move:1",
  "END Time+",
  "BEGIN Time-",
  "Time_Unit:1sec",
  "Total_Time:600",
  "Increment:10",
  "Least_Time_Per_Move:1",
  "END Time-",
  "BEGIN Position",
  "局面1行目",
  "局面2行目",
  "END Position",
  "END Game_Summary",
];

function bindHandlers(client: Client) {
  const handlers = {
    mockOnGameSummary: vi.fn(),
    mockOnReject: vi.fn(),
    mockOnStart: vi.fn(),
    mockOnMove: vi.fn(),
    mockOnGameResult: vi.fn(),
    mockOnClose: vi.fn(),
    mockOnError: vi.fn(),
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

describe("background/csa/client", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("singleGame/winByResign", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
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
    expect(mockSocket.prototype.write.mock.calls[0][0]).toBe("LOGIN TestPlayer test-password");
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 10, delay: 0, increment: 0 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 10, delay: 0, increment: 0 },
        },
      },
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe("AGREE 20150505-CSA25-3-5-7");
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
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(CSASpecialMove.RESIGN);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(CSAGameResult.WIN);
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
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
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(CSASpecialMove.RESIGN);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(CSAGameResult.LOSE);
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
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
    expect(mockSocket.prototype.write.mock.calls[0][0]).toBe("LOGIN TestPlayer test-password");
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 10, delay: 0, increment: 0 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 10, delay: 0, increment: 0 },
        },
      },
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe("AGREE 20150505-CSA25-3-5-7");
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
      "-8384FU,'* 60 +2625FU -8485FU +6978KI -4132KI",
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
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(CSASpecialMove.RESIGN);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(CSAGameResult.WIN);
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
    client.reject("20150505-CSA25-3-5-7");
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe("REJECT 20150505-CSA25-3-5-7");
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary) {
      socketHandlers.onRead(line);
    }
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
    expect(clientHandlers.mockOnGameResult.mock.calls[0][0]).toBe(CSASpecialMove.UNKNOWN);
    expect(clientHandlers.mockOnGameResult.mock.calls[0][1]).toBe(CSAGameResult.CHUDAN);
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
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    expect(clientHandlers.mockOnError).toBeCalledTimes(0);
    expect(mockSocket.prototype.end).toBeCalledTimes(0);
    socketHandlers.onRead("LOGIN:incorrect");
    expect(clientHandlers.mockOnError).toBeCalledTimes(1);
    expect(clientHandlers.mockOnError.mock.calls[0][0].toString()).toBe(
      "Error: CSAサーバーへのログインが拒否されました。",
    );
    expect(mockSocket.prototype.end).toBeCalledTimes(1);
    socketHandlers.onClose(false);
    expect(clientHandlers.mockOnError).toBeCalledTimes(2);
    expect(clientHandlers.mockOnError.mock.calls[1][0].toString()).toBe(
      "Error: CSAサーバーへの接続が切れました。",
    );
  });

  it("failedToConnect", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    expect(clientHandlers.mockOnError).toBeCalledTimes(0);
    expect(clientHandlers.mockOnClose).toBeCalledTimes(0);
    socketHandlers.onClose(true);
    expect(clientHandlers.mockOnError).toBeCalledTimes(1);
    expect(clientHandlers.mockOnError.mock.calls[0][0].toString()).toBe(
      "Error: CSAサーバーに接続できませんでした。",
    );
    expect(clientHandlers.mockOnClose).toBeCalledTimes(1);
  });

  it("increment", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummaryWithIncrement) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 900, byoyomi: 0, delay: 0, increment: 5 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 900, byoyomi: 0, delay: 0, increment: 5 },
        },
      },
      myColor: Color.BLACK,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 905 }, // 900 + 5
      white: { time: 905 }, // 900 + 5
    });
    client.doMove("+7776FU");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T11");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T11");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 899 }, // 905 - 11 + 5
      white: { time: 905 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T8");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T8");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 899 },
      white: { time: 902 }, // 905 - 8 + 5
    });
  });

  it("beginPositionWithMoves", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummaryWithMoves) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 900, byoyomi: 0, delay: 0, increment: 5 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 900, byoyomi: 0, delay: 0, increment: 5 },
        },
      },
      myColor: Color.BLACK,
      toMove: Color.BLACK,
      position:
        "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY\n" +
        "P2 * -HI *  *  *  *  * -KA * \n" +
        "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU\n" +
        "P4 *  *  *  *  *  *  *  *  * \n" +
        "P5 *  *  *  *  *  *  *  *  * \n" +
        "P6 *  *  *  *  *  *  *  *  * \n" +
        "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU\n" +
        "P8 * +KA *  *  *  *  * +HI * \n" +
        "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY\n" +
        "P+\n" +
        "P-\n" +
        "+\n" +
        "+2726FU,T12\n" +
        "-3334FU,T6\n" +
        "+7776FU,T5\n" +
        "-8384FU,T7\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 898 }, // 900 + (5 - 12) + (5 - 5) + 5
      white: { time: 902 }, // 900 + (5 - 6) + (5 - 7) + 5
    });
    client.doMove("+7776FU");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T11");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T11");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 892 }, // 898 - 11 + 5
      white: { time: 902 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T8");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T8");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 892 },
      white: { time: 899 }, // 902 - 8 + 5
    });
  });

  it("timeUnit1msec", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary1msec) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: {
            timeUnitMs: 1,
            totalTime: 900 * 1e3,
            byoyomi: 0,
            delay: 0,
            increment: 5 * 1e3,
          },
        },
        white: {
          playerName: "KITSUNE",
          time: {
            timeUnitMs: 1,
            totalTime: 900 * 1e3,
            byoyomi: 0,
            delay: 0,
            increment: 5 * 1e3,
          },
        },
      },
      myColor: Color.BLACK,
      toMove: Color.BLACK,
      position:
        "P1-KY-KE-GI-KI-OU-KI-GI-KE-KY\n" +
        "P2 * -HI *  *  *  *  * -KA * \n" +
        "P3-FU-FU-FU-FU-FU-FU-FU-FU-FU\n" +
        "P4 *  *  *  *  *  *  *  *  * \n" +
        "P5 *  *  *  *  *  *  *  *  * \n" +
        "P6 *  *  *  *  *  *  *  *  * \n" +
        "P7+FU+FU+FU+FU+FU+FU+FU+FU+FU\n" +
        "P8 * +KA *  *  *  *  * +HI * \n" +
        "P9+KY+KE+GI+KI+OU+KI+GI+KE+KY\n" +
        "P+\n" +
        "P-\n" +
        "+\n" +
        "+2726FU,T12\n" +
        "-3334FU,T6\n" +
        "+7776FU,T5\n" +
        "-8384FU,T7\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 898 * 1e3 }, // 900 + (5 - 12) + (5 - 5) + 5
      white: { time: 902 * 1e3 }, // 900 + (5 - 6) + (5 - 7) + 5
    });
    client.doMove("+7776FU");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T11");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T11");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 892 * 1e3 }, // 898 - 11 + 5
      white: { time: 902 * 1e3 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T8");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T8");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 892 * 1e3 },
      white: { time: 899 * 1e3 }, // 902 - 8 + 5
    });
  });

  it("timeUnit1min", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummary1min) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 60 * 1e3, totalTime: 15, byoyomi: 1, delay: 0, increment: 0 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 60 * 1e3, totalTime: 15, byoyomi: 1, delay: 0, increment: 0 },
        },
      },
      myColor: Color.BLACK,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
    client.agree("20150505-CSA25-3-5-7");
    socketHandlers.onRead("START:20150505-CSA25-3-5-7");
    expect(clientHandlers.mockOnStart).toBeCalledTimes(1);
    expect(clientHandlers.mockOnStart.mock.calls[0][0]).toStrictEqual({
      black: { time: 15 },
      white: { time: 15 },
    });
    client.doMove("+7776FU");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(0);
    socketHandlers.onRead("+7776FU,T60");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    expect(clientHandlers.mockOnMove.mock.calls[0][0]).toBe("+7776FU,T60");
    expect(clientHandlers.mockOnMove.mock.calls[0][1]).toStrictEqual({
      black: { time: 14 },
      white: { time: 15 },
    });
    expect(clientHandlers.mockOnMove).toBeCalledTimes(1);
    socketHandlers.onRead("-3334FU,T120");
    expect(clientHandlers.mockOnMove).toBeCalledTimes(2);
    expect(clientHandlers.mockOnMove.mock.calls[1][0]).toBe("-3334FU,T120");
    expect(clientHandlers.mockOnMove.mock.calls[1][1]).toStrictEqual({
      black: { time: 14 },
      white: { time: 13 },
    });
  });

  it("errorOfStartPosition", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
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
    expect(mockSocket.prototype.write.mock.calls[0][0]).toBe("LOGIN TestPlayer test-password");
    expect(mockSocket.prototype.write).toBeCalledTimes(1);
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummaryInvalidPosition) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(0);
    expect(clientHandlers.mockOnError).toBeCalledTimes(1);
    expect(mockSocket.prototype.write).toBeCalledTimes(2);
    expect(mockSocket.prototype.write.mock.calls[1][0]).toBe("LOGOUT");
  });

  it("unequal_time_settings", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummaryWithUnequalTime) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 300, byoyomi: 10, delay: 0, increment: 0 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 30, delay: 0, increment: 0 },
        },
      },
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
  });

  it("unequal_time_settings_with_increment", async () => {
    const client = new Client(123, csaServerSettings, log4js.getLogger());
    const clientHandlers = bindHandlers(client);
    client.login();
    const socketHandlers = mockSocket.mock.calls[0][2];
    socketHandlers.onConnect();
    socketHandlers.onRead("LOGIN:TestPlayer OK");
    for (const line of mockGameSummaryWithUnequalTimeAndIncremnt) {
      socketHandlers.onRead(line);
    }
    expect(clientHandlers.mockOnGameSummary).toBeCalledTimes(1);
    expect(clientHandlers.mockOnGameSummary.mock.calls[0][0]).toStrictEqual({
      id: "20150505-CSA25-3-5-7",
      players: {
        black: {
          playerName: "TANUKI",
          time: { timeUnitMs: 1000, totalTime: 300, byoyomi: 0, delay: 1, increment: 5 },
        },
        white: {
          playerName: "KITSUNE",
          time: { timeUnitMs: 1000, totalTime: 600, byoyomi: 0, delay: 0, increment: 10 },
        },
      },
      myColor: Color.WHITE,
      toMove: Color.BLACK,
      position: "局面1行目\n局面2行目\n",
    });
  });
});
