/* eslint-disable no-console */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { parseScript, Replayer } from "./replayer";

const COMMAND_FILE = process.argv[2];
const PORT = Number(process.argv[3] || 4081);

if (!COMMAND_FILE) {
  console.error("Usage: tsx csa-replay-server.ts <command-list> [port]");
  process.exit(1);
}

const steps = parseScript(path.resolve(COMMAND_FILE));
console.log(`Loaded ${steps.length} steps from ${COMMAND_FILE}`);

// 直前の接続の切断を待つ時間。これを超えた場合はテストを失敗させる。
const previousCloseTimeoutMs = 10e3;

type Connection = {
  socket: net.Socket;
  closed: boolean;
};

// 連続対局では対局ごとに接続しなおすため、Replayer を接続をまたいで共有する。
let current: Connection | undefined;

const replayer = new Replayer(
  steps,
  (line: string) => {
    current?.socket.write(line + "\n");
  },
  (exitCode) => {
    if (current && !current.closed) {
      current.socket.end(() => {
        process.exit(exitCode);
      });
    } else {
      process.exit(exitCode);
    }
  },
);

const server = net.createServer((newSocket) => {
  newSocket.setEncoding("utf8");
  const remote = `${newSocket.remoteAddress}:${newSocket.remotePort}`;
  console.log(`[conn] ${remote} connected`);

  const reconnection = replayer.isWaitingReconnect;
  const previous = current;
  const connection: Connection = { socket: newSocket, closed: false };
  current = connection;

  // 直前の接続の切断を待っている間に届いた行は、スクリプトを再開してから処理する。
  const pending: string[] = [];
  let resumed = false;
  const drain = () => {
    while (resumed && pending.length > 0) {
      replayer.feed(pending.shift() as string);
    }
  };

  let buf = "";
  newSocket.on("data", (chunk) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      console.log(`[recv] ${remote}: ${line}`);
      pending.push(line);
    }
    drain();
  });

  newSocket.on("end", () => {
    console.log(`[conn] ${remote} disconnected`);
  });

  newSocket.on("close", () => {
    connection.closed = true;
  });

  newSocket.on("error", (err) => {
    console.warn(`[conn] ${remote} error:`, err.message);
  });

  const resume = (reconnection: boolean) => {
    if (reconnection) {
      replayer.reconnect();
    } else {
      replayer.start();
    }
    resumed = true;
    drain();
  };

  if (!reconnection) {
    resume(false);
    return;
  }

  // disconnect ステップは直前の接続が実際に切断されたことを確認してから消化する。
  // 確認せずに消化すると、切断しないまま再接続する不具合を検出できない。
  if (!previous || previous.closed) {
    resume(true);
    return;
  }
  console.log("[conn] waiting for the previous connection to be closed");
  const timer = setTimeout(() => {
    console.warn("ERR previous connection was not closed\n");
    process.exit(1);
  }, previousCloseTimeoutMs);
  previous.socket.once("close", () => {
    clearTimeout(timer);
    resume(true);
  });
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  // 待ち受けの開始を run スクリプトに知らせる。
  const readyFile = process.env.READY_FILE;
  if (readyFile) {
    fs.writeFileSync(readyFile, "");
  }
});
