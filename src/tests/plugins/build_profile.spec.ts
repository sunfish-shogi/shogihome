import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultBuildProfile,
  loadBuildProfile,
  parseBuildProfile,
} from "@plugins/build_profile.js";

const validProfile = () => ({
  features: { mobileSearchTab: true },
  license: {
    distribution: {
      text: "ShogiHome+Example (GPLv3)",
      url: "https://example.com/LICENSE",
      sourceURL: "https://example.com/src",
    },
    thirdPartyURL: "https://example.com/third-party-licenses.html",
  },
});

describe("plugins/build_profile", () => {
  it("valid", () => {
    const profile = parseBuildProfile(validProfile());
    expect(profile.features.mobileSearchTab).toBe(true);
    expect(profile.license.distribution).toEqual({
      text: "ShogiHome+Example (GPLv3)",
      url: "https://example.com/LICENSE",
      sourceURL: "https://example.com/src",
    });
    expect(profile.license.thirdPartyURL).toBe("https://example.com/third-party-licenses.html");
  });

  // 指定の無い項目は既定値のまま。通常のビルドの挙動を変えないための前提。
  it("empty", () => {
    expect(parseBuildProfile({})).toEqual(defaultBuildProfile());
    expect(loadBuildProfile(undefined)).toEqual(defaultBuildProfile());
    expect(defaultBuildProfile().features.mobileSearchTab).toBe(false);
    expect(defaultBuildProfile().license).toEqual({});
  });

  // 書き間違いを黙って無視すると、設定したつもりの項目が効かないまま配布物ができる。
  it("rejectsUnknownKeys", () => {
    expect(() => parseBuildProfile({ feature: {} })).toThrow(/profile.feature is not a known/);
    expect(() => parseBuildProfile({ features: { mobileSearchTabs: true } })).toThrow(
      /profile.features.mobileSearchTabs is not a known/,
    );
    expect(() =>
      parseBuildProfile({
        license: { distribution: { text: "x", url: "https://e.com", src: "y" } },
      }),
    ).toThrow(/profile.license.distribution.src is not a known/);
  });

  it("rejectsInvalidTypes", () => {
    expect(() => parseBuildProfile([])).toThrow(/profile must be an object/);
    expect(() => parseBuildProfile({ features: { mobileSearchTab: "true" } })).toThrow(
      /must be a boolean/,
    );
    expect(() =>
      parseBuildProfile({ license: { distribution: { url: "https://e.com" } } }),
    ).toThrow(/distribution.text must be a non-empty string/);
  });

  // リンクとして開く値なので、URL として成立していることまで確かめる
  // (エンジンのマニフェストの source と同じ扱い)。
  it("rejectsInvalidURLs", () => {
    const withURL = (url: string) => ({ license: { distribution: { text: "x", url } } });
    expect(() => parseBuildProfile(withURL("https://"))).toThrow(/must be a valid URL/);
    expect(() => parseBuildProfile(withURL("example.com"))).toThrow(/must be a valid URL/);
    expect(() => parseBuildProfile(withURL("http://example.com"))).toThrow(
      /must be an https URL with a host/,
    );
    expect(() => parseBuildProfile(withURL("javascript:alert(1)"))).toThrow(
      /must be an https URL with a host/,
    );
    expect(() => parseBuildProfile({ license: { thirdPartyURL: "file:///etc/passwd" } })).toThrow(
      /must be an https URL with a host/,
    );
  });

  it("loadBuildProfile", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-profile-"));
    const file = path.join(dir, "profile.json");
    fs.writeFileSync(file, JSON.stringify(validProfile()));
    expect(loadBuildProfile(file).features.mobileSearchTab).toBe(true);

    // 指定したファイルが無い・壊れている場合は黙って既定値にせず、ビルドを止める。
    expect(() => loadBuildProfile(path.join(dir, "missing.json"))).toThrow(
      /build profile not found/,
    );
    fs.writeFileSync(file, "{");
    expect(() => loadBuildProfile(file)).toThrow(/failed to parse build profile/);
    fs.rmSync(dir, { recursive: true });
  });
});
