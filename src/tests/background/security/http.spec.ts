import { Mock } from "vitest";
import { handleApp, handleUserFile, validateHTTPRequest } from "@/background/security/http";

vi.mock("electron", () => {
  return {
    net: { fetch: vi.fn() },
  };
});

import { net } from "electron";

describe("security/http", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("handleApp", async () => {
    const rootDirPrefix = process.platform === "win32" ? "Z:/" : "";
    vi.stubGlobal("process", {
      resourcesPath: rootDirPrefix + "/path/to/resources",
      env: { ...process.env, NODE_ENV: "production" },
    });
    (net.fetch as Mock).mockResolvedValue(new Response("ok"));

    const validURLs = [
      {
        url: "app://bundle/foo/bar.baz",
        fileURL: `file:///${rootDirPrefix}path/to/resources/app.asar/dist/foo/bar.baz`,
      },
      {
        url: "app://bundle/foo/../bar.baz",
        fileURL: `file:///${rootDirPrefix}path/to/resources/app.asar/dist/bar.baz`,
      },
    ];
    for (const { url, fileURL } of validURLs) {
      const promise = handleApp(new Request(url));
      expect(promise).toBeInstanceOf(Promise);
      const response = await promise;
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(200);
      expect(net.fetch).lastCalledWith(fileURL);
    }

    const invalidMethods = ["POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
    for (const method of invalidMethods) {
      const response = handleApp(new Request(validURLs[0].url, { method }));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(405);
    }

    const unsafeURLs = ["app://bundle/", "app://bundle/foo/%2e%2e"];
    for (const url of unsafeURLs) {
      const response = handleApp(new Request(url));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(400);
    }

    const invalidHosts = ["app://", "app://foo", "app://localhost", "app://bundle2"];
    for (const url of invalidHosts) {
      const response = handleApp(new Request(url));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(404);
    }
  });

  it("handleUserFile", async () => {
    vi.stubGlobal("process", {
      env: { ...process.env, NODE_ENV: "production" },
    });
    (net.fetch as Mock).mockResolvedValue(new Response("ok"));

    const validURLs = [
      { url: "user-file://localhost/userdata/hoge.png", fileURL: "file:///userdata/hoge.png" },
      { url: "user-file://localhost/userdata/foo/../bar.jpg", fileURL: "file:///userdata/bar.jpg" },
      { url: "user-file://localhost/userdata/foo.jpeg", fileURL: "file:///userdata/foo.jpeg" },
      {
        url: "user-file://localhost/../userdata/foo/bar.jpg",
        fileURL: "file:///userdata/foo/bar.jpg",
      },
    ];
    for (const { url, fileURL } of validURLs) {
      const promise = handleUserFile(new Request(url));
      expect(promise).toBeInstanceOf(Promise);
      const response = await promise;
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(200);
      expect(net.fetch).lastCalledWith(fileURL);
    }

    const invalidMethods = ["POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
    for (const method of invalidMethods) {
      const response = handleUserFile(new Request(validURLs[0].url, { method }));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(405);
    }

    const disallowedExtensions = [
      "user-file://localhost/userdata/hoge.txt",
      "user-file://localhost/userdata/foo.pdf",
      "user-file://localhost/userdata/bar.docx",
      "user-file://localhost/userdata/baz.mp3",
      "user-file://localhost/userdata/qux.mp4",
      "user-file://localhost/userdata/exec.exe",
      "user-file://localhost/userdata/script.sh",
    ];
    for (const url of disallowedExtensions) {
      const response = handleUserFile(new Request(url));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(403);
    }

    const invalidHosts = ["user-file://", "user-file://foo", "user-file://localhost2"];
    for (const url of invalidHosts) {
      const response = handleUserFile(new Request(url));
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(404);
    }
  });

  it("validateHTTPRequest/allowed", () => {
    validateHTTPRequest("GET", "app://bundle/foo/bar.baz");
    validateHTTPRequest("GET", "user-file://localhost/userdata/hoge.png");
    validateHTTPRequest("GET", "devtools://devtools/bundled/index.html");
    validateHTTPRequest("GET", "devtools://foo/bar/baz.qux");
  });

  it("validateHTTPRequest/notAllowed", () => {
    // http, https, file, ws not allowed
    expect(() => validateHTTPRequest("GET", "http://localhost:1234/foo/bar.baz")).toThrow();
    expect(() => validateHTTPRequest("GET", "https://localhost:1234/foo/bar.baz")).toThrow();
    expect(() =>
      validateHTTPRequest("GET", "file:///home/shogi/apps/shogihome/assets.asr"),
    ).toThrow();
    expect(() => validateHTTPRequest("GET", "ws://localhost:1234/foo/bar.baz")).toThrow();
    // unknown hostname
    expect(() => validateHTTPRequest("GET", "http://foo.bar/baz/qux.quux")).toThrow();
    // method not allowed
    expect(() => validateHTTPRequest("POST", "app://bundle/foo/bar.baz")).toThrow();
    expect(() => validateHTTPRequest("DELETE", "app://bundle/foo/bar.baz")).toThrow();
  });
});
