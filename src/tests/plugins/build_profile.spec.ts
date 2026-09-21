import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  defaultBuildProfile,
  loadBuildProfile,
  parseBuildProfile as parse,
  rendererBuildProfile,
} from "@plugins/build_profile.js";

// 相対パスの基準。engines.dirs を使わないケースでは参照されない。
const parseBuildProfile = (json: unknown, baseDir = os.tmpdir()) => parse(json, baseDir);

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

  // 別のリポジトリが public/engines/ へコピーせずにエンジンを組み込むための項目。
  // パスはプロファイルからの相対で書く。
  it("engineDirs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-engines-"));
    fs.mkdirSync(path.join(dir, "engines"));
    expect(parseBuildProfile({ engines: { dirs: ["./engines"] } }, dir).engineDirs).toEqual([
      path.join(dir, "engines"),
    ]);

    // 置いたつもりのエンジンが黙って消えるのを防ぐため、無い場所はビルドを止める。
    expect(() => parseBuildProfile({ engines: { dirs: ["./missing"] } }, dir)).toThrow(
      /engines.dirs\[0\] does not exist/,
    );
    expect(() => parseBuildProfile({ engines: { dirs: "./engines" } }, dir)).toThrow(
      /engines.dirs must be an array/,
    );
    fs.rmSync(dir, { recursive: true });
  });

  // PWA のマニフェストに差す値。指定した項目だけが差し替わる。
  it("pwa", () => {
    const profile = parseBuildProfile({
      pwa: {
        id: "/shogihome-plus/",
        name: "ShogiHome+Example",
        shortName: "ShogiHome+",
        description: "エンジンを組み込んだ ShogiHome",
        themeColor: "#5f8f5f",
        backgroundColor: "#2f4f4f",
        lang: "en",
      },
    });
    expect(profile.pwa).toEqual({
      id: "/shogihome-plus/",
      name: "ShogiHome+Example",
      shortName: "ShogiHome+",
      description: "エンジンを組み込んだ ShogiHome",
      themeColor: "#5f8f5f",
      backgroundColor: "#2f4f4f",
      lang: "en",
    });
    expect(parseBuildProfile({ pwa: { name: "x" } }).pwa).toEqual({ name: "x" });
    expect(parseBuildProfile({}).pwa).toEqual({});

    expect(() => parseBuildProfile({ pwa: { shortname: "x" } })).toThrow(
      /profile.pwa.shortname is not a known/,
    );
    expect(() => parseBuildProfile({ pwa: { name: 1 } })).toThrow(
      /profile.pwa.name must be a non-empty string/,
    );
  });

  // アイコンはプロファイルからの相対で書く。実体が無ければビルドを止める。
  it("pwaIcons", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shogihome-icons-"));
    fs.writeFileSync(path.join(dir, "icon-192.png"), "192");
    fs.writeFileSync(path.join(dir, "icon-512.png"), "512");
    const icons = { "192": "./icon-192.png", "512": "./icon-512.png" };
    expect(parseBuildProfile({ pwa: { icons } }, dir).pwa.icons).toEqual({
      "192": path.join(dir, "icon-192.png"),
      "512": path.join(dir, "icon-512.png"),
    });

    // **片方だけの差し替えは認めない。** 本家のアイコンが混ざった配布物ができるため。
    expect(() => parseBuildProfile({ pwa: { icons: { "192": "./icon-192.png" } } }, dir)).toThrow(
      /profile.pwa.icons.512 must be a non-empty string/,
    );
    expect(() =>
      parseBuildProfile({ pwa: { icons: { ...icons, "256": "./icon-192.png" } } }, dir),
    ).toThrow(/profile.pwa.icons.256 is not a known/);
    expect(() =>
      parseBuildProfile({ pwa: { icons: { ...icons, "512": "./missing.png" } } }, dir),
    ).toThrow(/profile.pwa.icons.512 does not exist/);
    fs.rmSync(dir, { recursive: true });
  });

  // ビルド機のパスは配布物に混ぜない。renderer へ渡すのは features と license だけ。
  it("rendererBuildProfile", () => {
    const profile = parseBuildProfile(validProfile());
    expect(Object.keys(rendererBuildProfile(profile))).toEqual(["features", "license"]);
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

  // サンプルは配布者がそのまま複製する出発点なので、検証を通ることを実物で確かめる。
  // 同じ JSON が仕様書の例としても載っているため、ずれていないことも見る
  // (書式を変えたときに片方だけ直して、複製した側が弾かれるのを防ぐ)。
  it("sample", () => {
    // **サンプルはそのまま読めなければならない。** 複製する前に指定して試せるように、
    // 置いた側でしか成立しない engines.dirs はサンプルに入れない。
    const file = "specs/build-profile.sample.json";
    const profile = loadBuildProfile(file);
    expect(profile.engineDirs).toEqual([]);
    expect(profile.features.mobileSearchTab).toBe(true);
    expect(profile.license.distribution?.text).toBeTruthy();
    expect(profile.license.distribution?.url).toBeTruthy();
    expect(profile.license.distribution?.sourceURL).toBeTruthy();
    expect(profile.license.thirdPartyURL).toBeTruthy();
    expect(profile.pwa.id).toBeTruthy();
    expect(profile.pwa.name).toBeTruthy();

    const doc = fs.readFileSync("specs/build-profile.md", "utf8");
    expect(doc.match(/```json\n([\s\S]*?)```/)?.[1]).toBe(fs.readFileSync(file, "utf8"));
  });
});
