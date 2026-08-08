/* eslint-disable no-console */
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
console.log(`Listening on port ${PORT}...`);

// 連続対局では対局ごとに接続しなおすため、Replayer を接続をまたいで共有する。
let socket: net.Socket | undefined;

const replayer = new Replayer(
  steps,
  (line: string) => {
    socket?.write(line + "\n");
  },
  (exitCode) => {
    if (socket) {
      socket.end(() => {
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
  socket = newSocket;

  let buf = "";
  newSocket.on("data", (chunk) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      console.log(`[recv] ${remote}: ${line}`);
      replayer.feed(line);
    }
  });

  newSocket.on("end", () => {
    console.log(`[conn] ${remote} disconnected`);
  });

  newSocket.on("error", (err) => {
    console.warn(`[conn] ${remote} error:`, err.message);
  });

  if (reconnection) {
    replayer.reconnect();
  } else {
    replayer.start();
  }
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

server.listen(PORT);
