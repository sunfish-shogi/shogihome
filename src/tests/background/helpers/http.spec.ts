import http from "node:http";
import { promises as fs } from "node:fs";
import { fetch } from "@/background/helpers/http.js";

describe("helpsers/http", () => {
  it("fetch/utf8", async () => {
    const data = await fs.readFile("./src/tests/testdata/http/utf8.txt");
    const server = http.createServer((req, res) => {
      if (req.url === "/foo/bar.baz") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(data);
      }
    });
    try {
      server.listen(6173);
      const result = await fetch("http://localhost:6173/foo/bar.baz");
      expect(result).toBe("ハロー、ワールド!");
    } finally {
      server.close();
    }
  });

  it("fetch/sjis", async () => {
    const data = await fs.readFile("./src/tests/testdata/http/sjis.txt");
    const server = http.createServer((req, res) => {
      if (req.url === "/foo/bar.baz") {
        res.writeHead(200, { "Content-Type": "text/plain; charset=Shift_JIS" });
        res.end(data);
      }
    });
    try {
      server.listen(6173);
      const result = await fetch("http://localhost:6173/foo/bar.baz");
      expect(result).toBe("ハロー、Shift_JIS!");
    } finally {
      server.close();
    }
  });
});
