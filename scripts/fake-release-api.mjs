import http from "node:http";
import fs from "node:fs";

const fileNames = ["release.json", "release-win.json", "release-mac.json", "release-linux.json"];

const server = http.createServer((req, res) => {
  for (const fileName of fileNames) {
    if (req.url === `/${fileName}`) {
      const data = fs.readFileSync(`docs/${fileName}`, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
      return;
    }
  }
  // GitHub API (GET /repos/{owner}/{repo}/releases/tags/{tag}) の代替
  const match = req.url.match(/^\/api\/repos\/[^/]+\/[^/]+\/releases\/tags\/([^/]+)$/);
  if (match) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        tag_name: decodeURIComponent(match[1]),
        draft: false,
        published_at: "2000-01-01T00:00:00Z",
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(6173);
