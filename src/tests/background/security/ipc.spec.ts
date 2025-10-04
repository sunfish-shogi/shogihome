import { validateIPCSender } from "@/background/security/ipc.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("security/ipc", () => {
  it("validateIPCSender/allowed", () => {
    validateIPCSender({ url: "app://bundle/foo/bar.baz" } as any);
    validateIPCSender(null);
  });

  it("validateIPCSender/notAllowed", () => {
    // hostname must be bundle
    expect(() => validateIPCSender({ url: "app://localhost/foo/bar.baz" } as any)).toThrow();
    // http, https, file, user-file not allowed
    expect(() => validateIPCSender({ url: "http://localhost:1234/foo/bar.baz" } as any)).toThrow();
    expect(() => validateIPCSender({ url: "https://localhost:1234/foo/bar.baz" } as any)).toThrow();
    expect(() =>
      validateIPCSender({ url: "file:///home/shogi/apps/shogihome/assets.asr" } as any),
    ).toThrow();
    expect(() =>
      validateIPCSender({ url: "user-file:///home/shogi/apps/shogihome/assets.asr" } as any),
    ).toThrow();
  });
});
