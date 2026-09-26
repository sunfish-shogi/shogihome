import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const fileNames = [
  "release.json",
  "release-win.json",
  "release-mac.json",
  "release-linux.json",
  // デスクトップ版のダウンロード一覧 (specs/wasm-engine-desktop.md)。
  "engine-index.json",
];

// 一覧が相対 URL で指す本家のエンジンの配信物。一覧のハッシュは docs/webapp/ の中身から
// 求めているため、public/engines/ ではなくこちらを返す。
const webappEnginesDir = path.resolve("docs/webapp/engines");

const server = http.createServer((req, res) => {
  for (const fileName of fileNames) {
    if (req.url === `/${fileName}`) {
      const data = fs.readFileSync(`docs/${fileName}`, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
      return;
    }
  }
  const matched = /^\/webapp\/engines\/(.+)$/.exec(req.url || "");
  if (matched) {
    let file;
    try {
      file = path.resolve(webappEnginesDir, decodeURIComponent(matched[1]));
    } catch {
      file = undefined;
    }
    if (file && file.startsWith(webappEnginesDir + path.sep) && fs.existsSync(file)) {
      res.writeHead(200);
      res.end(fs.readFileSync(file));
      return;
    }
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(6173);
