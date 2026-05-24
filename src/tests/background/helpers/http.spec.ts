import http from "node:http";
import { promises as fs } from "node:fs";
import { fetch } from "@/background/helpers/http.js";

vi.mock("@/background/helpers/electron.js", () => ({
  getAppVersion: () => "1.2.3",
}));

describe("helpsers/http", () => {
  it("fetch/utf8", async () => {
    const data = await fs.readFile("./src/tests/testdata/http/utf8.txt");
    let userAgent: string | undefined;
    const server = http.createServer((req, res) => {
      if (req.url === "/foo/bar.baz") {
        userAgent = req.headers["user-agent"];
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(data);
      }
    });
    try {
      server.listen(6173);
      const result = await fetch("http://localhost:6173/foo/bar.baz");
      expect(result).toBe("ハロー、ワールド!");
      expect(userAgent).toBe("ShogiHome/1.2.3");
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
